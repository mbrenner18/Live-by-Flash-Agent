import * as GenAI from "@google/genai";
import type { AICluster, PaperRecord } from "../types";
import { withRetry } from "./geminiRetry";

const AnyGenAI = GenAI as any;
const GoogleGenerativeAIClass = AnyGenAI.GoogleGenerativeAI || AnyGenAI.default?.GoogleGenerativeAI;
const SchemaType = AnyGenAI.SchemaType || AnyGenAI.default?.SchemaType;

const rawKey = (import.meta.env?.VITE_GEMINI_API_KEY) || (process.env?.GEMINI_API_KEY) || "";
const GEMINI_API_KEY = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

const genAI = (GEMINI_API_KEY && GoogleGenerativeAIClass) ? new GoogleGenerativeAIClass(GEMINI_API_KEY) : null;

/**
 * 1. MISSING HELPERS (The "Safety Net")
 * These prevent the "ReferenceError: safeFallbackClusters is not defined" crash.
 */
function normalizeLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

function safeFallbackClusters(papers: PaperRecord[]): AICluster[] {
  console.log("[DEBUG] Using local fallback clustering logic.");
  if (!papers.length) return [];
  
  // Group by broad category or just return one big group to keep the UI alive
  return [{
    id: 'fallback-cluster',
    label: 'Research Papers',
    subtitle: `${papers.length} papers identified`,
    paperIds: papers.map(p => p.id),
    color: 'var(--primary)'
  }];
}

const clusterSchema = {
  type: SchemaType?.OBJECT || "OBJECT",
  properties: {
    clusters: {
      type: SchemaType?.ARRAY || "ARRAY",
      items: {
        type: SchemaType?.OBJECT || "OBJECT",
        properties: {
          label: { type: SchemaType?.STRING || "STRING" },
          subtitle: { type: SchemaType?.STRING || "STRING" },
          paperIds: {
            type: SchemaType?.ARRAY || "ARRAY",
            items: { type: SchemaType?.STRING || "STRING" }
          }
        },
        required: ["label", "subtitle", "paperIds"]
      }
    }
  },
  required: ["clusters"]
};

export async function generateAIClusters(
  papers: PaperRecord[],
): Promise<AICluster[]> {
  if (!papers.length) return [];

  // If API key is missing, we use the fallback instead of throwing an error
  if (!genAI || !GEMINI_API_KEY) {
    console.warn("Missing GEMINI_API_KEY, using local fallback.");
    return safeFallbackClusters(papers);
  }

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
  });

  const prompt = `Analyze these research papers and group them into logical clusters:
    ${papers.map(p => `ID: ${p.id}, Title: ${p.title}`).join('\n')}
    Return JSON with "clusters" array.`; 

  try {
    const result = await withRetry(() => 
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: clusterSchema,
        },
      })
    );

    const response = await result.response;
    const rawText = response.text();
    const data = JSON.parse(rawText);

    if (!data.clusters) return safeFallbackClusters(papers);

    return data.clusters.map((c: any, index: number) => ({
      id: `cluster-${index}`,
      label: normalizeLabel(c.label),
      subtitle: c.subtitle,
      paperIds: c.paperIds,
      color: `hsl(${(index * 137) % 360}, 70%, 50%)`
    }));
