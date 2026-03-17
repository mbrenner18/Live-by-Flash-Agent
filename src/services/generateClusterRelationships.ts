import * as GenAI from "@google/genai";
import type { ClusterRecord } from "../types";
import { withRetry } from "./geminiRetry";

/**
 * 1. Handle non-standard @google/genai exports
 */
const AnyGenAI = GenAI as any;
const GoogleGenerativeAIClass = AnyGenAI.GoogleGenerativeAI || AnyGenAI.default?.GoogleGenerativeAI;
const SchemaType = AnyGenAI.SchemaType || AnyGenAI.default?.SchemaType;

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

const genAI = (GEMINI_API_KEY && GoogleGenerativeAIClass) ? new GoogleGenerativeAIClass(GEMINI_API_KEY) : null;

/**
 * 2. Structured Output Schema with fallbacks for type strings
 */
const relationshipSchema = {
  description: "List of relationships between research clusters",
  type: SchemaType?.OBJECT || "OBJECT",
  properties: {
    relationships: {
      type: SchemaType?.ARRAY || "ARRAY",
      items: {
        type: SchemaType?.OBJECT || "OBJECT",
        properties: {
          source: { type: SchemaType?.STRING || "STRING" },
          target: { type: SchemaType?.STRING || "STRING" },
          type: { 
            type: SchemaType?.STRING || "STRING", 
            enum: ["agreement", "disagreement", "weak"] 
          },
          reason: { type: SchemaType?.STRING || "STRING" }
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
    model: "gemini-2.0-flash", 
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: relationshipSchema,
    }
  });

  const prompt = `[Your Prompt Text Here]`; 

  try {
    const result = await withRetry(() => 
      model.generateContent(prompt)
    );

    // Safer text extraction for the non-standard package
    const rawText = typeof result.response.text === 'function' 
      ? result.response.text() 
      : (result.response as any).text;

    const parsed = JSON.parse(rawText);
    
    // ... [Keep your normalization and validation logic] ...
    
    return parsed.relationships || []; 
  } catch (error) {
    console.error("Gemini relationship generation failed:", error);
    return safeFallbackRelationships(clusters);
  }
}
