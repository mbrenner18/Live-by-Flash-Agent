import { GoogleGenAI, Type } from "@google/genai";
import type { ClusterRecord } from "../types";
import { withRetry } from "./geminiRetry";

export type ClusterRelationshipType = "agreement" | "disagreement" | "weak";

export type ClusterRelationship = {
  source: string;
  target: string;
  type: ClusterRelationshipType;
  reason?: string;
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function safeFallbackRelationships(
  clusters: Pick<ClusterRecord, "id" | "theme" | "papers">[],
): ClusterRelationship[] {
  const relationships: ClusterRelationship[] = [];

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i];
      const b = clusters[j];

      const aText = `${a.theme} ${a.papers.map((p) => p.theme ?? "").join(" ")}`.toLowerCase();
      const bText = `${b.theme} ${b.papers.map((p) => p.theme ?? "").join(" ")}`.toLowerCase();

      const bothResilience =
        (aText.includes("resilience") || aText.includes("recovery")) &&
        (bText.includes("resilience") || bText.includes("recovery"));

      const bothCoastal =
        (aText.includes("coastal") || aText.includes("shoreline")) &&
        (bText.includes("coastal") || bText.includes("shoreline"));

      const bothEngineering =
        (aText.includes("engineering") || aText.includes("infrastructure")) &&
        (bText.includes("engineering") || bText.includes("infrastructure"));

      const tension =
        (aText.includes("engineering") && bText.includes("shoreline")) ||
        (aText.includes("shoreline") && bText.includes("engineering")) ||
        (aText.includes("urban") && bText.includes("nature")) ||
        (aText.includes("nature") && bText.includes("urban"));

      relationships.push({
        source: a.id,
        target: b.id,
        type: bothResilience || bothCoastal || bothEngineering
          ? "agreement"
          : tension
            ? "disagreement"
            : "weak",
        reason: bothResilience || bothCoastal || bothEngineering
          ? "Fallback rule found thematic overlap."
          : tension
            ? "Fallback rule found a likely strategy tradeoff."
            : "Fallback rule found only a weak relationship.",
      });
    }
  }

  return relationships;
}

function extractResponseText(response: any): string {
  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text.trim();
  }

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function extractJsonObject(raw: string): any {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("Initial JSON parse failed, attempting recovery:", err);
    
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (innerErr) {
        console.error("JSON recovery failed:", innerErr);
      }
    }
    throw new Error("No valid JSON object found in model response.");
  }
}

function normalizeRelationshipType(value: unknown): ClusterRelationshipType {
  if (value === "agreement" || value === "disagreement" || value === "weak") {
    return value;
  }
  return "weak";
}

export async function generateClusterRelationships(
  clusters: Pick<ClusterRecord, "id" | "theme" | "papers">[],
): Promise<ClusterRelationship[]> {
  if (clusters.length < 2) return [];

  if (!GEMINI_API_KEY) {
    console.warn("Missing GEMINI_API_KEY, using fallback relationships.");
    return safeFallbackRelationships(clusters);
  }

  const prompt = `
You are a research synthesis assistant.

Your task is to infer the relationship between clusters of papers.

For each pair of clusters, decide exactly one relationship type:
- "agreement" = the clusters reinforce, support, or align with each other
- "disagreement" = the clusters reflect a tradeoff, tension, conflict, or competing strategy
- "weak" = the clusters are only loosely related or the relationship is uncertain

Rules:
1. Evaluate every pair of clusters exactly once.
2. Use the paper titles, abstracts, and themes to infer the relationship.
3. When two clusters reinforce similar strategies, use "agreement".
4. When two clusters represent competing or alternative approaches, use "disagreement".
5. Use "weak" only when there is little conceptual relationship.
6. Use cluster ids exactly as provided.

Clusters:
${JSON.stringify(
  clusters.map((cluster) => ({
    id: cluster.id,
    theme: cluster.theme,
    papers: cluster.papers.map((paper) => ({
      id: paper.id,
      title: paper.title,
      abstract: paper.abstract ?? "",
      theme: paper.theme ?? "",
      citation: paper.citation ?? "",
      year: paper.year ?? null,
    })),
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
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              relationships: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                    type: { 
                      type: Type.STRING,
                      enum: ["agreement", "disagreement", "weak"]
                    },
                    reason: { type: Type.STRING }
                  },
                  required: ["source", "target", "type", "reason"]
                }
              }
            },
            required: ["relationships"]
          }
        },
      })
    );

    const rawText = extractResponseText(response);
    const parsed = extractJsonObject(rawText);
    const relationships = Array.isArray(parsed?.relationships)
      ? parsed.relationships
      : [];

    const validIds = new Set(clusters.map((c) => c.id));
    const expectedPairs = new Set<string>();

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        expectedPairs.add([clusters[i].id, clusters[j].id].sort().join("::"));
      }
    }

    const seenPairs = new Set<string>();

    const normalized: ClusterRelationship[] = relationships
      .map((rel: any) => {
        const source = typeof rel?.source === "string" ? rel.source : "";
        const target = typeof rel?.target === "string" ? rel.target : "";

        if (!validIds.has(source) || !validIds.has(target) || source === target) {
          return null;
        }

        const pairKey = [source, target].sort().join("::");
        if (seenPairs.has(pairKey)) {
          return null;
        }

        seenPairs.add(pairKey);

        return {
          source,
          target,
          type: normalizeRelationshipType(rel?.type),
          reason:
            typeof rel?.reason === "string" && rel.reason.trim()
              ? rel.reason.trim()
              : undefined,
        };
      })
      .filter((rel): rel is ClusterRelationship => !!rel);

    if (normalized.length !== expectedPairs.size) {
      const fallbackMap = new Map(
        safeFallbackRelationships(clusters).map((rel) => [
          [rel.source, rel.target].sort().join("::"),
          rel,
        ]),
      );

      for (const pairKey of expectedPairs) {
        if (!seenPairs.has(pairKey)) {
          const fallback = fallbackMap.get(pairKey);
          if (fallback) {
            normalized.push(fallback);
          }
        }
      }
    }

    return normalized;
  } catch (error) {
    console.error("Gemini relationship generation failed:", error);
    return safeFallbackRelationships(clusters);
  }
}