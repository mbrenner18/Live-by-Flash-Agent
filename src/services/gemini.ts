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

  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Rules:
- Primary: Extract content directly from the webpage.
- Secondary: If the page is blocked/unreachable, use Google Search to verify the paper's title/abstract.
- If the year is unknown, return 0.
- Set retrieval_status to "FAILED" ONLY if you cannot verify the content through either method.
- NEVER guess or hallucinate details.

JSON shape: 
{ 
  "title": "string", 
  "abstract": "string", 
  "theme": "string", 
  "locationLabel": "string", 
  "citation": "string", 
  "year": 0,
  "retrieval_status": "SUCCESS" | "FAILED"
}`.trim();

  try {
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [
          { urlContext: {} },
          { googleSearch: {} } 
        ],
      },
    });

    const text = extractTextFromResponse(result);
    if (!text) throw new Error("Empty response from model.");

    const parsed = extractJsonObject(text);

    const candidate = result?.candidates?.[0] || result?.value?.candidates?.[0];
    
    // Check 1: Direct URL Metadata
    const urlMetadata = candidate?.urlContextMetadata?.urlMetadata ?? [];
    const urlSucceeded = urlMetadata[0]?.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS';

    // Check 2: Google Search Grounding Metadata
    const groundingMetadata = candidate?.groundingMetadata;
    const searchSucceeded = !!(
      groundingMetadata?.searchEntryPoint || 
      (groundingMetadata?.groundingChunks?.length > 0) ||
      (groundingMetadata?.webSearchQueries?.length > 0)
    );

    console.log(`[Grounding Check] URL: ${urlSucceeded} | Search: ${searchSucceeded}`);

    const isVerified = urlSucceeded || searchSucceeded || parsed.retrieval_status === 'SUCCESS';

    if (!isVerified) {
      throw new Error("Content unreachable via direct link and search verification failed.");
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

export async function enrichPaperRecordFromUrl(paper: PaperRecord): Promise<PaperRecord> {
  if (!paper.sourceUrl) return { ...paper, ingestStatus: 'failed' };
  
  const res = await readPaperFromUrl(paper.sourceUrl);
  
  // ✅ DATA PRESERVATION FIX: 
  // If verification fails, we return the original paper object.
  if (!res.ok) {
    return {
      ...paper,
      ingestStatus: 'provisional',
      isProvisional: true, 
    };
  }

  // Only overwrite if we have verified success, and protect the year
  return {
    ...paper,
    title: res.title || paper.title,
    abstract: res.abstract || paper.abstract,
    theme: res.theme || paper.theme,
    locationLabel: res.locationLabel || paper.locationLabel,
    citation: res.citation || paper.citation,
    // Fix: Only overwrite the year if the model found a real date
    year: (res.year && res.year > 1900 && res.year <= 2026) ? res.year : paper.year,
    ingestStatus: 'ready',
    isProvisional: false,
  };
}

/**
 * 4. Helper Utilities
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
