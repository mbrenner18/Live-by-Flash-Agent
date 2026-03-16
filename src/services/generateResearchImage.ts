import { GoogleGenAI } from "@google/genai";
import { withRetry } from "./geminiRetry";

// Use Vite's env access
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

// Debug log for API key presence (only first few chars for security)
console.log("[DEBUG] generateResearchImage: API Key present:", !!apiKey, apiKey ? `${apiKey.slice(0, 4)}...` : "MISSING");

export async function generateResearchImage(
  prompt: string
): Promise<string | null> {
  if (!apiKey) {
    console.warn("[DEBUG] generateResearchImage: Missing VITE_GEMINI_API_KEY. Cannot generate image.");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log("[DEBUG] generateResearchImage: Starting generation with prompt:", prompt);

  try {
    const response = await withRetry(() => 
      ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          responseModalities: ["IMAGE"],
        },
      })
    );

    console.log("[DEBUG] generateResearchImage: Raw Gemini response received:", response);

    const candidates = response?.candidates ?? [];
    if (candidates.length === 0) {
      console.warn("[DEBUG] generateResearchImage: No candidates returned in response.");
    }

    const parts = candidates[0]?.content?.parts ?? [];
    if (parts.length === 0) {
      console.warn("[DEBUG] generateResearchImage: No parts found in the first candidate.");
      console.log("[DEBUG] generateResearchImage: Full candidate content:", JSON.stringify(candidates[0]?.content, null, 2));
    }

    for (const part of parts) {
      if (part.inlineData?.data) {
        console.log("[DEBUG] generateResearchImage: SUCCESS! Inline image data found.");
        return `data:image/png;base64,${part.inlineData.data}`;
      }
      
      if (part.text) {
        console.log("[DEBUG] generateResearchImage: Part contains text instead of image:", part.text);
      }
    }

    console.warn("[DEBUG] generateResearchImage: No inlineData found in any response parts.");
    return null;
  } catch (error) {
    console.error("[DEBUG] generateResearchImage: API call failed with error:", error);
    return null;
  }
}
