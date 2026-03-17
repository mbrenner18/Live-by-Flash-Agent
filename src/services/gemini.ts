import { GoogleGenAI } from '@google/genai';
import type { PaperRecord } from '../types';

// 1. Grab the key from the Vite environment
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

if (!apiKey) {
  // This will show up in your browser console if the build didn't work
  console.error('❌ CRITICAL: VITE_GEMINI_API_KEY is not defined in the environment.');
}

// 2. Initialize with the updated 3.1 model
export const genAI = new GoogleGenAI(apiKey);
export const model = genAI.getGenerativeModel({ 
  model: 'gemini-3.1-pro-preview' 
});

export function hasGeminiKey() {
  return !!apiKey;
}

// ... (Rest of your helper functions like extractTextFromResponse stay the same)

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
    // 3. Updated model call syntax for Gemini 3.1
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Summarize this URL: ${url}` }] }]
    });
    
    const text = extractTextFromResponse(result);
    // ... rest of your parsing logic
    return { ok: true, title: 'Success', abstract: text }; 
  } catch (error) {
    console.error('Gemini 3.1 Call Failed:', error);
    return { ok: false, title: 'Error', abstract: 'Failed to reach Gemini 3.1' };
  }
}
