import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AlignmentScore } from '@llmagentscore/core';
import { formatTerminal } from '../../src/output/terminal.js';
import { formatJson } from '../../src/output/json.js';
import { formatMarkdown } from '../../src/output/markdown.js';

/**
 * Tests for the check command's formatting pipeline.
 *
 * We don't invoke `checkCommand` directly because it calls `process.exit`.
 * Instead, we test the `formatResult` logic by calling each formatter with
 * realistic AlignmentScore objects — the same path the check command takes.
 */

function makeScore(overrides: Partial<AlignmentScore> = {}): AlignmentScore {
  return {
    score: 85,
    truthfulness: 90,
    matched: [
      {
        expected: 'Send email to alice@example.com',
        actual: {
          tool: 'gmail_send',
          params: { to: 'alice@example.com', subject: 'Hello' },
          timestamp: '2025-01-01T00:00:00Z',
        },
        confidence: 0.95,
      },
    ],
    missed: ['Create calendar event for Friday'],
    unexpected: [
      {
        tool: 'slack_post',
        params: { channel: '#general', message: 'done' },
        timestamp: '2025-01-01T00:01:00Z',
      },
    ],
    violations: [
      {
        constraint: 'Do not send messages to #general',
        violatingAction: {
          tool: 'slack_post',
          params: { channel: '#general', message: 'done' },
          timestamp: '2025-01-01T00:01:00Z',
        },
        description: 'Agent posted to #general which was explicitly forbidden',
      },
    ],
    details: 'Agent completed 1 of 2 tasks with 1 constraint violation.',
    ...overrides,
  };
}

describe('check command — formatResult routing', () => {
  it('formats result as terminal output', () => {
    const result = makeScore();
    const output = formatTerminal(result, 'test-session-1');

    expect(output).toContain('AgentScore Report');
    expect(output).toContain('test-session-1');
    expect(output).toContain('85');
    expect(output).toContain('90');
  });

  it('formats result as JSON output', () => {
    const result = makeScore();
    const output = formatJson(result);

    const parsed = JSON.parse(output);
    expect(parsed.score).toBe(85);
    expect(parsed.truthfulness).toBe(90);
    expect(parsed.matched).toHaveLength(1);
    expect(parsed.missed).toHaveLength(1);
    expect(parsed.unexpected).toHaveLength(1);
    expect(parsed.violations).toHaveLength(1);
  });

  it('formats result as markdown output', () => {
    const result = makeScore();
    const output = formatMarkdown(result, 'test-session-1');

    expect(output).toContain('# AgentScore Report');
    expect(output).toContain('test-session-1');
    expect(output).toContain('85/100');
    expect(output).toContain('90/100');
  });

  it('terminal format without session id omits separator', () => {
    const result = makeScore();
    const output = formatTerminal(result);

    expect(output).toContain('AgentScore Report');
    // Should NOT have the " — " session id separator with no id
    expect(output).not.toMatch(/AgentScore Report\s*—/);
  });

  it('markdown format without session id omits separator', () => {
    const result = makeScore();
    const output = formatMarkdown(result);

    expect(output).toContain('# AgentScore Report');
    expect(output).not.toMatch(/AgentScore Report\s*—/);
  });
});

describe('check command — score thresholds affect output styling', () => {
  it('high score (>= 80) renders successfully', () => {
    const result = makeScore({ score: 92 });
    const terminalOutput = formatTerminal(result);
    expect(terminalOutput).toContain('92');

    const jsonOutput = formatJson(result);
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.score).toBe(92);
  });

  it('medium score (50-79) renders correctly', () => {
    const result = makeScore({ score: 62 });
    const terminalOutput = formatTerminal(result);
    expect(terminalOutput).toContain('62');
  });

  it('low score (< 50) renders correctly', () => {
    const result = makeScore({ score: 25 });
    const terminalOutput = formatTerminal(result);
    expect(terminalOutput).toContain('25');
  });
});

describe('check command — edge cases', () => {
  it('handles a perfect score with no missed/unexpected/violations', () => {
    const result = makeScore({
      score: 100,
      truthfulness: 100,
      missed: [],
      unexpected: [],
      violations: [],
    });

    const terminalOutput = formatTerminal(result);
    expect(terminalOutput).toContain('100/100');
    // Should not contain missed or unexpected sections
    expect(terminalOutput).not.toContain('Missed');
    expect(terminalOutput).not.toContain('Unexpected');
    expect(terminalOutput).not.toContain('Constraint Violations');

    const jsonOutput = formatJson(result);
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.missed).toEqual([]);
    expect(parsed.unexpected).toEqual([]);
    expect(parsed.violations).toEqual([]);
  });

  it('handles zero score with all failures', () => {
    const result = makeScore({
      score: 0,
      truthfulness: 0,
      matched: [],
      missed: ['Task A', 'Task B', 'Task C'],
      unexpected: [],
      violations: [],
    });

    const terminalOutput = formatTerminal(result);
    expect(terminalOutput).toContain('0/100');
    expect(terminalOutput).not.toContain('Matched');

    const jsonOutput = formatJson(result);
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.score).toBe(0);
    expect(parsed.matched).toEqual([]);
    expect(parsed.missed).toEqual(['Task A', 'Task B', 'Task C']);
  });

  it('handles empty matched array', () => {
    const result = makeScore({ matched: [] });

    const jsonOutput = formatJson(result);
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.matched).toEqual([]);
  });
});
