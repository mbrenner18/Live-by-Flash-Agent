import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

const getApiKey = () => {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || 
         (import.meta as any).env?.GEMINI_API_KEY || '';
};

const apiKey = getApiKey();
export const ai = new GoogleGenAI({ apiKey });

export function hasGeminiKey() { return !!apiKey; }

/**
 * 2. readPaperFromUrl (matches your kH/f logic)
 */
export async function readPaperFromUrl(url: string): Promise<any> {
  if (!hasGeminiKey()) return { ok: false };

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Rules:
- Primary: Extract content directly.
- Secondary: Use Google Search if blocked.
- If unverified, return retrieval_status: "FAILED".

JSON shape: 
{ "title": "string", "abstract": "string", "theme": "string", "citation": "string", "year": 0, "retrieval_status": "SUCCESS" | "FAILED" }
`.trim();

  try {
    const d = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { tools: [{ urlContext: {} } as any, { googleSearch: {} } as any] },
    });

    // Match your logic: f = Ub(d); 
    const f = extractTextFromResponse(d);
    
    // FIX: Instead of throwing "Empty response", we return ok: false gracefully
    if (!f) {
      console.warn("Gemini: Empty response (blocked source)");
      return { ok: false };
    }

    const h = extractJsonObject(f);
    const g = d?.candidates?.[0] || (d as any)?.value?.candidates?.[0];
    const S = g?.urlContextMetadata?.urlMetadata?.[0]?.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS";
    const T = g?.groundingMetadata;
    const _ = !!(T?.searchEntryPoint || (T?.groundingChunks?.length > 0));

    // Success Gate (S || _ || h.retrieval_status === "SUCCESS")
    if (S || _ || h.retrieval_status === "SUCCESS") {
      return { ok: true, ...h };
    }

    return { ok: false };
  } catch (error) {
    console.error("readPaperFromUrl failed:", error);
    return { ok: false };
  }
}

/**
 * 3. enrichPaperRecordFromUrl (matches your PH function)
 */
export async function enrichPaperRecordFromUrl(paper: PaperRecord): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: "failed" };

  const t = await readPaperFromUrl(paper.sourceUrl);

  if (t.ok) {
    return {
      ...paper,
      title: t.title || paper.title,
      abstract: t.abstract || paper.abstract,
      theme: t.theme || paper.theme,
      locationLabel: t.locationLabel || paper.locationLabel,
      citation: t.citation || paper.citation,
      year: t.year && t.year > 1900 && t.year < 2027 ? t.year : paper.year,
      ingestStatus: "ready",
      isProvisional: false
    };
  }

  // Fallback state (matched to your minified code)
  return {
    ...paper,
    ingestStatus: "provisional",
    isProvisional: true
  };
}

/**
 * Helpers
 */
function extractTextFromResponse(response: any): string {
  const candidate = response?.candidates?.[0] || response?.value?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  return parts.map((p: any) => p.text || '').join('').trim();
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function generateTextFromGemini(prompt: string): Promise<string> {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });
    return extractTextFromResponse(res);
  } catch (e) { return "Error."; }
}
