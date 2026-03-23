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

/**
 * Client Initialization
 */
function getAiClient() {
  const key = getApiKey();
  if (!key) {
    console.warn('Gemini: Missing API Key');
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
 * Text Generation
 */
export async function generateTextFromGemini(prompt: string): Promise<string> {
  const client = getAiClient();
  if (!client) return 'AI tool is still loading or key is missing.';

  try {
    const response = await client.getGenerativeModel({ model: 'gemini-3-flash-preview' })
      .generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

    return extractTextFromResponse(response) || 'No response text available.';
  } catch (error) {
    console.error('generateTextFromGemini failed:', error);
    return 'Error generating text.';
  }
}

export type ReadPaperResult = {
  ok: boolean;
  title: string;
  abstract: string;
  theme?: string;
  locationLabel?: string;
  citation?: string;
  year?: number;
  retrieval_status?: string;
  retrieval_meta?: string;
  search_grounded?: boolean;
};

/**
 * URL Reading with grounding
 */
export async function readPaperFromUrl(url: string): Promise<ReadPaperResult> {
  const client = getAiClient();

  if (!client) {
    return {
      ok: false,
      title: 'Error',
      abstract: 'AI not ready.',
      retrieval_status: 'FAILED',
      retrieval_meta: 'MISSING_API_KEY',
      search_grounded: false,
    };
  }

  const prompt = `
Read the source at this URL and return ONLY valid JSON.

URL:
${url}

Rules:
- Primary: use the actual content retrieved from the webpage.
- Secondary: if the URL is blocked or incomplete, use Google Search grounding to find reliable public metadata.
- If both fail, set "retrieval_status" to "FAILED".
- If the year is unknown, return 0. Do NOT guess or default to 2026.
- Do NOT invent or guess details based on the URL string.
- Do not include markdown fences.

JSON shape:
{
  "title": "string",
  "abstract": "string",
  "theme": "string",
  "locationLabel": "string",
  "citation": "string",
  "year": 0,
  "retrieval_status": "SUCCESS" | "FAILED"
}
  `.trim();

  try {
    // UPDATED: Using gemini-3-flash-preview for better retrieval
    const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [
          { urlContext: {} },
          { googleSearch: {} },
        ],
      },
    });

    const text = extractTextFromResponse(result);
    if (!text) {
      throw new Error('Empty response from model.');
    }

    const parsed = extractJsonObject(text);

    const candidate = result?.response?.candidates?.[0];

    const urlMetadata = candidate?.urlContextMetadata?.urlMetadata ?? [];
    const retrievalMeta =
      Array.isArray(urlMetadata) && urlMetadata[0]?.urlRetrievalStatus
        ? String(urlMetadata[0].urlRetrievalStatus)
        : 'UNKNOWN';

    const groundingMetadata = candidate?.groundingMetadata;
    const searchGrounded =
      !!groundingMetadata &&
      (
        (Array.isArray(groundingMetadata?.groundingChunks) &&
          groundingMetadata.groundingChunks.length > 0) ||
        (Array.isArray(groundingMetadata?.webSearchQueries) &&
          groundingMetadata.webSearchQueries.length > 0)
      );

    const modelStatus =
      typeof parsed?.retrieval_status === 'string'
        ? parsed.retrieval_status
        : 'UNKNOWN';

    const urlSucceeded = retrievalMeta === 'URL_RETRIEVAL_STATUS_SUCCESS';

    if (!urlSucceeded && !searchGrounded && modelStatus === 'FAILED') {
      return {
        ok: false,
        title: 'Source Unverified',
        abstract:
          'The agent could not safely retrieve this source. It may be restricted or behind a paywall.',
        retrieval_status: 'FAILED',
        retrieval_meta: retrievalMeta,
        search_grounded: false,
      };
    }

    return {
      ok: true,
      title: parsed?.title || 'Untitled source',
      abstract: parsed?.abstract || 'Abstract unavailable.',
      theme: parsed?.theme,
      locationLabel: parsed?.locationLabel,
      citation: parsed?.citation,
      year: typeof parsed?.year === 'number' ? parsed.year : undefined,
      retrieval_status: modelStatus,
      retrieval_meta: retrievalMeta,
      search_grounded: searchGrounded,
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return {
      ok: false,
      title: 'Source Unverified',
      abstract:
        'The agent could not safely retrieve this source. It may be restricted or behind a paywall.',
      retrieval_status: 'FAILED',
      retrieval_meta: 'ERROR',
      search_grounded: false,
    };
  }
}

/**
 * Preserve existing metadata if enrichment fails
 */
export async function enrichPaperRecordFromUrl(
  paper: PaperRecord,
): Promise<PaperRecord> {
  if (!paper.sourceUrl) {
    return {
      ...paper,
      ingestStatus: 'failed',
    };
  }

  const res = await readPaperFromUrl(paper.sourceUrl);

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
    locationLabel: res.locationLabel || paper.locationLabel,
    citation: res.citation || paper.citation,
    year: res.year || paper.year,
    ingestStatus: 'ready',
    isProvisional: false,
  };
}

/**
 * Helper Utilities
 */
function extractTextFromResponse(response: any): string {
  // Accessing response.response is standard for the JS SDK's generateContent result
  const res = response.response || response;
  const candidate = res?.candidates?.[0];
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
