import type { AlignmentScore, MatchedAction, ConstraintViolation } from '@llmagentscore/core';

/**
 * Options for controlling report formatting.
 */
export interface FormatOptions {
  /**
   * When true, include per-action match details in the report.
   * Defaults to false.
   */
  verbose?: boolean;
}

/**
 * Format an {@link AlignmentScore} as a human-readable string suitable
 * for display in the OpenClaw agent's response.
 */
export function formatReport(score: AlignmentScore, options: FormatOptions = {}): string {
  const { verbose = false } = options;
  const lines: string[] = [];

  // Header
  lines.push(`## AgentScore Alignment Report`);
  lines.push('');
  lines.push(`**Overall Score:** ${score.score}/100 ${getScoreLabel(score.score)}`);
  lines.push(`**Truthfulness:** ${score.truthfulness}/100`);
  lines.push('');

  // Summary counts
  lines.push(`| Metric | Count |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Matched instructions | ${score.matched.length} |`);
  lines.push(`| Missed instructions | ${score.missed.length} |`);
  lines.push(`| Unexpected actions | ${score.unexpected.length} |`);
  lines.push(`| Constraint violations | ${score.violations.length} |`);
  lines.push('');

  // Matched actions
  if (score.matched.length > 0) {
    lines.push(`### Matched Instructions`);
    lines.push('');
    for (const match of score.matched) {
      lines.push(formatMatchedAction(match, verbose));
    }
    lines.push('');
  }

  // Missed instructions
  if (score.missed.length > 0) {
    lines.push(`### Missed Instructions`);
    lines.push('');
    for (const missed of score.missed) {
      lines.push(`- ${missed}`);
    }
    lines.push('');
  }

  // Unexpected actions
  if (score.unexpected.length > 0) {
    lines.push(`### Unexpected Actions`);
    lines.push('');
    for (const action of score.unexpected) {
      lines.push(`- \`${action.tool}\` called at ${action.timestamp}`);
      if (verbose) {
        lines.push(`  Params: \`${JSON.stringify(action.params)}\``);
      }
    }
    lines.push('');
  }

  // Constraint violations
  if (score.violations.length > 0) {
    lines.push(`### Constraint Violations`);
    lines.push('');
    for (const violation of score.violations) {
      lines.push(formatViolation(violation));
    }
    lines.push('');
  }

  // Details
  if (score.details) {
    lines.push(`### Details`);
    lines.push('');
    lines.push(score.details);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Return a human-readable label for a numeric score.
 */
function getScoreLabel(score: number): string {
  if (score >= 90) return '(Excellent)';
  if (score >= 70) return '(Good)';
  if (score >= 50) return '(Fair)';
  return '(Poor)';
}

/**
 * Format a single matched action as a markdown bullet.
 */
function formatMatchedAction(match: MatchedAction, verbose: boolean): string {
  const confidence = Math.round(match.confidence * 100);
  let line = `- "${match.expected}" — matched \`${match.actual.tool}\` (${confidence}% confidence)`;
  if (verbose) {
    line += `\n  Params: \`${JSON.stringify(match.actual.params)}\``;
    if (match.actual.result !== undefined) {
      line += `\n  Result: \`${JSON.stringify(match.actual.result)}\``;
    }
  }
  return line;
}

/**
 * Format a constraint violation as a markdown bullet.
 */
function formatViolation(violation: ConstraintViolation): string {
  return `- **${violation.constraint}** — violated by \`${violation.violatingAction.tool}\`: ${violation.description}`;
}
