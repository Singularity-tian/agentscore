import { describe, it, expect } from 'vitest';
import type { AlignmentScore, MatchedAction, ConstraintViolation } from '@llmagentscore/core';
import { formatJson } from '../../src/output/json.js';

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

describe('formatJson', () => {
  describe('basic structure', () => {
    it('returns valid JSON', () => {
      const output = formatJson(makeScore());
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes score and truthfulness at the top level', () => {
      const parsed = JSON.parse(formatJson(makeScore({ score: 88, truthfulness: 92 })));
      expect(parsed.score).toBe(88);
      expect(parsed.truthfulness).toBe(92);
    });

    it('includes all expected top-level keys', () => {
      const parsed = JSON.parse(formatJson(makeScore()));
      expect(parsed).toHaveProperty('score');
      expect(parsed).toHaveProperty('truthfulness');
      expect(parsed).toHaveProperty('matched');
      expect(parsed).toHaveProperty('missed');
      expect(parsed).toHaveProperty('unexpected');
      expect(parsed).toHaveProperty('violations');
    });

    it('does not include the details field', () => {
      const parsed = JSON.parse(
        formatJson(makeScore({ details: 'Some summary text' })),
      );
      expect(parsed).not.toHaveProperty('details');
    });

    it('is pretty-printed with 2-space indentation', () => {
      const output = formatJson(makeScore());
      // Pretty-printed JSON starts with "{\n  "
      expect(output).toMatch(/^\{\n {2}"/);
    });
  });

  describe('matched actions', () => {
    it('serializes matched actions correctly', () => {
      const matched: MatchedAction[] = [
        {
          expected: 'Send email to alice@example.com',
          actual: makeAction('gmail_send', { to: 'alice@example.com', subject: 'Hi' }),
          confidence: 0.95,
        },
      ];
      const parsed = JSON.parse(formatJson(makeScore({ matched })));

      expect(parsed.matched).toHaveLength(1);
      expect(parsed.matched[0].expected).toBe('Send email to alice@example.com');
      expect(parsed.matched[0].actual.tool).toBe('gmail_send');
      expect(parsed.matched[0].actual.params).toEqual({
        to: 'alice@example.com',
        subject: 'Hi',
      });
      expect(parsed.matched[0].confidence).toBe(0.95);
    });

    it('rounds confidence to 2 decimal places', () => {
      const matched: MatchedAction[] = [
        {
          expected: 'Do something',
          actual: makeAction('tool_a'),
          confidence: 0.876,
        },
      ];
      const parsed = JSON.parse(formatJson(makeScore({ matched })));

      // Math.round(0.876 * 100) / 100 = 0.88
      expect(parsed.matched[0].confidence).toBe(0.88);
    });

    it('strips extra fields from actual action (like timestamp)', () => {
      const matched: MatchedAction[] = [
        {
          expected: 'Task',
          actual: {
            tool: 'my_tool',
            params: { key: 'value' },
            timestamp: '2025-06-01T00:00:00Z',
            result: { data: 'some result' },
          },
          confidence: 1.0,
        },
      ];
      const parsed = JSON.parse(formatJson(makeScore({ matched })));

      // The formatter explicitly picks tool and params, not timestamp or result
      expect(parsed.matched[0].actual).toEqual({
        tool: 'my_tool',
        params: { key: 'value' },
      });
      expect(parsed.matched[0].actual).not.toHaveProperty('timestamp');
      expect(parsed.matched[0].actual).not.toHaveProperty('result');
    });

    it('handles empty matched array', () => {
      const parsed = JSON.parse(formatJson(makeScore({ matched: [] })));
      expect(parsed.matched).toEqual([]);
    });
  });

  describe('missed actions', () => {
    it('serializes missed actions as string array', () => {
      const parsed = JSON.parse(
        formatJson(makeScore({ missed: ['Book flight', 'Reserve hotel', 'Rent car'] })),
      );
      expect(parsed.missed).toEqual(['Book flight', 'Reserve hotel', 'Rent car']);
    });

    it('handles empty missed array', () => {
      const parsed = JSON.parse(formatJson(makeScore({ missed: [] })));
      expect(parsed.missed).toEqual([]);
    });
  });

  describe('unexpected actions', () => {
    it('serializes unexpected actions with tool and params', () => {
      const unexpected = [
        makeAction('twitter_post', { text: 'Hello' }),
        makeAction('file_delete', { path: '/tmp/data' }),
      ];
      const parsed = JSON.parse(formatJson(makeScore({ unexpected })));

      expect(parsed.unexpected).toHaveLength(2);
      expect(parsed.unexpected[0]).toEqual({ tool: 'twitter_post', params: { text: 'Hello' } });
      expect(parsed.unexpected[1]).toEqual({ tool: 'file_delete', params: { path: '/tmp/data' } });
    });

    it('strips timestamp from unexpected actions', () => {
      const unexpected = [makeAction('some_tool', { a: 1 })];
      const parsed = JSON.parse(formatJson(makeScore({ unexpected })));

      expect(parsed.unexpected[0]).not.toHaveProperty('timestamp');
    });

    it('handles empty unexpected array', () => {
      const parsed = JSON.parse(formatJson(makeScore({ unexpected: [] })));
      expect(parsed.unexpected).toEqual([]);
    });
  });

  describe('constraint violations', () => {
    it('serializes violations with constraint, action tool, and description', () => {
      const violations: ConstraintViolation[] = [
        {
          constraint: 'Do not access production database',
          violatingAction: makeAction('db_query', { query: 'DROP TABLE users' }),
          description: 'Agent queried the production database',
        },
      ];
      const parsed = JSON.parse(formatJson(makeScore({ violations })));

      expect(parsed.violations).toHaveLength(1);
      expect(parsed.violations[0]).toEqual({
        constraint: 'Do not access production database',
        action: 'db_query',
        description: 'Agent queried the production database',
      });
    });

    it('maps violatingAction.tool to the "action" field', () => {
      const violations: ConstraintViolation[] = [
        {
          constraint: 'No file deletion',
          violatingAction: makeAction('file_delete'),
          description: 'Deleted a file',
        },
      ];
      const parsed = JSON.parse(formatJson(makeScore({ violations })));

      // The key in JSON output is "action", not "tool" or "violatingAction"
      expect(parsed.violations[0].action).toBe('file_delete');
      expect(parsed.violations[0]).not.toHaveProperty('violatingAction');
      expect(parsed.violations[0]).not.toHaveProperty('tool');
    });

    it('handles empty violations array', () => {
      const parsed = JSON.parse(formatJson(makeScore({ violations: [] })));
      expect(parsed.violations).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles a perfect score with all empty arrays', () => {
      const result = makeScore({
        score: 100,
        truthfulness: 100,
        matched: [],
        missed: [],
        unexpected: [],
        violations: [],
      });
      const parsed = JSON.parse(formatJson(result));

      expect(parsed.score).toBe(100);
      expect(parsed.truthfulness).toBe(100);
      expect(parsed.matched).toEqual([]);
      expect(parsed.missed).toEqual([]);
      expect(parsed.unexpected).toEqual([]);
      expect(parsed.violations).toEqual([]);
    });

    it('handles zero scores', () => {
      const result = makeScore({ score: 0, truthfulness: 0 });
      const parsed = JSON.parse(formatJson(result));

      expect(parsed.score).toBe(0);
      expect(parsed.truthfulness).toBe(0);
    });

    it('handles actions with complex nested params', () => {
      const matched: MatchedAction[] = [
        {
          expected: 'Process data',
          actual: makeAction('data_transform', {
            input: { nested: { deeply: true } },
            options: [1, 2, 3],
          }),
          confidence: 0.9,
        },
      ];
      const parsed = JSON.parse(formatJson(makeScore({ matched })));

      expect(parsed.matched[0].actual.params).toEqual({
        input: { nested: { deeply: true } },
        options: [1, 2, 3],
      });
    });

    it('handles multiple items in all arrays simultaneously', () => {
      const result = makeScore({
        score: 50,
        truthfulness: 60,
        matched: [
          { expected: 'Task A', actual: makeAction('tool_a'), confidence: 0.8 },
          { expected: 'Task B', actual: makeAction('tool_b'), confidence: 0.7 },
        ],
        missed: ['Task C', 'Task D'],
        unexpected: [makeAction('rogue_tool_1'), makeAction('rogue_tool_2')],
        violations: [
          {
            constraint: 'Constraint 1',
            violatingAction: makeAction('bad_tool'),
            description: 'Violation 1',
          },
          {
            constraint: 'Constraint 2',
            violatingAction: makeAction('worse_tool'),
            description: 'Violation 2',
          },
        ],
      });

      const parsed = JSON.parse(formatJson(result));

      expect(parsed.matched).toHaveLength(2);
      expect(parsed.missed).toHaveLength(2);
      expect(parsed.unexpected).toHaveLength(2);
      expect(parsed.violations).toHaveLength(2);
    });
  });
});
