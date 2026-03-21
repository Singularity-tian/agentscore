import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  parseOpenClawSession,
  parseGenericSession,
  computeDrift,
  computeAlignment,
  type AgentSession,
} from '@agentscore/core';

export interface DriftOptions {
  path?: string;
  days?: number;
}

/**
 * The `agentscore drift` command.
 * Show behavioral drift over time.
 */
export async function driftCommand(options: DriftOptions): Promise<void> {
  const targetPath = resolve(options.path || '.');
  const days = options.days || 30;

  try {
    const sessions = await loadAllSessions(targetPath);

    if (sessions.length < 2) {
      console.log(chalk.yellow('Need at least 2 sessions to compute drift.'));
      process.exit(0);
    }

    // Sort by start time
    sessions.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    // Use first session as baseline
    const baseline = sessions[0];
    const latest = sessions[sessions.length - 1];

    console.log('');
    console.log(chalk.bold('AgentScore Drift Analysis'));
    console.log(chalk.dim('═'.repeat(55)));
    console.log('');
    console.log(`Baseline: ${chalk.dim(baseline.startedAt)}`);
    console.log(`Latest:   ${chalk.dim(latest.startedAt)}`);
    console.log(`Sessions: ${chalk.cyan(sessions.length.toString())}`);
    console.log('');

    // Compute drift between baseline and latest
    const drift = computeDrift(baseline.actions, latest.actions);

    const driftColor =
      drift.driftPercentage >= 50
        ? chalk.red
        : drift.driftPercentage >= 20
          ? chalk.yellow
          : chalk.green;
    console.log(
      `Drift from baseline: ${driftColor(drift.driftPercentage + '%')}`,
    );
    console.log('');

    if (drift.changes.length > 0) {
      console.log(chalk.bold('Changes detected:'));
      const table = new Table({
        head: [chalk.bold('Type'), chalk.bold('Description'), chalk.bold('Severity')],
        colWidths: [20, 45, 12],
        wordWrap: true,
      });

      for (const change of drift.changes) {
        const sevColor =
          change.severity >= 0.5 ? chalk.red : change.severity >= 0.3 ? chalk.yellow : chalk.green;
        table.push([
          change.type.replace(/_/g, ' '),
          change.description,
          sevColor((change.severity * 100).toFixed(0) + '%'),
        ]);
      }

      console.log(table.toString());
    } else {
      console.log(chalk.green('No significant drift detected.'));
    }

    // Show score trend
    console.log('');
    console.log(chalk.bold('Score trend:'));
    for (const session of sessions) {
      const result = computeAlignment({
        prompt: session.prompt,
        actions: session.actions,
        report: session.report,
      });
      const scoreColor = getScoreColor(result.score);
      const bar = '█'.repeat(Math.round(result.score / 5));
      console.log(
        `  ${chalk.dim(session.startedAt.slice(0, 10))} ${scoreColor(bar)} ${scoreColor(result.score.toString())}`,
      );
    }
    console.log('');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error:', message);
    process.exit(1);
  }
}

function getScoreColor(score: number) {
  if (score >= 80) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

async function loadAllSessions(dirPath: string): Promise<AgentSession[]> {
  const files = await readdir(dirPath);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const sessions: AgentSession[] = [];
  for (const file of jsonFiles) {
    try {
      const filePath = join(dirPath, file);
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (data.framework === 'openclaw' || data.tool_calls) {
        sessions.push(await parseOpenClawSession(filePath));
      } else {
        sessions.push(await parseGenericSession(filePath));
      }
    } catch {
      // Skip
    }
  }

  return sessions;
}
