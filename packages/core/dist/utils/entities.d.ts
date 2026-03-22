export interface ExtractedEntities {
    emails: string[];
    urls: string[];
    filenames: string[];
    quotedStrings: string[];
}
/**
 * Extract structured entities (emails, URLs, filenames, quoted strings) from text.
 */
export declare function extractEntities(text: string): ExtractedEntities;
/**
 * Compute entity overlap between two sets of extracted entities.
 * Returns a score (0-1) indicating how much overlap exists.
 */
export declare function entityOverlap(a: ExtractedEntities, b: ExtractedEntities): number;
/**
 * Flatten an entities object into a single string for text-based matching.
 */
export declare function entitiesToString(entities: ExtractedEntities): string;
//# sourceMappingURL=entities.d.ts.map