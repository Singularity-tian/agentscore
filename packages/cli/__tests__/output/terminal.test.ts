import { describe, it, expect } from 'vitest';
import type { AlignmentScore, MatchedAction, ConstraintViolation } from '@llmagentscore/core';
import { formatTerminal } from '../../src/output/terminal.js';

function makeAction(tool: string, params: Record<string, unknown> = {}) {
  return { tool, params, timestamp: '2025-01-01T00:00:00Z' };
}

function makeScore(overrides: Partial<AlignmentScore> = {}): AlignmentScore {
  return {
    score: 75,
    truthfulness: 80,
    matched: [],
    missed: [],
    unexpected: [],
    violations: [],
    details: '',
    ...overrides,
  };
}

describe('formatTerminal', () => {
  describe('header', () => {
    it('includes "AgentScore Report" in output', () => {
      const output = formatTerminal(makeScore());
      expect(output).toContain('AgentScore Report');
    });

    it('includes session id when provided', () => {
      const output = formatTerminal(makeScore(), 'my-session-42');
      expect(output).toContain('my-session-42');
    });

    it('omits session id separator when no id is provided', () => {
      const output = formatTerminal(makeScore());
      // The dash separator only appears when a session id is given
      expect(output).not.toContain('\u2014');
    });

    it('renders the separator line', () => {
      const output = formatTerminal(makeScore());
      // The separator is 55 '=' characters
      expect(output).toContain('\u2550'.repeat(55));
    });
  });

  describe('overall scores', () => {
    it('displays alignment score', () => {
      const output = formatTerminal(makeScore({ score: 85 }));
      expect(output).toContain('Overall Alignment');
      expect(output).toContain('85/100');
    });

    it('displays truthfulness score', () => {
      const output = formatTerminal(makeScore({ truthfulness: 92 }));
      expect(output).toContain('Truthfulness');
      expect(output).toContain('92/100');
    });
  });

  describe('matched actions section', () => {
    it('is not rendered when there are no matches', () => {
      const output = formatTerminal(makeScore({ matched: [] }));
      expect(output).not.toContain('Matched');
    });

    it('renders matched actions with count', () => {
      const matched: MatchedAction[] = [
        {
          expected: 'Send email to bob@example.com',
          actual: makeAction('gmail_send', { to: 'bob@example.com' }),
          confidence: 0.92,
        },
        {
          expected: 'Create a Jira ticket',
          actual: makeAction('jira_create', { summary: 'Bug fix' }),
          confidence: 0.87,
        },
      ];
      const output = formatTerminal(makeScore({ matched }));

      expect(output).toContain('Matched (2)');
      expect(output).toContain('gmail_send');
      expect(output).toContain('jira_create');
      expect(output).toContain('92%');
      expect(output).toContain('87%');
    });

    it('truncates long expected strings', () => {
      const longExpected = 'A'.repeat(60);
      const matched: MatchedAction[] = [
        {
          expected: longExpected,
          actual: makeAction('some_tool'),
          confidence: 0.99,
        },
      ];
      const output = formatTerminal(makeScore({ matched }));

      // The truncate function cuts at 40 chars for expected, adding "..."
      expect(output).not.toContain(longExpected);
      expect(output).toContain('...');
    });
  });

  describe('missed actions section', () => {
    it('is not rendered when there are no missed actions', () => {
      const output = formatTerminal(makeScore({ missed: [] }));
      expect(output).not.toContain('Missed');
    });

    it('renders missed actions with count', () => {
      const output = formatTerminal(
        makeScore({ missed: ['Book a flight', 'Reserve a hotel'] }),
      );

      expect(output).toContain('Missed (2)');
      expect(output).toContain('Book a flight');
      expect(output).toContain('Reserve a hotel');
      expect(output).toContain('NOT FOUND');
    });
  });

  describe('unexpected actions section', () => {
    it('is not rendered when there are no unexpected actions', () => {
      const output = formatTerminal(makeScore({ unexpected: [] }));
      expect(output).not.toContain('Unexpected');
    });

    it('renders unexpected actions with count', () => {
      const unexpected = [
        makeAction('twitter_post', { text: 'Hello world' }),
        makeAction('file_delete', { path: '/tmp/secret.txt' }),
      ];
      const output = formatTerminal(makeScore({ unexpected }));

      expect(output).toContain('Unexpected (2)');
      expect(output).toContain('twitter_post');
      expect(output).toContain('file_delete');
      expect(output).toContain('NOT in instructions');
    });
  });

  describe('constraint violations section', () => {
    it('is not rendered when there are no violations', () => {
      const output = formatTerminal(makeScore({ violations: [] }));
      expect(output).not.toContain('Constraint Violations');
    });

    it('renders constraint violations with count', () => {
      const violations: ConstraintViolation[] = [
        {
          constraint: 'Do not delete files',
          violatingAction: makeAction('file_delete', { path: '/data.csv' }),
          description: 'Agent deleted /data.csv which was forbidden',
        },
      ];
      const output = formatTerminal(makeScore({ violations }));

      expect(output).toContain('Constraint Violations (1)');
      expect(output).toContain('Agent deleted /data.csv which was forbidden');
    });
  });

  describe('score-dependent styling', () => {
    it('uses green styling indicator for high scores (>= 80)', () => {
      const output = formatTerminal(makeScore({ score: 95 }));
      // High scores get a checkmark emoji
      expect(output).toContain('\u2705');
    });

    it('uses warning indicator for medium scores (50-79)', () => {
      const output = formatTerminal(makeScore({ score: 65 }));
      // Medium scores get a warning emoji
      expect(output).toContain('\u26A0');
    });

    it('uses error indicator for low scores (< 50)', () => {
      const output = formatTerminal(makeScore({ score: 30 }));
      // Low scores get a cross emoji
      expect(output).toContain('\u274C');
    });
  });

  describe('full output integration', () => {
    it('renders a complete report with all sections', () => {
      const result = makeScore({
        score: 60,
        truthfulness: 70,
        matched: [
          {
            expected: 'Send slack message',
            actual: makeAction('slack_post', { channel: '#dev' }),
            confidence: 0.88,
          },
        ],
        missed: ['Update the database'],
        unexpected: [makeAction('web_search', { query: 'weather' })],
        violations: [
          {
            constraint: 'Do not use web search',
            violatingAction: makeAction('web_search', { query: 'weather' }),
            description: 'Agent used web_search which was not allowed',
          },
        ],
      });

      const output = formatTerminal(result, 'integration-session');

      // Header
      expect(output).toContain('AgentScore Report');
      expect(output).toContain('integration-session');

      // Scores
      expect(output).toContain('60/100');
      expect(output).toContain('70/100');

      // All four sections
      expect(output).toContain('Matched (1)');
      expect(output).toContain('Missed (1)');
      expect(output).toContain('Unexpected (1)');
      expect(output).toContain('Constraint Violations (1)');
    });
  });
});
