import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PaperRecord } from '../types';

/**
 * 1. Robust Key Detection
 * We check import.meta.env (Vite standard) 
 * AND process.env (fallback for Cloud Build environments)
 */
const rawKey = 
  (import.meta.env?.VITE_GEMINI_API_KEY) || 
  (process.env?.VITE_GEMINI_API_KEY) || 
  '';

// Vite sometimes bakes in the literal string "undefined" if the key is missing
const apiKey = (rawKey === 'undefined' || !rawKey) ? '' : rawKey;

if (!apiKey) {
  console.error('❌ CRITICAL: VITE_GEMINI_API_KEY is not defined. AI features will be disabled.');
}

/**
 * 2. Initialization
 * Using GoogleGenerativeAI (correct SDK class) and handling null for the "Black Screen" fix.
 */
export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
export const model = genAI ? genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash' 
}) : null;

export function hasGeminiKey() {
  return !!apiKey && !!model;
}

/**
 * HELPER FUNCTIONS 
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
  // Defensive check for the response structure
  const text = response.response?.text?.();
  if (text) return text.trim();
  return "No summary generated.";
}

/**
 * EXPORTED FUNCTIONS
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
    // Non-null assertion (!) is safe here due to hasGeminiKey() check
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
    console.error
