import { describe, it, expect } from 'vitest';
import { extractEntities, entityOverlap } from '../../src/utils/entities.js';

describe('extractEntities', () => {
  it('should extract email addresses', () => {
    const result = extractEntities('Send to john@company.com and jane@company.com');
    expect(result.emails).toContain('john@company.com');
    expect(result.emails).toContain('jane@company.com');
  });

  it('should extract URLs', () => {
    const result = extractEntities('Visit https://example.com/api and http://test.org');
    expect(result.urls).toContain('https://example.com/api');
    expect(result.urls).toContain('http://test.org');
  });

  it('should extract filenames', () => {
    const result = extractEntities('Create a file called summary.md and report.docx');
    expect(result.filenames).toContain('summary.md');
    expect(result.filenames).toContain('report.docx');
  });

  it('should extract quoted strings', () => {
    const result = extractEntities('Search for "competitor pricing" and \'market analysis\'');
    expect(result.quotedStrings).toContain('competitor pricing');
    expect(result.quotedStrings).toContain('market analysis');
  });

  it('should deduplicate entities', () => {
    const result = extractEntities('Email john@co.com then email john@co.com again');
    expect(result.emails).toHaveLength(1);
  });
});

describe('entityOverlap', () => {
  it('should return 1 for identical entities', () => {
    const entities = extractEntities('Send to john@co.com file summary.md');
    const overlap = entityOverlap(entities, entities);
    expect(overlap).toBe(1);
  });

  it('should return 0 for no overlap', () => {
    const a = extractEntities('john@co.com');
    const b = extractEntities('jane@other.com');
    const overlap = entityOverlap(a, b);
    expect(overlap).toBe(0);
  });

  it('should return partial overlap', () => {
    const a = extractEntities('Send to john@co.com and jane@co.com');
    const b = extractEntities('Sent to john@co.com');
    const overlap = entityOverlap(a, b);
    expect(overlap).toBe(0.5);
  });
});
