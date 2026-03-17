import { PaperRecord } from '../types';

/**
 * Creates a clean, structured prompt for Gemini Image Generation.
 * Truncates long fields to ensure the model stays focused on the core theme.
 */
export function buildResearchImagePrompt(paper: PaperRecord): string {
  // Clean up inputs to prevent weird formatting or excessive length
  const title = paper.title.slice(0, 100);
  const theme = (paper.theme || 'Environmental Science').slice(0, 50);
  const location = (paper.locationLabel || 'Global context').slice(0, 50);
  
  // Use a shortened version of the abstract to provide "flavor" without overwhelming
  const context = paper.abstract 
    ? paper.abstract.split('.').slice(0, 2).join('.') // Just the first two sentences
    : 'Scientific research and infrastructure';

  return `Cinematic environmental infrastructure visualization. 
Subject: ${title}. 
Core Theme: ${theme}. 
Geographic Setting: ${location}. 
Visual Context: ${context}. 
Technical Style: aerial perspective, realistic architectural lighting, urban resilience, high-detail geospatial research visualization, 8k resolution, professional photography, no text, no labels, no watermarks.`.replace(/\s+/g, ' ').trim();
}
