import { GoogleGenAI } from '@google/genai';
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
 * 2. Client Initialization
 * Using the modern GoogleGenAI class for the @google/genai package.
 */
function getAiClient() {
  const key = getApiKey();
  if (!key) {
    console.warn("Gemini: Missing API Key");
    return null;
  }

  try {
    // The new SDK uses this configuration object pattern
    return new GoogleGenAI({ apiKey: key });
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
  const client = getAiClient();
  if (!client) return 'AI tool is still loading or key is missing.';
  
  try {
    // New SDK uses client.models.generateContent
    const response = await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    
    return extractTextFromResponse(response);
  } catch (error) {
    console.error('generateTextFromGemini failed:', error);
    return 'Error generating text.';
  }
}

export async function readPaperFromUrl(url: string): Promise<any> {
  const client = getAiClient();
  if (!client) return { ok: false, title: 'Error', abstract: 'AI not ready.' };

  const prompt = `Read the source at this URL and return ONLY valid JSON.
URL: ${url}
JSON shape: { "title": "string", "abstract": "string", "theme": "string", "locationLabel": "string", "citation": "string", "year": 2024 }`.trim();

  try {
    const result = await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = extractTextFromResponse(result);
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
  // The new SDK returns a 'value' property containing the response data
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
