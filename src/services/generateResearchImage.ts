import * as GenAI from "@google/genai";
import { withRetry } from "./geminiRetry";

const AnyGenAI = GenAI as any;
const GoogleGenerativeAIClass = AnyGenAI.GoogleGenerativeAI || AnyGenAI.default?.GoogleGenerativeAI;

const rawKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const apiKey = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

export async function generateResearchImage(
  prompt: string
): Promise<string | null> {
  if (!apiKey || !GoogleGenerativeAIClass) {
    console.error("[DEBUG] CRITICAL: API Key missing or SDK failed to load.");
    return null;
  }

  const genAI = new GoogleGenerativeAIClass(apiKey);
  // Using gemini-2.0-flash
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  try {
    const result = await withRetry(() => 
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
    );

    const response = await result.response;
    const text = response.text();

    console.log("[DEBUG] Gemini Text Response:", text);

    // 1. Check for Inline Data (Binary blobs)
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    // 2. Fallback: Check if the model returned a Base64 string inside the text
    // This is common if you prompt the model to "Return only the base64"
    const base64Regex = /([A-Za-z0-9+/]{40,})/; 
    const match = text.match(base64Regex);
    if (match) {
      console.log("[DEBUG] Found potential Base64 string in text response.");
      return `data:image/png;base64,${match[1]}`;
    }

    console.warn("[DEBUG] No image data or Base64 found in response.");
    return null;

  } catch (error: any) {
    // This will help diagnose 403 (Key blocked) or 400 (Invalid request) errors
    console.error("[DEBUG] API call failed with error:", {
      message: error.message,
      status: error.status,
      details: error.response?.data
    });
    return null;
  }
}
