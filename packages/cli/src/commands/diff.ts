import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  parseOpenClawSession,
  parseGenericSession,
  parsePrompt,
  matchScore,
  type AgentSession,
} from '@agentscore/core';

export interface DiffOptions {
  path?: string;
  session?: string;
}

/**
 * The `agentscore diff` command.
 * Side-by-side comparison of prompt instructions vs actual actions.
 */
export async function diffCommand(options: DiffOptions): Promise<void> {
  const targetPath = resolve(options.path || '.');

  try {
    const session = await loadSingleSession(targetPath);
    const { instructions, constraints } = parsePrompt(session.prompt);

    console.log('');
    console.log(chalk.bold('AgentScore Diff — Instructions vs Actions'));
    console.log(chalk.dim('═'.repeat(70)));
    console.log('');

    // Create side-by-side table
    const table = new Table({
      head: [
        chalk.bold('Expected (from prompt)'),
        chalk.bold('Status'),
        chalk.bold('Actual Action'),
      ],
      colWidths: [35, 10, 30],
      wordWrap: true,
    });

    for (const instruction of instructions) {
      let bestScore = 0;
      let bestAction = '';

      for (const action of session.actions) {
        const score = matchScore(instruction.text, action.tool, action.params);
        if (score > bestScore) {
          bestScore = score;
          bestAction = action.tool;
        }
      }

      if (bestScore >= 0.7) {
        table.push([
          chalk.white(instruction.text),
          chalk.green('✅ Match'),
          chalk.cyan(bestAction),
        ]);
      } else if (bestScore >= 0.4) {
        table.push([
          chalk.white(instruction.text),
          chalk.yellow('~ Partial'),
          chalk.yellow(bestAction),
        ]);
      } else {
        table.push([
          chalk.white(instruction.text),
          chalk.red('❌ Miss'),
          chalk.dim('NOT FOUND'),
        ]);
      }
    }

    // Show unexpected actions
    const usedTools = new Set<string>();
    for (const instruction of instructions) {
      for (const action of session.actions) {
        const score = matchScore(instruction.text, action.tool, action.params);
        if (score >= 0.4) {
          usedTools.add(action.tool);
        }
      }
    }

    for (const action of session.actions) {
      if (!usedTools.has(action.tool)) {
        table.push([
          chalk.dim('(not in prompt)'),
          chalk.yellow('⚠️ Extra'),
          chalk.yellow(action.tool),
        ]);
      }
    }

    console.log(table.toString());

    if (constraints.length > 0) {
      console.log('');
      console.log(chalk.bold('Constraints:'));
      for (const c of constraints) {
        console.log(`  ${chalk.dim(c.type.toUpperCase())} ${chalk.white(c.text)}`);
      }
    }

    console.log('');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error:', message);
    process.exit(1);
  }
}

async function loadSingleSession(targetPath: string): Promise<AgentSession> {
  const stats = await stat(targetPath);

  if (stats.isDirectory()) {
    // Load most recent session from directory
    const { readdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const files = (await readdir(targetPath))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) throw new Error('No session files found');
    targetPath = join(targetPath, files[0]);
  }

  const content = await readFile(targetPath, 'utf-8');
  const data = JSON.parse(content);

  if (data.framework === 'openclaw' || data.tool_calls) {
    return parseOpenClawSession(targetPath);
  }
  return parseGenericSession(targetPath);
}
