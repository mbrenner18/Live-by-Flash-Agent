import { PaperRecord } from '../types';

export function buildResearchImagePrompt(paper: PaperRecord): string {
  return `Cinematic environmental infrastructure visualization.
Topic: ${paper.title}
Theme: ${paper.theme}
Location: ${paper.locationLabel}
Context: ${paper.abstract}
Style: aerial perspective, realistic lighting, urban resilience, geospatial research visualization, no text overlay.`;
}
