import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "./geminiRetry";

// 1. Robust Key Access (matching your other file)
const rawKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const apiKey = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

// Debug log for API key presence
console.log("[DEBUG] generateResearchImage: API Key present:", !!apiKey, apiKey ? `${apiKey.slice(0, 4)}...` : "MISSING");

export async function generateResearchImage(
  prompt: string
): Promise<string | null> {
  if (!apiKey) {
    console.warn("[DEBUG] generateResearchImage: Missing VITE_GEMINI_API_KEY.");
    return null;
  }

  // 2. Use the correct SDK class
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Note: Using 2.0-flash which supports multimodal outputs
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  console.log("[DEBUG] generateResearchImage: Starting generation with prompt:", prompt);

  try {
    const response = await withRetry(() => 
      model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          // Tell Gemini we specifically want an image back
          responseMimeType: "image/png", 
        },
      })
    );

    console.log("[DEBUG] generateResearchImage: Raw Gemini response received:", response);

    const candidates = response?.response?.candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];

    for (const part of parts) {
      // Check for inlineData (Base64 image)
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
