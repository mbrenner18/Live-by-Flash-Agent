import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

/**
 * 1. Environment Variable Selection
 * Uses Vite's import.meta for browser-side safety.
 */
const getApiKey = () => {
  return (
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (import.meta as any).env?.GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY : '') ||
    (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') ||
    ''
  );
};

const apiKey = getApiKey();
// Constructor for @google/genai (matches your Step #8 build)
export const ai = new GoogleGenAI({ apiKey });

export function hasGeminiKey() {
  return !!apiKey;
}

/**
 * 2. Main Retrieval Function
 * Reverts to gemini-2.5-flash and the direct ai.models call to prevent the "t.getGenerativeModel" error.
 */
export async function readPaperFromUrl(url: string): Promise<any> {
  if (!hasGeminiKey()) return { ok: false, title: 'Error', abstract: 'AI not ready.' };

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Rules:
- Primary: Extract content directly from the webpage.
- Secondary: If blocked, use Google Search to verify the paper's title/abstract.
- NEVER hallucinate details.
- If the content cannot be verified by either method, return retrieval_status: "FAILED".

JSON shape: 
{ 
  "title": "string", 
  "abstract": "string", 
  "theme": "string", 
  "locationLabel": "string", 
  "citation": "string", 
  "year": 2026,
  "retrieval_status": "SUCCESS" | "FAILED"
}`.trim();

  try {
    // Correct @google/genai syntax
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [
          { urlContext: {} } as any,
          { googleSearch: {} } as any
        ],
      },
    });

    const text = extractTextFromResponse(result);
    if (!text) throw new Error("Empty response from model.");

    const parsed = extractJsonObject(text);

    // Metadata Verification
    const candidate = result?.candidates?.[0] || (result as any)?.value?.candidates?.[0];
    
    const urlMetadata = candidate?.urlContextMetadata?.urlMetadata ?? [];
    const urlSucceeded = urlMetadata[0]?.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS';

    const groundingMetadata = candidate?.groundingMetadata;
    const searchSucceeded = !!(
      groundingMetadata?.searchEntryPoint || 
      (groundingMetadata?.groundingChunks?.length > 0)
    );

    // Logic: Pass if tool succeeded OR if the model produced a valid JSON successful status
    const isVerified = urlSucceeded || searchSucceeded || parsed.retrieval_status === 'SUCCESS';

    if (!isVerified) return { ok: false };

    return {
      ok: true,
      ...parsed
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return { ok: false };
  }
}

/**
 * 3. Enrichment Logic (The "Do No Harm" Rule)
 */
export async function enrichPaperRecordFromUrl(paper: PaperRecord): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };
  
  const res = await readPaperFromUrl(paper.sourceUrl);
  
  // If verification fails, return the original paper to preserve Layer 1 metadata.
  if (!res.ok) {
    return {
      ...paper,
      ingestStatus: 'provisional',
      isProvisional: true,
    };
  }

  // If verified, merge the better data.
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

/**
 * 4. Helper Utilities
 */
function extractTextFromResponse(response: any): string {
  const candidate = response?.value?.candidates?.[0] || response?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in response');
  }
  
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function generateTextFromGemini(prompt: string): Promise<string> {
  if (!hasGeminiKey()) return 'Key missing.';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return extractTextFromResponse(response);
  } catch (error) {
    console.error('generateTextFromGemini failed:', error);
    return 'Error generating text.';
  }
}
