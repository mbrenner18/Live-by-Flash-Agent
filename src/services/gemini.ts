import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

/**
 * 1. Environment & Client Setup
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

function getAiClient() {
  const key = getApiKey();
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

export function hasGeminiKey() {
  return !!getApiKey();
}

/**
 * 2. Main Retrieval Function (Studio-Style)
 */
export async function readPaperFromUrl(url: string): Promise<any> {
  const client = getAiClient();
  if (!client) return { ok: false, error: 'Missing API Key' };

  // Using Gemini 3 Flash for the hackathon edge
  const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Goal: Extract a research-style record for clustering.

Rules:
- Read the content at the link. 
- If you cannot access the link, use your internal knowledge/search to find the abstract.
- If the publication year is not found, return 0. (Do NOT guess 2026).
- Abstract should be 2-3 factual sentences.

JSON shape:
{
  "title": "string",
  "abstract": "string",
  "theme": "string",
  "citation": "string",
  "year": 0
}`.trim();

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [
        { urlContext: {} } as any, 
        { googleSearch: {} } as any
      ],
    });

    const response = result.response;
    const text = response.text();
    const parsed = extractJsonObject(text);

    // We trust the JSON. If we got this far, the AI "read" it.
    return {
      ok: true,
      ...parsed,
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return { ok: false };
  }
}

/**
 * 3. Enrichment Logic (Preserves Cluster Data)
 */
export async function enrichPaperRecordFromUrl(
  paper: PaperRecord,
): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };

  const res = await readPaperFromUrl(paper.sourceUrl);

  // If the AI fails completely, keep the provisional data from your cluster
  if (!res.ok) {
    return {
      ...paper,
      ingestStatus: 'provisional',
      isProvisional: true,
    };
  }

  return {
    ...paper,
    title: res.title || paper.title,
    abstract: res.abstract || paper.abstract,
    theme: res.theme || paper.theme,
    citation: res.citation || paper.citation,
    // Only overwrite year if we found a valid past year
    year: (res.year && res.year > 1900 && res.year < 2026) ? res.year : paper.year,
    ingestStatus: 'ready',
    isProvisional: false,
  };
}

/**
 * 4. Helpers
 */
function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function generateTextFromGemini(prompt: string): Promise<string> {
  const client = getAiClient();
  if (!client) return 'Error';
  const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
