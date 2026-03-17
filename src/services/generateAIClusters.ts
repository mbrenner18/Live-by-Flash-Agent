import { GoogleGenerativeAI, SchemaType } from "@google/genai";
import type { AICluster, PaperRecord } from "../types";
import { withRetry } from "./geminiRetry";

/**
 * 1. Centralized Key Detection
 * Ensuring we check VITE_ prefixed variables for the browser.
 */
const rawKey = (import.meta.env?.VITE_GEMINI_API_KEY) || (process.env?.GEMINI_API_KEY) || "";
const GEMINI_API_KEY = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

/**
 * 2. Structured Output Schema
 * Using SchemaType (the correct export from @google/generative-ai)
 */
const clusterSchema = {
  type: SchemaType.OBJECT,
  properties: {
    clusters: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          label: { type: SchemaType.STRING },
          subtitle: { type: SchemaType.STRING },
          paperIds: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING }
          }
        },
        required: ["label", "subtitle", "paperIds"]
      }
    }
  },
  required: ["clusters"]
};

// ... [Keep your normalizeLabel and safeFallbackClusters helpers as they are] ...

export async function generateAIClusters(
  papers: PaperRecord[],
): Promise<AICluster[]> {
  if (!papers.length) return [];

  if (!genAI || !GEMINI_API_KEY) {
    console.warn("Missing GEMINI_API_KEY, using local fallback clusters.");
    return safeFallbackClusters(papers);
  }

  // Use a valid model name like 'gemini-1.5-flash' or 'gemini-2.0-flash'
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "You are a research clustering assistant. Always return a valid JSON object. Do not include markdown formatting.",
  });

  const prompt = `[Your Clustering Prompt Here]`; // Keep your existing prompt

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

    // Simplest way to get the response text
    const rawText = result.response.text();
    
    // Use your existing extractJsonObject logic for safety
    const parsed = extractJsonObject(rawText);
    const clusters = Array.isArray(parsed?.clusters) ? parsed.clusters : [];

    // ... [Keep your normalization, deduplication, and missing-id logic] ...

    return normalized.length ? normalized : safeFallbackClusters(papers);
  } catch (error) {
    console.error("Gemini Clustering Error:", error);
    return safeFallbackClusters(papers);
  }
}
