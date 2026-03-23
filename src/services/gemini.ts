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

  // STRICT PROMPT WITH GROUNDING RULES
  const prompt = `
Read the source at this URL and return ONLY valid JSON.
URL: ${url}

Rules:
- Use ONLY the actual content retrieved from the webpage.
- If the page cannot be accessed, is empty, or is blocked, set "retrieval_status" to "FAILED".
- Do NOT invent or guess an abstract based on the URL domain or slug.

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
      // ✅ THE CRITICAL FIX: This forces the agent to actually browse the link
      config: {
        tools: [{ urlContext: {} }],
      },
    });

    const text = extractTextFromResponse(result);
    
    // Safety check: If the model returned nothing, fail gracefully.
    if (!text) throw new Error("Empty response from model.");

    const parsed = extractJsonObject(text);

    // ✅ HONESTY CHECK: If the model admits it couldn't read the page, reject the fake data.
    if (parsed.retrieval_status === 'FAILED') {
      throw new Error("Source content unreachable or blocked.");
    }

    return {
      ok: true,
      ...parsed
    };
  } catch (error) {
    console.error('readPaperFromUrl failed or was blocked:', error);
    // ✅ HONEST FALLBACK: No more hallucinations.
    return { 
      ok: false, 
      title: 'Source Unverified', 
      abstract: 'The agent could not safely access this source to verify details. It may be behind a paywall or bot-blocker.' 
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
    isProvisional: !res.ok, // Marks it visually if it failed
  };
}

/**
 * 4. Helper Utilities (Fixed)
 */
function extractTextFromResponse(response: any): string {
  const candidate = response?.value?.candidates?.[0] || response?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim(); 
    // Removed the "No response text available" string that was breaking your JSON parser
}

function extractJsonObject(text: string) {
  // Fixed regex to safely remove markdown formatting before parsing
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in response');
  }
  
  return JSON.parse(cleaned.slice(start, end + 1));
}
