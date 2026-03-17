import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

/**
 * 1. Robust Key Detection
 * We check import.meta.env (Vite standard) 
 * AND process.env (what we just set in vite.config.ts)
 */
const apiKey = 
  (import.meta.env?.VITE_GEMINI_API_KEY) || 
  (process.env?.VITE_GEMINI_API_KEY) || 
  '';

if (!apiKey) {
  console.error('❌ CRITICAL: VITE_GEMINI_API_KEY is not defined in the environment.');
}

/**
 * 2. Initialization
 * We use a "lazy" check for the model to prevent the app from crashing 
 * immediately if the key is missing (the "Black Screen" fix).
 */
export const genAI = apiKey ? new GoogleGenAI(apiKey) : null;
export const model = genAI ? genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash' 
}) : null;

export function hasGeminiKey() {
  return !!apiKey && !!model;
}

/** * HELPER FUNCTIONS 
 */
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
  return `Source from ${domain}`;
}

function extractTextFromResponse(response: any): string {
  const text = response.response?.text?.();
  if (text) return text.trim();
  return "No summary generated.";
}

/** * EXPORTED FUNCTIONS
 */
export type ReadPaperResult = {
  ok: boolean;
  title: string;
  abstract: string;
  retrievalStatus?: string;
};

export async function readPaperFromUrl(url: string): Promise<ReadPaperResult> {
  if (!hasGeminiKey()) {
    return {
      ok: false,
      title: fallbackTitleFromUrl(url),
      abstract: `API Key Missing. Deployment requires VITE_GEMINI_API_KEY.`,
      retrievalStatus: 'MISSING_API_KEY',
    };
  }

  try {
    // We use non-null assertion (!) because hasGeminiKey() verified model exists
    const result = await model!.generateContent(`Summarize this URL: ${url}`);
    const text = extractTextFromResponse(result);
    return { ok: true, title: 'Success', abstract: text }; 
  } catch (error) {
    console.error('Gemini Call Failed:', error);
    return { ok: false, title: 'Error', abstract: 'Failed to reach Gemini' };
  }
}

export async function generateTextFromGemini(prompt: string): Promise<string> {
  if (!hasGeminiKey()) {
    throw new Error("Gemini API Key is missing or model failed to initialize.");
  }

  try {
    const result = await model!.generateContent(prompt);
    return extractTextFromResponse(result);
  } catch (error) {
    console.error('General Gemini Text Generation Failed:', error);
    throw error;
  }
}

export async function enrichPaperRecordFromUrl(
  paper: PaperRecord,
): Promise<PaperRecord> {
  if (!paper.sourceUrl) {
    return { ...paper, ingestStatus: 'failed' };
  }

  const enriched = await readPaperFromUrl(paper.sourceUrl);

  return {
    ...paper,
    title: enriched.ok ? enriched.title : paper.title,
    abstract: enriched.ok ? enriched.abstract : paper.abstract,
    ingestStatus: enriched.ok ? 'ready' : 'failed',
    isProvisional: !enriched.ok,
  };
}
