import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('Missing GEMINI_API_KEY');
}

export const ai = new GoogleGenAI({ apiKey });

export const ai = new GoogleGenAI({ apiKey });

export function hasGeminiKey() {
  return !!apiKey;
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
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ parts: [{ text: prompt }] }],
  });

  return extractTextFromResponse(response);
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

  if (!hasGeminiKey()) {
    return {
      ok: false,
      title: fallbackTitleFromUrl(url),
      abstract: `Imported from ${domain}. Gemini URL reading is unavailable because the API key is missing.`,
      theme: 'Imported Source',
      locationLabel: domain,
      citation: `Imported from ${domain} (${new Date().getFullYear()})`,
      year: new Date().getFullYear(),
      retrievalStatus: 'MISSING_API_KEY',
    };
  }

  const prompt = `
Read the source at this URL and return ONLY valid JSON.

URL:
${url}

Goal:
Extract a research-style record that can be used for clustering.

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
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ urlContext: {} }],
      },
    });

    const text = extractTextFromResponse(response);
    const parsed = extractJsonObject(text);

    const urlMetadata =
      response?.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [];
    const retrievalStatus =
      Array.isArray(urlMetadata) && urlMetadata[0]?.urlRetrievalStatus
        ? String(urlMetadata[0].urlRetrievalStatus)
        : 'UNKNOWN';

    return {
      ok: true,
      title:
        typeof parsed?.title === 'string' && parsed.title.trim()
          ? parsed.title.trim()
          : fallbackTitleFromUrl(url),
      abstract:
        typeof parsed?.abstract === 'string' && parsed.abstract.trim()
          ? parsed.abstract.trim()
          : `Imported from ${domain}. Gemini accessed the source but did not return a usable abstract.`,
      theme:
        typeof parsed?.theme === 'string' && parsed.theme.trim()
          ? parsed.theme.trim()
          : 'Imported Source',
      locationLabel:
        typeof parsed?.locationLabel === 'string' && parsed.locationLabel.trim()
          ? parsed.locationLabel.trim()
          : undefined,
      citation:
        typeof parsed?.citation === 'string' && parsed.citation.trim()
          ? parsed.citation.trim()
          : `Imported from ${domain}`,
      year:
        typeof parsed?.year === 'number' && Number.isFinite(parsed.year)
          ? parsed.year
          : undefined,
      suggestedFrontierName:
        typeof parsed?.suggestedFrontierName === 'string' &&
        parsed.suggestedFrontierName.trim()
          ? parsed.suggestedFrontierName.trim()
          : undefined,
      retrievalStatus,
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);

    return {
      ok: false,
      title: fallbackTitleFromUrl(url),
      abstract: `Imported from ${domain}. Gemini could not reliably read the linked source, so this record is using fallback metadata.`,
      theme: 'Imported Source',
      locationLabel: domain,
      citation: `Imported from ${domain} (${new Date().getFullYear()})`,
      year: new Date().getFullYear(),
      retrievalStatus: 'FAILED',
    };
  }
}

export async function enrichPaperRecordFromUrl(
  paper: PaperRecord,
): Promise<PaperRecord> {
  if (!paper.sourceUrl) {
    return {
      ...paper,
      ingestStatus: 'failed',
    };
  }

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
