import * as GenAI from '@google/genai';
import type { PaperRecord } from '../types';

const getApiKey = () => {
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || 
         (import.meta as any).env?.GEMINI_API_KEY ||
         (typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY : '') ||
         (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') ||
         '';
};

function getAiClient() {
  const key = getApiKey();
  if (!key) {
    console.warn('Missing GEMINI_API_KEY');
    return null;
  }

  try {
    const G = GenAI as any;
    const Constructor = G.GoogleGenerativeAI || G.default?.GoogleGenerativeAI || G.default;
    
    if (typeof Constructor !== 'function') {
      throw new Error("Constructor not found in bundle");
    }
    
    return new Constructor(key);
  } catch (e) {
    console.error('Failed to initialize GoogleGenerativeAI:', e);
    return null;
  }
}

export function hasGeminiKey() {
  return !!getApiKey();
}

function extractTextFromResponse(response: any): string {
  if (typeof response?.text === 'string' && response.text.trim()) {
    return response.text.trim();
  }
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

export async function generateTextFromGemini(prompt: string): Promise<string> {
  const ai = getAiClient();
  if (!ai) return 'AI Client not initialized';
  
  const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const response = await model.generateContent({
    contents: [{ parts: [{ text: prompt }] }],
  });
  return extractTextFromResponse(response.response);
}

export type ReadPaperResult = {
  ok: boolean;
  title: string;
  abstract: string;
  theme?: string;
  locationLabel?: string;
  citation?: string;
  year?: number;
  suggestedFrontierName?: string;
  retrievalStatus?: string;
};

export async function readPaperFromUrl(url: string): Promise<ReadPaperResult> {
  const domain = domainFromUrl(url);
  const ai = getAiClient();

  if (!ai) {
    return {
      ok: false,
      title: fallbackTitleFromUrl(url),
      abstract: `Gemini unavailable. Check API Key configuration.`,
      theme: 'Imported Source',
      locationLabel: domain,
      citation: `Imported from ${domain} (${new Date().getFullYear()})`,
      year: new Date().getFullYear(),
      retrievalStatus: 'MISSING_API_KEY',
    };
  }

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}
Goal: Extract a research-style record that can be used for clustering.
Return exactly this JSON shape:
{
  "title": "string",
  "abstract": "string",
  "theme": "string",
  "locationLabel": "string",
  "citation": "string",
  "year": 2024,
  "suggestedFrontierName": "string"
}
Rules:
- Read the linked source itself.
- Prefer the actual paper/report title over the domain name.
- Abstract should be 1-3 concise factual sentences.
- Theme should be short and human-readable.
- Use locationLabel only if the source is meaningfully tied to a place.
- Do not include markdown fences.
`.trim();

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ urlContext: {} }] as any,
    });

    const response = result.response;
    const text = extractTextFromResponse(response);
    const parsed = extractJsonObject(text);

    const urlMetadata = (response as any)?.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [];
    const retrievalStatus = 
      Array.isArray(urlMetadata) && urlMetadata[0]?.urlRetrievalStatus
        ? String(urlMetadata[0].urlRetrievalStatus)
        : 'UNKNOWN';

    return {
      ok: true,
      title: typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallbackTitleFromUrl(url),
      abstract: typeof parsed?.abstract === 'string' && parsed.abstract.trim() ? parsed.abstract.trim() : `Imported from ${domain}.`,
      theme: typeof parsed?.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : 'Imported Source',
      locationLabel: typeof parsed?.locationLabel === 'string' ? parsed.locationLabel.trim() : undefined,
      citation: typeof parsed?.citation === 'string' ? parsed.citation.trim() : `Imported from ${domain}`,
      year: typeof parsed?.year === 'number' ? parsed.year : undefined,
      suggestedFrontierName: typeof parsed?.suggestedFrontierName === 'string' ? parsed.suggestedFrontierName.trim() : undefined,
      retrievalStatus,
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return {
      ok: false,
      title: fallbackTitleFromUrl(url),
      abstract: `Imported from ${domain}. Gemini could not reliably read the linked source.`,
      theme: 'Imported Source',
      locationLabel: domain,
      citation: `Imported from ${domain} (${new Date().getFullYear()})`,
      year: new Date().getFullYear(),
      retrievalStatus: 'FAILED',
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
    year: enriched.year || paper.year,
    ingestStatus: enriched.ok ? 'ready' : 'failed',
    isProvisional: !enriched.ok,
  };
}
