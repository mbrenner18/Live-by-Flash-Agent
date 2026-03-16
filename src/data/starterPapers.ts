import type { PaperRecord, ScenarioPack } from '../types';

export const starterPapers: PaperRecord[] = [
  {
    id: 'sandy-hcr-10yr',
    title: 'Superstorm Sandy Anniversary Report: Ten Years Later: A Retrospective',
    authors: ['NYS HCR / GOSR'],
    publisher: 'New York State Homes and Community Renewal',
    abstract: 'A comprehensive retrospective detailing the 10-year recovery and resilience efforts in New York State following Superstorm Sandy.',
    theme: 'Recovery & Housing Resilience',
    citation: 'New York State Homes and Community Renewal. Superstorm Sandy Anniversary Report: Ten Years Later: A Retrospective. 2023.',
    year: 2023,
    sourceUrl: 'https://yi.hcr.ny.gov/system/files/documents/2023/06/tenthanniversaryreport.pdf',
    sourceType: 'report',
    ingestStatus: 'ready',
    isProvisional: false
  },
  {
    id: 'future-shorelines-2024',
    title: 'Future Shorelines: Living Shoreline Site Selection and Design Decision Support Tool',
    authors: ['Randall W. Parkinson', 'Levente Juhasz', 'Jinwen Xu', 'Zhaohui Jennifer Fu'],
    publisher: 'Estuaries and Coasts / Springer Nature',
    abstract: 'Research on a decision support tool for living shoreline site selection that incorporates future conditions induced by sea level rise.',
    theme: 'Living Shorelines',
    citation: 'Parkinson, R.W., et al. Future Shorelines. Estuaries and Coasts, 2024.',
    year: 2024,
    sourceUrl: 'https://link.springer.com/article/10.1007/s12237-024-01425-9',
    sourceType: 'article',
    ingestStatus: 'ready',
    isProvisional: false
  },
  {
    id: 'pnas-coastal-resilience',
    title: 'Economic evaluation of sea-level rise adaptation strongly influenced by hydrodynamic feedbacks',
    authors: ['Michelle A. Hummel', 'Robert Griffin', 'Katie Arkema', 'Anne D. Guerry'],
    publisher: 'PNAS',
    abstract: 'Scientific analysis of coastal resilience strategies and their effectiveness in protecting urban environments from storm surges.',
    theme: 'Coastal Engineering',
    citation: 'Hummel, M.A., et al. Economic evaluation of sea-level rise adaptation. PNAS, 2021.',
    year: 2021,
    sourceUrl: 'https://www.pnas.org/doi/10.1073/pnas.2025961118',
    sourceType: 'article',
    ingestStatus: 'ready',
    isProvisional: false
  },
  {
    id: 'nyu-resilience-research',
    title: 'NYU Coastal Resilience Research',
    authors: ['Unknown authors'],
    publisher: 'New York University',
    abstract: 'Research from NYU on coastal resilience strategies, focusing on urban planning and infrastructure adaptation.',
    theme: 'Urban Planning',
    locationLabel: 'New York City',
    citation: 'NYU. Coastal resilience research. 2022.',
    year: 2022,
    sourceUrl: 'https://nyu.app.box.com/s/xsirmahvzvzwoidwxduyg3g1h9vywasj',
    sourceType: 'document',
    ingestStatus: 'provisional',
    isProvisional: true
  }
];

export const SCENARIO_PACKS: ScenarioPack[] = [
  {
    id: 'sandy',
    name: 'Coastal Flood Defense',
    description: 'Analysis of Lower Manhattan storm surge protection strategies post-Sandy.',
    papers: starterPapers,
  },
];

export const locationVisuals: Record<string, string> = {
  Lower_Manhattan: 'https://images.unsplash.com/photo-1496871455396-14e56815f1f4?auto=format&fit=crop&q=80&w=800',
  Battery_Park: 'https://images.unsplash.com/photo-1496871455396-14e56815f1f4?auto=format&fit=crop&q=80&w=800',
  South_Street_Seaport: 'https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?auto=format&fit=crop&q=80&w=800',
  Far_Rockaway: 'https://images.unsplash.com/photo-1505242844900-724205163ca7?auto=format&fit=crop&q=80&w=800',
  Staten_Island: 'https://images.unsplash.com/photo-1523213139764-41525597375e?auto=format&fit=crop&q=80&w=800',
  Default: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800',
};