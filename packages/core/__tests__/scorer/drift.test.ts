import { describe, it, expect } from 'vitest';
import { computeDrift } from '../../src/scorer/drift.js';
import type { AgentAction } from '../../src/parser/types.js';

function makeAction(tool: string, params: Record<string, unknown> = {}): AgentAction {
  return { tool, params, timestamp: '2026-01-01T00:00:00Z' };
}

describe('computeDrift', () => {
  it('should return 0% drift for identical actions', () => {
    const actions: AgentAction[] = [
      makeAction('web_search', { query: 'test' }),
      makeAction('file_write', { path: 'out.txt' }),
    ];

    const result = computeDrift(actions, actions);
    expect(result.driftPercentage).toBe(0);
    expect(result.changes).toHaveLength(0);
  });

  it('should detect completely different actions', () => {
    const baseline: AgentAction[] = [
      makeAction('web_search', { query: 'test' }),
      makeAction('file_write', { path: 'out.txt' }),
    ];
    const current: AgentAction[] = [
      makeAction('gmail_send', { to: 'test@co.com' }),
      makeAction('slack_post', { channel: '#general' }),
    ];

    const result = computeDrift(baseline, current);
    expect(result.driftPercentage).toBeGreaterThan(0);
    expect(result.changes.length).toBeGreaterThan(0);

    // Should detect both added and removed tools
    const types = result.changes.map((c) => c.type);
    expect(types).toContain('added_tool');
    expect(types).toContain('removed_tool');
  });

  it('should handle empty baseline', () => {
    const current: AgentAction[] = [
      makeAction('web_search', { query: 'test' }),
    ];

    const result = computeDrift([], current);
    expect(result.driftPercentage).toBeGreaterThan(0);
    expect(result.changes.some((c) => c.type === 'added_tool')).toBe(true);
  });

  it('should handle empty current', () => {
    const baseline: AgentAction[] = [
      makeAction('web_search', { query: 'test' }),
    ];

    const result = computeDrift(baseline, []);
    expect(result.driftPercentage).toBeGreaterThan(0);
    expect(result.changes.some((c) => c.type === 'removed_tool')).toBe(true);
  });

  it('should handle both empty', () => {
    const result = computeDrift([], []);
    expect(result.driftPercentage).toBe(0);
    expect(result.changes).toHaveLength(0);
  });

  it('should detect frequency changes', () => {
    const baseline: AgentAction[] = [
      makeAction('web_search'),
      makeAction('web_search'),
    ];
    const current: AgentAction[] = [
      makeAction('web_search'),
      makeAction('web_search'),
      makeAction('web_search'),
      makeAction('web_search'),
      makeAction('web_search'),
    ];

    const result = computeDrift(baseline, current);
    const freqChanges = result.changes.filter((c) => c.type === 'frequency_change');
    expect(freqChanges.length).toBeGreaterThanOrEqual(1);
  });

  it('should cap drift percentage at 100', () => {
    // Create a large difference to potentially exceed 100
    const baseline: AgentAction[] = Array.from({ length: 10 }, (_, i) =>
      makeAction(`tool_${i}`),
    );
    const current: AgentAction[] = Array.from({ length: 10 }, (_, i) =>
      makeAction(`other_${i}`),
    );

    const result = computeDrift(baseline, current);
    expect(result.driftPercentage).toBeLessThanOrEqual(100);
    expect(result.driftPercentage).toBeGreaterThanOrEqual(0);
  });
});
