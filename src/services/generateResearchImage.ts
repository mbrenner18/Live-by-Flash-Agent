import * as GenAI from "@google/genai";
import { withRetry } from "./geminiRetry";

/**
 * Handle non-standard @google/genai exports
 */
const AnyGenAI = GenAI as any;
const GoogleGenerativeAIClass = AnyGenAI.GoogleGenerativeAI || AnyGenAI.default?.GoogleGenerativeAI;

// 1. Robust Key Access
const rawKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const apiKey = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

// Debug log for API key presence
console.log("[DEBUG] generateResearchImage: API Key present:", !!apiKey, apiKey ? `${apiKey.slice(0, 4)}...` : "MISSING");

export async function generateResearchImage(
  prompt: string
): Promise<string | null> {
  if (!apiKey || !GoogleGenerativeAIClass) {
    console.warn("[DEBUG] generateResearchImage: Missing VITE_GEMINI_API_KEY or SDK failed to load.");
    return null;
  }

  // 2. Use the dynamically resolved class
  const genAI = new GoogleGenerativeAIClass(apiKey);
  
  // Note: Using 2.0-flash
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  console.log("[DEBUG] generateResearchImage: Starting generation with prompt:", prompt);

  try {
    const result = await withRetry(() => 
      model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        // Note: Gemini text-to-image is typically handled via specific 
        // Image-to-Image models or Imagen integrations. 
        // 1.5/2.0 Flash generally return text/JSON.
      })
    );

    console.log("[DEBUG] generateResearchImage: Raw Gemini response received:", result);

    // Use a safer text/data extraction for this package
    const response = result.response;
    const candidates = response?.candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];

    for (const part of parts) {
      if (part.inlineData?.data) {
        console.log("[DEBUG] generateResearchImage: SUCCESS! Inline image data found.");
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    console.warn("[DEBUG] generateResearchImage: No image data found in response parts.");
    return null;
  } catch (error) {
    console.error("[DEBUG] generateResearchImage: API call failed:", error);
    return null;
  }
}
