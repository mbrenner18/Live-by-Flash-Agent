import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

/**
 * Environment Variable Selection
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
 * Helper Utilities (Exactly as in your AI Studio Export)
 */
function extractTextFromResponse(response: any): string {
  // Try the simple text() method first (Standard SDK)
  try {
    if (response.text && typeof response.text === 'function') {
      return response.text().trim();
    }
  } catch (e) {}

  // Fallback to manual candidate parsing
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
    throw new Error('No JSON object found in Gemini response');
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown source';
  }
}

function fallbackTitleFromUrl(url: string): string {
  const domain = domainFromUrl(url);
  if (domain.includes('springer.com')) return 'Springer article';
  if (domain.includes('pnas.org')) return 'PNAS article';
  if (domain.includes('box.com')) return 'Shared research document';
  if (domain.includes('ny.gov')) return 'Government report';
  return `Source from ${domain}`;
}

/**
 * URL Reading (The AI Studio Pattern)
 */
export async function readPaperFromUrl(url: string) {
  const domain = domainFromUrl(url);
  const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Return exactly this JSON shape:
{
  "title": "string",
  "abstract": "string",
  "theme": "string",
  "locationLabel": "string",
  "citation": "string",
  "year": 0,
  "suggestedFrontierName": "string"
}

Rules:
- Read the linked source itself.
- If the year is unknown, return 0.
- Do not include markdown fences.
`.trim();

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [
        { urlContext: {} } as any,
        { googleSearch: {} } as any
      ],
    });

    const response = result.response;
    const text = extractTextFromResponse(response);
    const parsed = extractJsonObject(text);

    return {
      ok: true,
      ...parsed,
      retrievalStatus: 'SUCCESS'
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return {
      ok: false,
      title: fallbackTitleFromUrl(url),
      abstract: `Imported from ${domain}. Fallback metadata used.`,
      year: 0
    };
  }
}

export async function enrichPaperRecordFromUrl(paper: PaperRecord): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };

  const enriched = await readPaperFromUrl(paper.sourceUrl);

  return {
    ...paper,
    title: enriched.title || paper.title,
    abstract: enriched.abstract || paper.abstract,
    theme: enriched.theme || paper.theme,
    locationLabel: enriched.locationLabel || paper.locationLabel,
    citation: enriched.citation || paper.citation,
    // Using the 0 guard to prevent 2026/future hallucinations
    year: (enriched.year && enriched.year > 0 && enriched.year < 2026) ? enriched.year : paper.year,
    ingestStatus: enriched.ok ? 'ready' : 'failed',
    isProvisional: !enriched.ok,
  };
}

export async function generateTextFromGemini(prompt: string): Promise<string> {
  const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  const result = await model.generateContent(prompt);
  return extractTextFromResponse(result.response);
}
