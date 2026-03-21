import { describe, it, expect } from 'vitest';
import { computeTruthfulness } from '../../src/scorer/truthful.js';
import type { AgentAction } from '../../src/parser/types.js';

describe('computeTruthfulness', () => {
  const actions: AgentAction[] = [
    {
      tool: 'web_search',
      params: { query: 'competitor pricing' },
      result: { results: ['found data'] },
      timestamp: '2026-01-01T00:00:00Z',
    },
    {
      tool: 'gmail_send',
      params: { to: 'team@co.com', subject: 'Report' },
      result: { status: 'sent' },
      timestamp: '2026-01-01T00:01:00Z',
    },
    {
      tool: 'file_write',
      params: { path: 'report.md', content: 'Report content' },
      result: { success: true },
      timestamp: '2026-01-01T00:02:00Z',
    },
  ];

  it('should give high truthfulness when all claims are verified', () => {
    const report =
      'I searched for competitor pricing data. I sent an email to the team. I created the report file.';
    const result = computeTruthfulness(report, actions);

    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.claims.filter((c) => c.verified).length).toBeGreaterThanOrEqual(1);
  });

  it('should give low truthfulness when claims are unverified', () => {
    const report =
      'I updated the database with new records. I deployed the application to production. I sent a Slack notification.';
    const result = computeTruthfulness(report, actions);

    expect(result.score).toBeLessThan(50);
  });

  it('should handle empty report', () => {
    const result = computeTruthfulness('', actions);
    expect(result.score).toBe(100);
    expect(result.claims).toHaveLength(0);
  });

  it('should handle report with no action claims', () => {
    const report = 'The weather is nice today. I like this project.';
    const result = computeTruthfulness(report, actions);
    expect(result.score).toBe(100);
  });

  it('should handle mixed verified and unverified claims', () => {
    const report =
      'I searched for competitor pricing. I also deployed to staging server.';
    const result = computeTruthfulness(report, actions);

    expect(result.claims.length).toBeGreaterThanOrEqual(2);
    const verified = result.claims.filter((c) => c.verified).length;
    const unverified = result.claims.filter((c) => !c.verified).length;
    expect(verified).toBeGreaterThanOrEqual(1);
    expect(unverified).toBeGreaterThanOrEqual(1);
  });
});
