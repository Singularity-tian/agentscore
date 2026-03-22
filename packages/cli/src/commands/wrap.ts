import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import chalk from 'chalk';
import { computeAlignment, type AgentAction } from '@llmagentscore/core';

export interface WrapOptions {
  prompt: string;
  agentName?: string;
  framework?: string;
  model?: string;
  format?: string;
  noUpload?: boolean;
  output?: string;
  command: string[];
}

interface AgentScoreConfig {
  apiKey?: string;
  dashboardUrl?: string;
}

const CONFIG_PATH = join(homedir(), '.agentscore', 'config.json');
const DEFAULT_DASHBOARD_URL = 'https://getagentscore.com';

/**
 * The `agentscore wrap` command.
 *
 * Spawns a subprocess with `AGENTSCORE_LOG_DIR` set so the SDK writes
 * actions to a JSONL file. On exit the wrapper reads the log, uploads
 * raw data to `/api/v1/score` for server-side scoring, and displays
 * the result.
 *
 * The agent process never touches the upload — only the CLI wrapper does.
 */
export async function wrapCommand(options: WrapOptions): Promise<void> {
  const [cmd, ...args] = options.command;

  if (!cmd) {
    console.error(chalk.red('Usage: agentscore wrap -p "prompt" -- <command>'));
    process.exit(1);
  }

  // Create temp dir for JSONL log
  const logDir = mkdtempSync(join(tmpdir(), 'agentscore-'));

  console.log(chalk.dim(`Wrapping: ${cmd} ${args.join(' ')}`));
  console.log(chalk.dim(`Log dir:  ${logDir}`));
  console.log('');

  const startedAt = new Date().toISOString();

  const child = spawn(cmd, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      AGENTSCORE_LOG_DIR: logDir,
    },
  });

  child.stdout.on('data', (data: Buffer) => {
    process.stdout.write(data);
  });

  child.stderr.on('data', (data: Buffer) => {
    process.stderr.write(data);
  });

  child.on('close', async (code) => {
    const endedAt = new Date().toISOString();

    console.log('');
    console.log(chalk.dim('─'.repeat(55)));
    console.log(chalk.dim(`Process exited with code ${code}`));

    // Read actions from JSONL
    const actions = readActionsFromLog(logDir);

    if (actions.length === 0) {
      console.log(chalk.yellow('Warning: No actions recorded. Make sure the agent uses the @llmagentscore/sdk.'));
    } else {
      console.log(chalk.dim(`Captured ${actions.length} action(s) from JSONL log.`));
    }

    const agentName = options.agentName ?? 'unnamed-agent';
    const framework = options.framework ?? 'custom';
    const model = options.model;

    if (options.noUpload) {
      // Score locally
      const score = computeAlignment({
        prompt: options.prompt,
        actions,
        report: '',
      });

      displayLocalScore(score);

      if (options.output) {
        const { writeFile, mkdir } = await import('node:fs/promises');
        await mkdir(options.output, { recursive: true });
        const outPath = join(options.output, `wrap-${Date.now()}.json`);
        await writeFile(outPath, JSON.stringify({
          agentName,
          prompt: options.prompt,
          actions,
          score,
          startedAt,
          endedAt,
          framework,
          model,
        }, null, 2));
        console.log(chalk.dim(`Results saved to ${outPath}`));
      }
    } else {
      // Upload to /api/v1/score for server-side scoring
      const config = loadConfig();

      if (!config.apiKey) {
        console.log('');
        console.log(chalk.yellow('No API key configured — cannot upload results.'));
        console.log('');
        console.log('To upload scores to the dashboard:');
        console.log(`  1. Sign up at ${chalk.cyan(DEFAULT_DASHBOARD_URL)}`);
        console.log(`  2. Copy your API key from Settings`);
        console.log(`  3. Run: ${chalk.cyan('agentscore config --api-key sk_xxx')}`);
        console.log('');
        console.log(`Or use ${chalk.cyan('--no-upload')} to score locally.`);
        cleanupLogDir(logDir);
        process.exit(1);
      }

      const dashboardUrl = config.dashboardUrl || DEFAULT_DASHBOARD_URL;

      try {
        const payload = {
          agentName,
          prompt: options.prompt,
          actions,
          report: '',
          startedAt,
          endedAt,
          framework,
          model,
          source: 'cli-wrap',
        };

        const response = await fetch(`${dashboardUrl}/api/v1/score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.error(chalk.red(`Dashboard responded with ${response.status}: ${text}`));
        } else {
          const result = await response.json() as Record<string, unknown>;
          displayServerResult(result);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Upload failed: ${msg}`));
      }
    }

    // Clean up temp dir
    cleanupLogDir(logDir);

    process.exit(code || 0);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readActionsFromLog(logDir: string): AgentAction[] {
  const actions: AgentAction[] = [];
  const filePath = join(logDir, 'actions.jsonl');

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    // No actions file — agent may not have used the SDK
    return actions;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as AgentAction;
      if (parsed.tool) {
        actions.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return actions;
}

function displayLocalScore(score: { score: number; truthfulness: number; matched: unknown[]; missed: unknown[]; unexpected: unknown[] }): void {
  console.log('');
  console.log(chalk.bold('Local Score:'));
  console.log(`  Alignment:     ${colorScore(score.score)}`);
  console.log(`  Truthfulness:  ${colorScore(score.truthfulness)}`);
  console.log(`  Matched:       ${score.matched.length}`);
  console.log(`  Missed:        ${score.missed.length}`);
  console.log(`  Unexpected:    ${score.unexpected.length}`);
}

function displayServerResult(result: Record<string, unknown>): void {
  console.log('');
  console.log(chalk.bold('Server Score:'));
  if (result.skipped) {
    console.log(chalk.yellow('  Session was skipped (duplicate).'));
    return;
  }
  if (typeof result.alignmentScore === 'number') {
    console.log(`  Alignment:     ${colorScore(result.alignmentScore as number)}`);
  }
  if (typeof result.truthfulnessScore === 'number') {
    console.log(`  Truthfulness:  ${colorScore(result.truthfulnessScore as number)}`);
  }
  if (typeof result.matched === 'number') {
    console.log(`  Matched:       ${result.matched}`);
  }
  if (typeof result.missed === 'number') {
    console.log(`  Missed:        ${result.missed}`);
  }
  if (typeof result.unexpected === 'number') {
    console.log(`  Unexpected:    ${result.unexpected}`);
  }
  if (typeof result.id === 'string') {
    console.log(chalk.dim(`  Session ID:    ${result.id}`));
  }
}

function colorScore(score: number): string {
  const pct = `${score.toFixed(1)}%`;
  if (score >= 80) return chalk.green(pct);
  if (score >= 50) return chalk.yellow(pct);
  return chalk.red(pct);
}

function loadConfig(): AgentScoreConfig {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function cleanupLogDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
