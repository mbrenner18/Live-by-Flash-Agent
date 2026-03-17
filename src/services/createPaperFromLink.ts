import { PaperRecord } from '../types';

/**
 * Extracts a cleaner domain name for display (e.g., "nature.com" or "governor.ny.gov")
 */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown source';
  }
}

/**
 * Attempts to turn a URL slug into a readable title.
 * Example: "/coastal-resilience-study.pdf" -> "Coastal resilience study"
 */
function getReadableSlugTitle(url: string): string | null {
  try {
    const { pathname } = new URL(url);

    const lastSegment = pathname
      .split('/')
      .filter(Boolean)
      .pop();

    if (!lastSegment) return null;

    const cleaned = decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]+$/i, '') // Remove file extensions
      .replace(/[-_]+/g, ' ')       // Replace dashes/underscores with spaces
      .replace(/\s+/g, ' ')         // Collapse double spaces
      .trim();

    if (!cleaned || cleaned.length < 3) return null;

    // Skip pure numeric IDs or DOIs (e.g. "10.1038" or "123456")
    if (/^[\d.]+$/.test(cleaned) || cleaned.length > 100) return null;

    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  } catch {
    return null;
  }
}

function getFallbackTitle(url: string): string {
  const domain = getDomain(url);
  const slugTitle = getReadableSlugTitle(url);

  if (slugTitle) return slugTitle;

  // Domain-specific mapping
  const sourceMap: Record<string, string> = {
    'springer.com': 'Springer Nature Article',
    'pnas.org': 'PNAS Research Paper',
    'ny.gov': 'NY State Government Report',
    'box.com': 'Shared Research Document',
    'sciencedirect.com': 'ScienceDirect Article',
    'arxiv.org': 'arXiv Preprint'
  };

  for (const [key, value] of Object.entries(sourceMap)) {
    if (domain.includes(key)) return value;
  }

  return `Source: ${domain}`;
}

function buildCitation(domain: string, year: number, title: string): string {
  return `${title}. Retrieved from ${domain} (${year}).`;
}

export async function createPaperFromLink(url: string): Promise<PaperRecord> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL: Please provide a full URL (including http/https)');
  }

  const domain = getDomain(url);
  const year = new Date().getFullYear();
  const id = `link-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
  const title = getFallbackTitle(url);

  return {
    id,
    title,
    authors: ['Pending extraction...'],
    publisher: domain,
    abstract: `Document imported from ${domain}. Full metadata extraction is pending.`,
    theme: 'Imported Link',
    locationLabel: 'Unknown Location',
    citation: buildCitation(domain, year, title),
    year,
    sourceUrl: url,
    sourceType: 'link',
    ingestStatus: 'provisional',
    isProvisional: true,
  };
}
