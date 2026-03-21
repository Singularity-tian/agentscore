import { describe, it, expect } from 'vitest';
import {
  tokenize,
  cosineSimilarity,
  termFrequency,
  inverseDocFrequency,
  tfidfVector,
  matchScore,
} from '../../src/utils/semantic.js';

describe('tokenize', () => {
  it('should lowercase and remove stop words', () => {
    const tokens = tokenize('Send the email to John');
    expect(tokens).toContain('send');
    expect(tokens).toContain('email');
    expect(tokens).toContain('john');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('to');
  });

  it('should remove punctuation', () => {
    const tokens = tokenize('Hello, world! How are you?');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
  });

  it('should filter single-character words', () => {
    const tokens = tokenize('I a send');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('a');
    expect(tokens).toContain('send');
  });
});

describe('termFrequency', () => {
  it('should compute normalized frequencies', () => {
    const tf = termFrequency(['send', 'email', 'send']);
    expect(tf.get('send')).toBeCloseTo(2 / 3);
    expect(tf.get('email')).toBeCloseTo(1 / 3);
  });
});

describe('inverseDocFrequency', () => {
  it('should give higher IDF to rare terms', () => {
    const idf = inverseDocFrequency([
      ['send', 'email'],
      ['send', 'file'],
      ['read', 'file'],
    ]);
    // 'email' appears in 1 doc → higher IDF
    // 'send' appears in 2 docs → lower IDF
    expect(idf.get('email')!).toBeGreaterThan(idf.get('send')!);
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = new Map([['send', 1], ['email', 2]]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = new Map([['send', 1]]);
    const b = new Map([['read', 1]]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('should return between 0 and 1 for partial overlap', () => {
    const a = new Map([['send', 1], ['email', 1]]);
    const b = new Map([['send', 1], ['file', 1]]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe('matchScore', () => {
  it('should give high score for direct tool-verb match', () => {
    const score = matchScore('send an email to the team', 'gmail_send', { to: 'team@co.com' });
    expect(score).toBeGreaterThan(0.3);
  });

  it('should give high score for entity + tool match', () => {
    const score = matchScore(
      'search for competitor pricing',
      'web_search',
      { query: 'competitor pricing' },
    );
    expect(score).toBeGreaterThan(0.3);
  });

  it('should give low score for unrelated action', () => {
    const score = matchScore('send an email', 'file_delete', { path: 'test.txt' });
    expect(score).toBeLessThan(0.3);
  });
});
