import * as GenAI from '@google/genai';
import type { PaperRecord } from '../types';

/**
 * 1. Environment Variable Selection
 * Picks the correct API key regardless of whether Vite or Node is running it.
 */
const getApiKey = () => {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || 
         (import.meta as any).env?.GEMINI_API_KEY ||
         (typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY : '') ||
         (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') ||
         '';
};

/**
 * 2. Cached Constructor
 * Finds the GoogleGenerativeAI class once and saves it to prevent "Not a constructor" errors.
 */
let CachedConstructor: any = null;

function getAiConstructor() {
  if (CachedConstructor) return CachedConstructor;

  const G = GenAI as any;
  // This covers all common JS bundling patterns (ESM, CJS, and Minified)
  const Found = G.GoogleGenerativeAI || G.default?.GoogleGenerativeAI || G.default;
  
  if (typeof Found === 'function') {
    CachedConstructor = Found;
    return Found;
  }
  return null;
}

function getAiClient() {
  const key = getApiKey();
  const Constructor = getAiConstructor();
  
  if (!key || !Constructor) {
    if (!key) console.warn("Gemini: Missing API Key");
    if (!Constructor) console.warn("Gemini: Constructor not found in bundle");
    return null;
  }

  try {
    return new Constructor(key);
  } catch (e) {
    console.error('Gemini: Initialization failed', e);
    return null;
  }
}

export function hasGeminiKey() {
  return !!getApiKey();
}

/**
 * 3. Main AI Functions
 */

export async function generateTextFromGemini(prompt: string): Promise<string> {
  const ai = getAiClient();
  if (!ai) return 'AI tool is still loading or key is missing.';
  
  const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const response = await model.generateContent({
    contents: [{ parts: [{ text: prompt }] }],
  });
  return extractTextFromResponse(response.response);
}

export async function readPaperFromUrl(url: string): Promise<any> {
  const ai = getAiClient();
  if (!ai) return { ok: false, title: 'Error', abstract: 'AI not ready.' };

  const prompt = `Read the source at this URL and return ONLY valid JSON.
URL: ${url}
JSON shape: { "title": "string", "abstract": "string", "theme": "string", "locationLabel": "string", "citation": "string", "year": 2024 }`.trim();

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ urlContext: {} }] as any,
    });

    const text = extractTextFromResponse(result.response);
    const parsed = extractJsonObject(text);

    return {
      ok: true,
      ...parsed
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return { ok: false, title: 'Failed to read source' };
  }
}

export async function enrichPaperRecordFromUrl(paper: PaperRecord): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };
  const res = await readPaperFromUrl(paper.sourceUrl);
  return {
    ...paper,
    title: res.title || paper.title,
    abstract: res.abstract || paper.abstract,
    theme: res.theme || paper.theme,
    locationLabel: res.locationLabel || paper.locationLabel,
    citation: res.citation || paper.citation,
    year: res.year || paper.year,
    ingestStatus: res.ok ? 'ready' : 'failed',
  };
}

/**
 * 4. Helper Utilities
 */

function extractTextFromResponse(response: any): string {
  // Try the official SDK helper first
  if (typeof response?.text === 'function') {
    try { return response.text(); } catch (e) {}
  }
  
  // Fallback for raw response objects
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
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
