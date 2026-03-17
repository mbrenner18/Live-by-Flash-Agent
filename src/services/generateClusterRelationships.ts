import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { ClusterRecord } from "../types";
import { withRetry } from "./geminiRetry";

export type ClusterRelationshipType = "agreement" | "disagreement" | "weak";

export type ClusterRelationship = {
  source: string;
  target: string;
  type: ClusterRelationshipType;
  reason?: string;
};

// Use the robust key check to prevent the "Black Screen"
const rawKey = (import.meta.env?.VITE_GEMINI_API_KEY) || (process.env?.GEMINI_API_KEY) || "";
const GEMINI_API_KEY = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

/**
 * Logic for Structured Output Schema
 */
const relationshipSchema = {
  description: "List of relationships between research clusters",
  type: SchemaType.OBJECT,
  properties: {
    relationships: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          source: { type: SchemaType.STRING },
          target: { type: SchemaType.STRING },
          type: { 
            type: SchemaType.STRING, 
            enum: ["agreement", "disagreement", "weak"] 
          },
          reason: { type: SchemaType.STRING }
        },
        required: ["source", "target", "type", "reason"]
      }
    }
  },
  required: ["relationships"]
};

// ... [Keep your safeFallbackRelationships and extraction helpers as they are] ...

export async function generateClusterRelationships(
  clusters: Pick<ClusterRecord, "id" | "theme" | "papers">[],
): Promise<ClusterRelationship[]> {
  if (clusters.length < 2) return [];

  // Safety check for initialization
  if (!genAI || !GEMINI_API_KEY) {
    console.warn("Gemini not initialized, using fallback relationships.");
    return safeFallbackRelationships(clusters);
  }

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash", // Use a valid model name
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: relationshipSchema,
    }
  });

  const prompt = `[Your Prompt Text Here]`; // Keep your existing prompt

  try {
    const result = await withRetry(() => 
      model.generateContent(prompt)
    );

    // The SDK provides a helper to get text from the response
    const rawText = result.response.text();
    const parsed = JSON.parse(rawText);
    
    // ... [Keep your normalization and validation logic] ...
    
    return normalized;
  } catch (error) {
    console.error("Gemini relationship generation failed:", error);
    return safeFallbackRelationships(clusters);
  }
}
