import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

/**
 * 1. Environment & Client Setup
 * Uses Vite-friendly environment variable detection.
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
export const ai = new GoogleGenAI({ apiKey });

export function hasGeminiKey() {
  return !!apiKey;
}

/**
 * 2. URL Reading with Actual Status Validation
 */
export async function readPaperFromUrl(url: string) {
  if (!hasGeminiKey()) return { ok: false };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ 
        role: 'user', 
        parts: [{ text: `Read this URL and return ONLY valid JSON with keys: title, abstract, theme, citation, year. If year is unknown, return 0. URL: ${url}` }] 
      }],
      config: {
        // urlContext for direct reading, googleSearch for "grounding" fallbacks
        tools: [{ urlContext: {} }, { googleSearch: {} }] as any,
      },
    });

    // VALIDATION: Don't just trust the JSON; check if the model actually "saw" the page
    const candidate = response?.candidates?.[0];
    const urlMetadata = candidate?.urlContextMetadata?.urlMetadata ?? [];
    const retrievalStatus = urlMetadata[0]?.urlRetrievalStatus || 'UNKNOWN';
    
    // Check if Search Grounding found the info even if the direct link was blocked
    const hasSearchGrounding = !!(candidate?.groundingMetadata?.groundingChunks?.length);
    
    // Success = The bot actually got in OR Search provided a valid backup
    const isActuallySuccessful = 
      retrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS' || hasSearchGrounding;

    const text = extractTextFromResponse(response);
    const parsed = extractJsonObject(text);

    return {
      ok: isActuallySuccessful,
      ...parsed,
      retrievalStatus
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return { ok: false };
  }
}

/**
 * 3. Enrichment Logic (The Layer 1 vs Layer 2 Guard)
 */
export async function enrichPaperRecordFromUrl(
  paper: PaperRecord,
): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };

  const enriched = await readPaperFromUrl(paper.sourceUrl);

  // If the AI was blocked (retrievalStatus !== SUCCESS), PROTECT the original data.
  if (!enriched.ok) {
    console.warn(`Retrieval blocked for ${paper.sourceUrl}. Keeping provisional data.`);
    return {
      ...paper,
      ingestStatus: 'provisional',
      isProvisional: true,
    };
  }

  // If we got real data, merge it.
  return {
    ...paper,
    title: enriched.title || paper.title,
    abstract: enriched.abstract || paper.abstract,
    theme: enriched.theme || paper.theme,
    citation: enriched.citation || paper.citation,
    // Final check against the 2026 year hallucination
    year: (enriched.year && enriched.year > 0 && enriched.year < 2026) ? enriched.year : paper.year,
    ingestStatus: 'ready',
    isProvisional: false,
  };
}

/**
 * 4. Helper Utilities
 */
function extractTextFromResponse(response: any): string {
  const candidate = response?.candidates?.[0];
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
  if (start === -1 || end === -1) throw new Error('No JSON object found');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function generateTextFromGemini(prompt: string): Promise<string> {
  if (!hasGeminiKey()) return 'AI key missing.';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
    });
    return extractTextFromResponse(response);
  } catch (error) {
    console.error('generateTextFromGemini failed:', error);
    return 'Error generating text.';
  }
}
