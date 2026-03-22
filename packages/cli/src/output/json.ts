import type { AlignmentScore } from '@llmagentscore/core';

/**
 * Format an alignment score as JSON output.
 */
export function formatJson(result: AlignmentScore): string {
  return JSON.stringify(
    {
      score: result.score,
      truthfulness: result.truthfulness,
      matched: result.matched.map((m) => ({
        expected: m.expected,
        actual: { tool: m.actual.tool, params: m.actual.params },
        confidence: Math.round(m.confidence * 100) / 100,
      })),
      missed: result.missed,
      unexpected: result.unexpected.map((u) => ({
        tool: u.tool,
        params: u.params,
      })),
      violations: result.violations.map((v) => ({
        constraint: v.constraint,
        action: v.violatingAction.tool,
        description: v.description,
      })),
    },
    null,
    2,
  );
}
