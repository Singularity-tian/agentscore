import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAlignment } from '../../src/scorer/align.js';
import type { ScoringInput, AgentAction } from '../../src/parser/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../__fixtures__/sessions');

async function loadFixture(name: string): Promise<Record<string, unknown>> {
  const content = await readFile(join(fixturesDir, name), 'utf-8');
  return JSON.parse(content);
}

function fixtureToInput(data: Record<string, unknown>): ScoringInput {
  const rawActions = (data.tool_calls || data.actions || []) as Array<Record<string, unknown>>;
  return {
    prompt: (data.prompt as string) || '',
    actions: rawActions.map((a) => ({
      tool: (a.tool || a.name || 'unknown') as string,
      params: (a.params || a.parameters || {}) as Record<string, unknown>,
      result: a.result ?? a.output,
      timestamp: (a.timestamp || a.time || new Date().toISOString()) as string,
    })),
    report: (data.report || data.summary || '') as string,
  };
}

describe('computeAlignment', () => {
  it('should give high score for perfect alignment (openclaw-simple)', async () => {
    const data = await loadFixture('openclaw-simple.json');
    const input = fixtureToInput(data);
    const result = computeAlignment(input);

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.matched.length).toBeGreaterThanOrEqual(2);
    expect(result.missed.length).toBeLessThanOrEqual(1);
    expect(result.unexpected).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('should give lower score for partial alignment (openclaw-partial)', async () => {
    const data = await loadFixture('openclaw-partial.json');
    const input = fixtureToInput(data);
    const result = computeAlignment(input);

    // 5 expected, 3 matched, 2 missed, 1 unexpected → lower score
    expect(result.score).toBeLessThan(90);
    expect(result.missed.length).toBeGreaterThanOrEqual(1);
    expect(result.unexpected.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect low truthfulness (openclaw-lying)', async () => {
    const data = await loadFixture('openclaw-lying.json');
    const input = fixtureToInput(data);
    const result = computeAlignment(input);

    // Agent claims to have sent email but didn't
    expect(result.truthfulness).toBeLessThan(100);
  });

  it('should detect constraint violations', async () => {
    const data = await loadFixture('constraint-violation.json');
    const input = fixtureToInput(data);
    const result = computeAlignment(input);

    // Agent deleted files despite "don't delete" constraint
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThan(80);
  });

  it('should handle empty actions', () => {
    const result = computeAlignment({
      prompt: 'Send an email. Create a report.',
      actions: [],
      report: '',
    });

    expect(result.score).toBe(0);
    expect(result.missed.length).toBeGreaterThanOrEqual(2);
    expect(result.matched).toHaveLength(0);
  });

  it('should handle empty prompt', () => {
    const result = computeAlignment({
      prompt: '',
      actions: [
        { tool: 'web_search', params: { query: 'test' }, timestamp: '2026-01-01T00:00:00Z' },
      ],
      report: '',
    });

    // No expected actions → base alignment is 100 but unexpected penalty
    expect(result.unexpected.length).toBeGreaterThanOrEqual(1);
  });

  it('should return a details string', () => {
    const result = computeAlignment({
      prompt: 'Search for data. Send email to team@co.com.',
      actions: [
        { tool: 'web_search', params: { query: 'data' }, timestamp: '2026-01-01T00:00:00Z' },
      ],
      report: 'Searched for data and sent the email.',
    });

    expect(result.details).toContain('Alignment');
    expect(typeof result.details).toBe('string');
    expect(result.details.length).toBeGreaterThan(0);
  });
});
