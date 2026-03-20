import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

/**
 * 1. Environment Variable Selection
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
 */
function getAiClient() {
  const key = getApiKey();
  if (!key) {
    console.warn("Gemini: Missing API Key");
    return null;
  }

  try {
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
 * Updated for Gemini 2.5 Flash (2026 Compatibility)
 */

export async function generateTextFromGemini(prompt: string): Promise<string> {
  const client = getAiClient();
  if (!client) return 'AI tool is still loading or key is missing.';
  
  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
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
JSON shape: { "title": "string", "abstract": "string", "theme": "string", "locationLabel": "string", "citation": "string", "year": 2026 }`.trim();

  try {
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
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
  // Accessing the response structure that matches your current debug logs
  const candidate = response?.value?.candidates?.[0] || response?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
    
  return text || "No response text available.";
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
