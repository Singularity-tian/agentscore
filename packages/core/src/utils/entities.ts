/** Patterns for extracting entities from text */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/g;
const FILE_PATTERN = /(?:^|\s|["'(])([a-zA-Z0-9_.-]+\.[a-zA-Z]{1,10})(?=\s|$|["')]|,|;)/gm;
const QUOTED_STRING_PATTERN = /"([^"]+)"|'([^']+)'/g;

export interface ExtractedEntities {
  emails: string[];
  urls: string[];
  filenames: string[];
  quotedStrings: string[];
}

/**
 * Extract structured entities (emails, URLs, filenames, quoted strings) from text.
 */
export function extractEntities(text: string): ExtractedEntities {
  const emails = [...new Set([...text.matchAll(EMAIL_PATTERN)].map((m) => m[0].toLowerCase()))];
  const urls = [...new Set([...text.matchAll(URL_PATTERN)].map((m) => m[0]))];

  const filenames: string[] = [];
  for (const match of text.matchAll(FILE_PATTERN)) {
    const filename = match[1];
    // Filter out common false positives
    if (!['e.g', 'i.e', 'etc.'].some((fp) => filename.startsWith(fp))) {
      filenames.push(filename);
    }
  }

  const quotedStrings: string[] = [];
  for (const match of text.matchAll(QUOTED_STRING_PATTERN)) {
    quotedStrings.push(match[1] || match[2]);
  }

  return {
    emails: [...new Set(emails)],
    urls: [...new Set(urls)],
    filenames: [...new Set(filenames)],
    quotedStrings: [...new Set(quotedStrings)],
  };
}

/**
 * Compute entity overlap between two sets of extracted entities.
 * Returns a score (0-1) indicating how much overlap exists.
 */
export function entityOverlap(a: ExtractedEntities, b: ExtractedEntities): number {
  let matches = 0;
  let total = 0;

  // Check emails
  for (const email of a.emails) {
    total++;
    if (b.emails.includes(email)) matches++;
  }

  // Check URLs
  for (const url of a.urls) {
    total++;
    if (b.urls.some((bUrl) => bUrl.includes(url) || url.includes(bUrl))) matches++;
  }

  // Check filenames
  for (const file of a.filenames) {
    total++;
    if (b.filenames.includes(file)) matches++;
  }

  // Check quoted strings (fuzzy — substring match)
  for (const qs of a.quotedStrings) {
    total++;
    if (
      b.quotedStrings.some(
        (bQs) =>
          bQs.toLowerCase().includes(qs.toLowerCase()) ||
          qs.toLowerCase().includes(bQs.toLowerCase()),
      )
    ) {
      matches++;
    }
  }

  if (total === 0) return 0;
  return matches / total;
}

/**
 * Flatten an entities object into a single string for text-based matching.
 */
export function entitiesToString(entities: ExtractedEntities): string {
  return [...entities.emails, ...entities.urls, ...entities.filenames, ...entities.quotedStrings]
    .join(' ');
}
