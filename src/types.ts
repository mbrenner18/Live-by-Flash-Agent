export type IngestStatus = 'provisional' | 'enriching' | 'ready' | 'failed';

export type SourceType = 'article' | 'report' | 'document' | 'link' | 'pdf';

export interface PaperRecord {
  id: string;
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  theme: string;
  citation: string;
  sourceUrl: string;
  publisher?: string;
  sourceType?: SourceType;
  ingestStatus?: IngestStatus;
  isProvisional?: boolean;
  locationLabel?: string;
}

export type ClusterRecord = {
  id: string;
  theme: string;
  locationLabel: string;
  subtitle?: string;
  papers: PaperRecord[];
  paperCount: number;
};

export type ScenarioPack = {
  id: string;
  name: string;
  description: string;
  papers: PaperRecord[];
};

export type AICluster = {
  label: string;
  subtitle?: string;
  paperIds: string[];
};

export type ClusterRelationshipType = 'agreement' | 'disagreement' | 'weak';

export type ClusterRelationship = {
  source: string;
  target: string;
  type: ClusterRelationshipType;
  reason?: string;
};