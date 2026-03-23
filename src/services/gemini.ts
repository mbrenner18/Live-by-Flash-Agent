import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

const getApiKey = () => {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || 
         (import.meta as any).env?.GEMINI_API_KEY || 
         '';
};

const apiKey = getApiKey();
export const ai = new GoogleGenAI({ apiKey });

export function hasGeminiKey() {
  return !!apiKey;
}

export async function readPaperFromUrl(url: string): Promise<any> {
  if (!hasGeminiKey()) return { ok: false };

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Rules:
- Primary: Extract content directly from the webpage.
- Secondary: If blocked, use Google Search to verify the paper's title/abstract.
- NEVER hallucinate details. If you cannot find info, return retrieval_status: "FAILED".

JSON shape: 
{ 
  "title": "string", 
  "abstract": "string", 
  "theme": "string", 
  "citation": "string", 
  "year": 2026,
  "retrieval_status": "SUCCESS" | "FAILED"
}`.trim();

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ urlContext: {} } as any, { googleSearch: {} } as any],
      },
    });

    // 1. Safety Guard: Check if the model actually returned content
    const text = extractTextFromResponse(result);
    if (!text) {
      console.warn("Gemini returned an empty response. Likely blocked or safety-filtered.");
      return { ok: false };
    }

    // 2. Parse JSON
    const parsed = extractJsonObject(text);

    // 3. Validation Logic
    const candidate = result?.candidates?.[0] || (result as any)?.value?.candidates?.[0];
    const urlSucceeded = candidate?.urlContextMetadata?.urlMetadata?.[0]?.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS';
    const hasSearch = !!(candidate?.groundingMetadata?.groundingChunks?.length);

    const isVerified = urlSucceeded || hasSearch || parsed.retrieval_status === 'SUCCESS';

    if (!isVerified) return { ok: false };

    return { ok: true, ...parsed };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return { ok: false };
  }
}

export async function enrichPaperRecordFromUrl(paper: PaperRecord): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };
  
  const res = await readPaperFromUrl(paper.sourceUrl);
  
  // PROTECT: If readPaperFromUrl returns { ok: false }, we keep original paper data.
  if (!res.ok) {
    return {
      ...paper,
      ingestStatus: 'provisional',
      isProvisional: true
    };
  }

  return {
    ...paper,
    title: res.title || paper.title,
    abstract: res.abstract || paper.abstract,
    theme: res.theme || paper.theme,
    locationLabel: res.locationLabel || paper.locationLabel,
    citation: res.citation || paper.citation,
    year: (res.year && res.year > 1900 && res.year < 2027) ? res.year : paper.year,
    ingestStatus: 'ready',
    isProvisional: false,
  };
}

function extractTextFromResponse(response: any): string {
  const candidate = response?.candidates?.[0] || response?.value?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  if (!parts.length) return ""; // Guard against empty parts
  return parts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('').trim();
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function generateTextFromGemini(prompt: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });
    return extractTextFromResponse(response);
  } catch (e) { return 'Error.'; }
}
