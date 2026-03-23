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
- Primary: Use the actual content retrieved from the webpage.
- Secondary: If the URL is blocked/paywalled, use your Google Search tool to find the paper's official abstract and metadata.
- If both fail, set "retrieval_status" to "FAILED".
- DO NOT invent or guess details based on the URL string.

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
        // ✅ UPDATED TOOL CONFIG: Switched to googleSearch for standard API compatibility
        tools: [
          { urlContext: {} },
          { googleSearch: {} } 
        ],
      },
    });

    const text = extractTextFromResponse(result);
    if (!text) throw new Error("Empty response from model.");

    const parsed = extractJsonObject(text);

    // 🕵️ VERIFICATION: Extract metadata to see if grounding actually happened
    // The candidate might contain groundings/metadata depending on tool success
    const candidate = result?.candidates?.[0] || result?.value?.candidates?.[0];
    const urlMetadata = candidate?.urlContextMetadata?.urlMetadata ?? [];
    const retrievalStatus = urlMetadata[0]?.urlRetrievalStatus || 'UNKNOWN';

    // If both the tool failed and the model reports a failure in its text logic
    if (retrievalStatus !== 'URL_RETRIEVAL_STATUS_SUCCESS' && parsed.retrieval_status === 'FAILED') {
      throw new Error("Grounding check failed: Content unreachable.");
    }

    return {
      ok: true,
      ...parsed,
      retrieval_meta: retrievalStatus
    };
  } catch (error) {
    console.error('readPaperFromUrl failed:', error);
    return { 
      ok: false, 
      title: 'Source Unverified', 
      abstract: 'The agent could not safely retrieve this source. It may be restricted or behind a paywall.' 
    };
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
    isProvisional: !res.ok,
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
