import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PaperRecord } from '../types';

/**
 * 1. Environment & Client Initialization
 * Using Vite's import.meta for browser-side safety.
 */
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export function hasGeminiKey() {
  return !!API_KEY;
}

/**
 * 2. The Core Retrieval Logic (Studio-Style)
 */
export async function readPaperFromUrl(url: string) {
  if (!hasGeminiKey()) {
    return { ok: false, error: "Missing API Key" };
  }

  // Target the Gemini 3 Flash model for the hackathon
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3-flash-preview" 
  });

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Return exactly this JSON shape:
{
  "title": "string",
  "abstract": "string",
  "theme": "string",
  "citation": "string",
  "year": 2024
}

Rules:
- Read the content at the link.
- If the year is unknown, return 0. (No 2026 hallucinations).
- Abstract: 1-3 factual sentences.
- Do not include markdown fences.
`.trim();

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [
          { urlContext: {} } as any,
          { googleSearch: {} } as any
        ],
      }
    });

    const text = result.response.text();
    const cleanedText = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    return {
      ok: true,
      ...parsed
    };
  } catch (error) {
    console.error('Gemini URL Retrieval Failed:', error);
    return { ok: false };
  }
}

/**
 * 3. Enrichment Logic (The "Layer 1 vs Layer 2" Rule)
 * This ensures your app NEVER breaks when a URL is blocked.
 */
export async function enrichPaperRecordFromUrl(
  paper: PaperRecord,
): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };

  // Attempt to enhance the record
  const res = await readPaperFromUrl(paper.sourceUrl);

  // If AI fails (blocked, paywalled, or error), PRESERVE Layer 1 data.
  if (!res.ok) {
    return {
      ...paper,
      ingestStatus: 'provisional',
      isProvisional: true,
    };
  }

  // If AI succeeds, merge it carefully.
  return {
    ...paper,
    title: res.title && res.title !== 'Untitled' ? res.title : paper.title,
    abstract: res.abstract || paper.abstract,
    theme: res.theme || paper.theme,
    citation: res.citation || paper.citation,
    // Protect against the 2026 bug
    year: (res.year && res.year > 1900 && res.year < 2026) ? res.year : paper.year,
    ingestStatus: 'ready',
    isProvisional: false,
  };
}

/**
 * 4. General Purpose Text Generation
 */
export async function generateTextFromGemini(prompt: string): Promise<string> {
  if (!hasGeminiKey()) return "AI key missing.";
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Gemini text generation failed:', error);
    return "Error generating text.";
  }
}
