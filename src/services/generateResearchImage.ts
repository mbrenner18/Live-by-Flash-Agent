import * as GenAI from "@google/genai";
import { withRetry } from "./geminiRetry";

const AnyGenAI = GenAI as any;
const GoogleGenerativeAIClass = AnyGenAI.GoogleGenerativeAI || AnyGenAI.default?.GoogleGenerativeAI;

const rawKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const apiKey = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

export async function generateResearchImage(prompt: string): Promise<string | null> {
  if (!apiKey || !GoogleGenerativeAIClass) {
    console.error("[DEBUG] CRITICAL: API Key missing or SDK failed to load.");
    return null;
  }

  const genAI = new GoogleGenerativeAIClass(apiKey);
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

    // 1. Check for actual binary data (Rare for Flash 2.0)
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    // 2. Fallback: If it's just text, let's treat the text as a prompt for a placeholder
    // This ensures your UI actually shows SOMETHING instead of staying null
    if (text && text.length > 10) {
      console.log("[DEBUG] No binary data. Using text-based placeholder.");
      const encodedPrompt = encodeURIComponent(text.slice(0, 100));
      return `https://pollinations.ai/p/${encodedPrompt}?width=512&height=512&nologo=true`;
    }

    return null;
  } catch (error: any) {
    console.error("[DEBUG] API call failed:", error.message);
    return null;
  }
}
