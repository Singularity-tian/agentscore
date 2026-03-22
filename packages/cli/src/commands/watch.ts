import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import {
  computeAlignment,
  type AgentAction,
} from '@llmagentscore/core';

export interface WatchOptions {
  command: string[];
  output?: string;
}

/**
 * The `agentscore watch` command.
 * Wrap and monitor an agent process, capturing its output for scoring.
 */
export async function watchCommand(options: WatchOptions): Promise<void> {
  const [cmd, ...args] = options.command;

  if (!cmd) {
    console.error(chalk.red('Usage: agentscore watch -- <command>'));
    process.exit(1);
  }

  console.log(chalk.dim(`Watching: ${cmd} ${args.join(' ')}`));
  console.log(chalk.dim('Capturing output for scoring...'));
  console.log('');

  const stdout: string[] = [];
  const stderr: string[] = [];
  const startedAt = new Date().toISOString();

  const child = spawn(cmd, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  });

  child.stdout.on('data', (data: Buffer) => {
    const text = data.toString();
    stdout.push(text);
    process.stdout.write(text);
  });

  child.stderr.on('data', (data: Buffer) => {
    const text = data.toString();
    stderr.push(text);
    process.stderr.write(text);
  });

  child.on('close', async (code) => {
    const endedAt = new Date().toISOString();
    const fullOutput = stdout.join('');

    console.log('');
    console.log(chalk.dim('─'.repeat(55)));
    console.log(chalk.dim(`Process exited with code ${code}`));

    // Try to extract actions from output (look for JSON tool calls)
    const actions = extractActionsFromOutput(fullOutput);

    if (actions.length > 0) {
      console.log(chalk.dim(`Detected ${actions.length} tool call(s) in output.`));

      // Save session
      const sessionData = {
        id: crypto.randomUUID(),
        prompt: '(captured from process output)',
        actions,
        report: fullOutput.slice(-500),
        started_at: startedAt,
        ended_at: endedAt,
        framework: 'custom',
      };

      const outputDir = options.output || join(homedir(), '.agentscore', 'sessions');
      await mkdir(outputDir, { recursive: true });
      const sessionPath = join(outputDir, `session-${Date.now()}.json`);
      await writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
      console.log(chalk.dim(`Session saved to ${sessionPath}`));
    } else {
      console.log(chalk.yellow('No tool calls detected in output.'));
    }

    process.exit(code || 0);
  });
}

/**
 * Try to extract tool call actions from process output.
 * Looks for JSON objects that look like tool calls.
 */
function extractActionsFromOutput(output: string): AgentAction[] {
  const actions: AgentAction[] = [];

  // Look for JSON-like tool call patterns
  const toolCallPattern = /\{[^{}]*"tool"[^{}]*\}/g;
  const matches = output.match(toolCallPattern);

  if (matches) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed.tool) {
          actions.push({
            tool: parsed.tool,
            params: parsed.params || parsed.arguments || {},
            result: parsed.result,
            timestamp: parsed.timestamp || new Date().toISOString(),
          });
        }
      } catch {
        // Not valid JSON, skip
      }
    }
  }

  return actions;
}
