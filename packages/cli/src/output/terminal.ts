import chalk from 'chalk';
import Table from 'cli-table3';
import type { AlignmentScore } from '@llmagentscore/core';

/**
 * Format alignment score as a colored terminal report.
 */
export function formatTerminal(result: AlignmentScore, sessionId?: string): string {
  const lines: string[] = [];

  // Header
  const now = new Date().toISOString();
  lines.push('');
  lines.push(
    chalk.bold(`AgentScore Report${sessionId ? ` — ${sessionId}` : ''}`),
  );
  lines.push(chalk.dim('═'.repeat(55)));

  // Overall scores
  const scoreColor = getScoreColor(result.score);
  const truthColor = getScoreColor(result.truthfulness);
  lines.push(
    `Overall Alignment:  ${scoreColor(result.score.toString() + '/100')}  ${getScoreEmoji(result.score)}`,
  );
  lines.push(`Truthfulness:       ${truthColor(result.truthfulness.toString() + '/100')}`);
  lines.push('');

  // Matched actions
  if (result.matched.length > 0) {
    lines.push(chalk.bold.green(`  ✅ Matched (${result.matched.length}):`));
    const table = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 5 },
    });
    for (const m of result.matched) {
      const confStr = `${Math.round(m.confidence * 100)}%`;
      table.push([
        chalk.white(truncate(m.expected, 40)),
        chalk.dim('→'),
        chalk.cyan(m.actual.tool),
        chalk.dim(`(${confStr})`),
      ]);
    }
    lines.push(table.toString());
    lines.push('');
  }

  // Missed actions
  if (result.missed.length > 0) {
    lines.push(chalk.bold.red(`  ❌ Missed (${result.missed.length}):`));
    for (const m of result.missed) {
      lines.push(`     ${chalk.red('•')} ${chalk.white(truncate(m, 60))} ${chalk.dim('→ NOT FOUND')}`);
    }
    lines.push('');
  }

  // Unexpected actions
  if (result.unexpected.length > 0) {
    lines.push(chalk.bold.yellow(`  ⚠️  Unexpected (${result.unexpected.length}):`));
    for (const u of result.unexpected) {
      const paramStr = truncate(JSON.stringify(u.params), 40);
      lines.push(
        `     ${chalk.yellow('•')} ${chalk.yellow(u.tool)}${chalk.dim(`(${paramStr})`)} ${chalk.dim('→ NOT in instructions')}`,
      );
    }
    lines.push('');
  }

  // Constraint violations
  if (result.violations.length > 0) {
    lines.push(chalk.bold.redBright(`  🚫 Constraint Violations (${result.violations.length}):`));
    for (const v of result.violations) {
      lines.push(`     ${chalk.redBright('•')} ${chalk.white(v.description)}`);
    }
    lines.push('');
  }

  lines.push(chalk.dim('═'.repeat(55)));
  return lines.join('\n');
}

function getScoreColor(score: number) {
  if (score >= 80) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function getScoreEmoji(score: number): string {
  if (score >= 80) return '✅';
  if (score >= 50) return '⚠️';
  return '❌';
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
