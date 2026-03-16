import { GoogleGenAI, Type } from "@google/genai";
import type { AICluster, PaperRecord } from "../types";
import { withRetry } from "./geminiRetry";

// Ensure your .env has GEMINI_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function normalizeLabel(label: string): string {
  return label
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (s) => s.toUpperCase());
}

function safeFallbackClusters(papers: PaperRecord[]): AICluster[] {
  if (!papers.length) return [];

  // Better fallback: cluster by theme first
  const byTheme = new Map<string, string[]>();

  for (const paper of papers) {
    const rawTheme =
      typeof paper.theme === "string" && paper.theme.trim()
        ? paper.theme.trim()
        : "General Research";

    const theme = normalizeLabel(rawTheme);

    if (!byTheme.has(theme)) {
      byTheme.set(theme, []);
    }

    byTheme.get(theme)!.push(paper.id);
  }

  const clusters: AICluster[] = Array.from(byTheme.entries()).map(
    ([label, paperIds]) => ({
      label,
      paperIds,
    }),
  );

  return clusters.length
    ? clusters
    : [
        {
          label: "General Research",
          paperIds: papers.map((p) => p.id),
        },
      ];
}

function extractResponseText(response: any): string {
  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text.trim();
  }

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const joined = parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return joined;
}

function extractJsonObject(raw: string): any {
  // Remove markdown code blocks if present
  let cleaned = raw.replace(/```json|```/g, "").trim();

  // Attempt to find the first '{' and last '}' to isolate the JSON object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("Initial JSON parse failed, attempting recovery:", err);
    
    try {
      // Very basic recovery for common issues like trailing commas before closing braces/brackets
      const recovered = cleaned
        .replace(/,\s*([\]}])/g, "$1") // Remove trailing commas
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'); // Ensure keys are double-quoted
      
      return JSON.parse(recovered);
    } catch (innerErr) {
      console.error("JSON recovery failed:", innerErr);
    }

    throw new Error("No valid JSON object found in model response.");
  }
}

export async function generateAIClusters(
  papers: PaperRecord[],
): Promise<AICluster[]> {
  if (!papers.length) return [];

  if (!GEMINI_API_KEY) {
    console.warn("Missing GEMINI_API_KEY, using local fallback clusters.");
    return safeFallbackClusters(papers);
  }

  const prompt = `
Cluster the following papers by semantic similarity using:
- title
- abstract
- theme
- citation
- locationLabel only if relevant

Rules:
1. Every paper id must appear in exactly one cluster.
2. Prefer 3 to 5 meaningful clusters when possible.
3. Do NOT merge distinct strategies such as:
   - infrastructure
   - ecological adaptation
   - urban planning
   - policy
   - resilience
4. Use short, human-readable labels.
5. Provide a subtitle (2-3 words) for each cluster that describes its conceptual territory (e.g. "urban adaptation", "policy / recovery", "ecological design", "engineering / economics").
6. Do not create duplicate or near-duplicate clusters.
7. If papers are too broad, use sensible umbrella topics.

Papers to cluster:
${JSON.stringify(
  papers.map((p) => ({
    id: p.id,
    title: p.title,
    abstract: p.abstract ?? "",
    theme: p.theme ?? "",
    citation: p.citation ?? "",
    locationLabel: p.locationLabel ?? "",
    year: p.year ?? null,
  })),
  null,
  2,
)}
`.trim();

  try {
    const response = await withRetry(() => 
      ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: "You are a research clustering assistant. Always return a valid JSON object matching the requested schema. Do not include any markdown formatting or extra text.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clusters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    subtitle: { type: Type.STRING },
                    paperIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["label", "subtitle", "paperIds"]
                }
              }
            },
            required: ["clusters"]
          }
        },
      })
    );

    const rawText = extractResponseText(response);
    const parsed = extractJsonObject(rawText);
    const clusters = Array.isArray(parsed?.clusters) ? parsed.clusters : [];

    const validPaperIds = new Set(papers.map((p) => p.id));
    const seen = new Set<string>();

    const normalized: AICluster[] = clusters
      .map((cluster: any, index: number) => {
        const label =
          typeof cluster?.label === "string" && cluster.label.trim()
            ? normalizeLabel(cluster.label)
            : `Cluster ${index + 1}`;

        const paperIds = Array.isArray(cluster?.paperIds)
          ? cluster.paperIds.filter(
              (id: unknown): id is string =>
                typeof id === "string" &&
                validPaperIds.has(id) &&
                !seen.has(id),
            )
          : [];

        paperIds.forEach((id) => seen.add(id));

        return { 
          label, 
          paperIds,
          subtitle: typeof cluster?.subtitle === "string" ? cluster.subtitle.toLowerCase() : undefined
        };
      })
      .filter((cluster) => cluster.paperIds.length > 0);

    const missing = papers
      .map((p) => p.id)
      .filter((id) => !seen.has(id));

    if (missing.length > 0) {
      const fallbackForMissing = safeFallbackClusters(
        papers.filter((p) => missing.includes(p.id)),
      );

      normalized.push(...fallbackForMissing);
    }

    return normalized.length ? normalized : safeFallbackClusters(papers);
  } catch (error) {
    console.error("Gemini Clustering Error:", error);
    return safeFallbackClusters(papers);
  }
}
