import type { PaperRecord } from '../types';
import { enrichPaperRecordFromUrl } from './gemini';

/**
 * Enriches a paper record using Gemini AI.
 * Includes a safety catch-all to prevent UI crashes if the AI service is down.
 */
export async function enrichPaperFromUrl(
  paper: PaperRecord
): Promise<PaperRecord> {
  try {
    // Call the Gemini-powered enrichment logic
    return await enrichPaperRecordFromUrl(paper);
  } catch (error) {
    console.error(`[Enrichment Error] Failed for paper: ${paper.id}`, error);
    
    // Return the original paper with a failed status so the UI can handle it gracefully
    return {
      ...paper,
      ingestStatus: 'failed',
      abstract: paper.abstract || 'Failed to generate summary. Please check your API connection.',
    };
  }
}
