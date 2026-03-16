import type { PaperRecord } from '../types';
import { enrichPaperRecordFromUrl } from './gemini';

export async function enrichPaperFromUrl(
  paper: PaperRecord
): Promise<PaperRecord> {
  return enrichPaperRecordFromUrl(paper);
}