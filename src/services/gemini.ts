import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

// 1. Grab the key from the Vite environment
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!apiKey) {
  console.error('❌ CRITICAL: VITE_GEMINI_API_KEY is not defined in the environment.');
}

// 2. Initialize with Gemini 1.5 Flash (highly recommended for stability/speed)
// Or use 'gemini-3.1-pro-preview' if you have specific 3.1 features enabled
export const genAI = new GoogleGenAI(apiKey);
export const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash' 
});

export function hasGeminiKey() {
  return !!apiKey;
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
  const domain = domainFromUrl(url);

  if (!hasGeminiKey()) {
    return {
      ok: false,
      title: fallbackTitleFromUrl(url),
      abstract: `API Key Missing. Deployment requires VITE_GEMINI_API_KEY in Cloud Build.`,
      retrievalStatus: 'MISSING_API_KEY',
    };
  }

  try {
    const result = await model.generateContent(`Summarize this URL: ${url}`);
    const text = extractTextFromResponse(result);
    return { ok: true, title: 'Success', abstract: text }; 
  } catch (error) {
    console.error('Gemini Call Failed:', error);
    return { ok: false, title: 'Error', abstract: 'Failed to reach Gemini' };
  }
}

/**
 * THE FIX: Added the missing export that caused your build error
 */
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
