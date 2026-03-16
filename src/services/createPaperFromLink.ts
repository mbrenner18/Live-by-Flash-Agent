import { PaperRecord } from '../types';

function getDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

function getReadableSlugTitle(url: string): string | null {
  try {
    const { pathname } = new URL(url);

    const lastSegment = pathname
      .split('/')
      .filter(Boolean)
      .pop();

    if (!lastSegment) return null;

    const cleaned = decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return null;

    // Skip pure numeric / DOI-like fragments when they are not readable titles
    if (/^\d+(\.\d+)*$/.test(cleaned)) return null;

    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } catch {
    return null;
  }
}

function getFallbackTitle(url: string): string {
  const domain = getDomain(url);
  const slugTitle = getReadableSlugTitle(url);

  if (slugTitle) return slugTitle;

  if (domain.includes('springer.com')) return 'Springer article';
  if (domain.includes('pnas.org')) return 'PNAS article';
  if (domain.includes('ny.gov')) return 'Government report';
  if (domain.includes('box.com')) return 'Shared research document';

  return `Source from ${domain}`;
}

function buildCitation(domain: string, year: number, title: string): string {
  return `${title}. Imported from ${domain} (${year}).`;
}

export async function createPaperFromLink(url: string): Promise<PaperRecord> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL provided');
  }

  const domain = parsedUrl.hostname.replace(/^www\./, '');
  const year = new Date().getFullYear();
  const id = `link-${Date.now()}`;
  const title = getFallbackTitle(url);

  return {
    id,
    title,
    authors: ['Unknown authors'],
    publisher: domain,
    abstract: `Imported from ${domain}. Metadata extraction has not been implemented yet, so this record is using provisional link-based information until the page title, authors, abstract, and geolocation are parsed.`,
    theme: 'Imported Link',
    locationLabel: domain,
    citation: buildCitation(domain, year, title),
    year,
    sourceUrl: url,
    sourceType: 'link',
    ingestStatus: 'provisional',
    isProvisional: true,
  };
}