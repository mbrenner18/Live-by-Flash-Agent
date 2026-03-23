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
 */
export async function readPaperFromUrl(url: string): Promise<any> {
  const client = getAiClient();
  if (!client) return { ok: false, title: 'Error', abstract: 'AI not ready.' };

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Rules:
- Primary: Extract content directly from the webpage.
- Secondary: If the page is blocked/unreachable, use Google Search to verify the paper's title/abstract.
- NEVER guess or hallucinate details. If blocked and search fails, return retrieval_status: "FAILED".

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
    const result = await client.models.generateContent({
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

    const candidate = result?.candidates?.[0] || result?.value?.candidates?.[0];
    
    // Direct URL Metadata
    const urlMetadata = candidate?.urlContextMetadata?.urlMetadata ?? [];
    const urlSucceeded = urlMetadata[0]?.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS';

    // Google Search Grounding Metadata
    const groundingMetadata = candidate?.groundingMetadata;
    const searchSucceeded = !!(
      groundingMetadata?.searchEntryPoint || 
      (groundingMetadata?.groundingChunks?.length > 0) ||
      (groundingMetadata?.webSearchQueries?.length > 0)
    );

    // SUCCESS GATE: Either tool worked OR the model produced a valid JSON block it claims is success
    const isVerified = urlSucceeded || searchSucceeded || parsed.retrieval_status === 'SUCCESS';

    if (!isVerified) {
      return { ok: false };
    }

    return {
      ok: true,
      ...parsed,
      is_grounded: urlSucceeded || searchSucceeded
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return { ok: false };
  }
}

/**
 * 4. Enrichment (The "Do No Harm" Logic)
 */
export async function enrichPaperRecordFromUrl(paper: PaperRecord): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };
  
  const res = await readPaperFromUrl(paper.sourceUrl);
  
  // If retrieval failed, protect Layer 1. DO NOT overwrite with "Source Unverified"
  if (!res.ok) {
    return {
      ...paper,
      ingestStatus: 'provisional',
      isProvisional: true
    };
  }

  // Successful retrieval: Merge the data
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
 * 5. Helper Utilities
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
  const client = getAiClient();
  if (!client) return 'Key missing.';
  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return extractTextFromResponse(response);
  } catch (error) {
    console.error('generateTextFromGemini failed:', error);
    return 'Error.';
  }
}
