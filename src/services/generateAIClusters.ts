import * as GenAI from "@google/genai";
import type { AICluster, PaperRecord } from "../types";
import { withRetry } from "./geminiRetry";

/**
 * 1. Handle non-standard @google/genai exports
 */
const AnyGenAI = GenAI as any;
const GoogleGenerativeAIClass = AnyGenAI.GoogleGenerativeAI || AnyGenAI.default?.GoogleGenerativeAI;
const SchemaType = AnyGenAI.SchemaType || AnyGenAI.default?.SchemaType;

/**
 * 2. Centralized Key Detection
 */
const rawKey = (import.meta.env?.VITE_GEMINI_API_KEY) || (process.env?.GEMINI_API_KEY) || "";
const GEMINI_API_KEY = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

const genAI = (GEMINI_API_KEY && GoogleGenerativeAIClass) ? new GoogleGenerativeAIClass(GEMINI_API_KEY) : null;

/**
 * 3. Structured Output Schema
 */
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

// ... [Keep your normalizeLabel and safeFallbackClusters helpers as they are] ...

export async function generateAIClusters(
  papers: PaperRecord[],
): Promise<AICluster[]> {
  if (!papers.length) return [];

  if (!genAI || !GEMINI_API_KEY) {
    console.warn("Missing GEMINI_API_KEY or initialization failed, using local fallback.");
    return safeFallbackClusters(papers);
  }

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "You are a research clustering assistant. Always return a valid JSON object. Do not include markdown formatting.",
  });

  const prompt = `[Your Clustering Prompt Here]`; 

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

    // Safer text extraction for the non-standard package
    const rawText = typeof result.response.text === 'function' 
      ? result.response.text() 
      : (result.response as any).text;
    
    // ... [Keep your extractJsonObject, normalization, and missing-id logic] ...
    return normalized.length ? normalized : safeFallbackClusters(papers);
  } catch (error) {
    console.error("Gemini Clustering Error:", error);
    return safeFallbackClusters(papers);
  }
}
