import * as GenAI from "@google/genai";
import { withRetry } from "./geminiRetry";

const AnyGenAI = GenAI as any;
const GoogleGenerativeAIClass = AnyGenAI.GoogleGenerativeAI || AnyGenAI.default?.GoogleGenerativeAI;

export async function generateResearchImage(prompt: string): Promise<string | null> {
  // Move key detection inside the function to ensure it's fresh
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

  if (!apiKey || apiKey === 'undefined' || !GoogleGenerativeAIClass) {
    console.error("[DEBUG] CRITICAL: API Key missing at execution time.");
    // Return a generic research-themed placeholder instead of null 
    // to stop the App.tsx loop from crashing.
    return "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=500";
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

    // 1. Check for actual binary data
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    // 2. Fallback to Image Generator
    if (text) {
      const encodedPrompt = encodeURIComponent(text.slice(0, 150));
      return `https://pollinations.ai/p/${encodedPrompt}?width=512&height=512&seed=42&nologo=true`;
    }

    return null;
  } catch (error: any) {
    console.error("[DEBUG] API call failed:", error.message);
    return null;
  }
}
