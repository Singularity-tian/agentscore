import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  parseOpenClawSession,
  parseGenericSession,
  scoreSession,
  createAnthropicProvider,
  type AgentSession,
  type AlignmentScore,
  type LlmProvider,
} from '@agentscore/core';
import { formatTerminal } from '../output/terminal.js';
import { formatJson } from '../output/json.js';
import { formatMarkdown } from '../output/markdown.js';

export interface CheckOptions {
  path?: string;
  format?: 'terminal' | 'json' | 'markdown';
  threshold?: number;
  remote?: boolean;
}

/**
 * The `agentscore check` command.
 * Score agent sessions from a directory or file.
 *
 * If ANTHROPIC_API_KEY is set, uses the LLM-as-judge pipeline.
 * If --remote is passed, POSTs to the dashboard API instead.
 */
export async function checkCommand(options: CheckOptions): Promise<void> {
  const targetPath = resolve(options.path || '.');
  const format = options.format || 'terminal';
  const threshold = options.threshold;

  try {
    const stats = await stat(targetPath);
    let sessions: AgentSession[];

    if (stats.isDirectory()) {
      sessions = await loadSessionsFromDir(targetPath);
    } else {
      sessions = [await loadSession(targetPath)];
    }

    if (sessions.length === 0) {
      console.error('No session files found at:', targetPath);
      process.exit(1);
    }

    // Create LLM provider if API key is available
    let llm: LlmProvider | undefined;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        llm = createAnthropicProvider();
      } catch {
        // SDK not installed — fall back to deterministic
      }
    }

    let hasFailure = false;

    for (const session of sessions) {
      let result: AlignmentScore;

      if (options.remote) {
        result = await scoreRemote(session);
      } else {
        result = await scoreSession(
          {
            prompt: session.prompt,
            actions: session.actions,
            report: session.report,
          },
          llm,
        );
      }

      const output = formatResult(result, format, session.id);
      console.log(output);

      if (threshold !== undefined && result.score < threshold) {
        hasFailure = true;
      }
    }

    if (hasFailure) {
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error:', message);
    process.exit(1);
  }
}

/**
 * Score a session by POSTing to the dashboard API.
 */
async function scoreRemote(session: AgentSession): Promise<AlignmentScore> {
  const apiKey = process.env.AGENTSCORE_API_KEY;
  if (!apiKey) {
    throw new Error('AGENTSCORE_API_KEY is required for --remote scoring.');
  }

  const dashboardUrl = process.env.AGENTSCORE_DASHBOARD_URL || 'https://getagentscore.com';
  const response = await fetch(`${dashboardUrl}/api/v1/score`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentName: session.id,
      prompt: session.prompt,
      actions: session.actions,
      report: session.report,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      framework: session.framework,
      model: session.model,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Remote scoring failed (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    alignmentScore: number;
    truthfulnessScore: number;
    matched: number;
    missed: number;
    unexpected: number;
    violations: number;
    details: string;
  };

  // Convert API response to AlignmentScore shape for formatting
  return {
    score: data.alignmentScore,
    truthfulness: data.truthfulnessScore,
    matched: [],
    missed: [],
    unexpected: [],
    violations: [],
    details: data.details,
  };
}

async function loadSessionsFromDir(dirPath: string): Promise<AgentSession[]> {
  const files = await readdir(dirPath);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const sessions: AgentSession[] = [];
  for (const file of jsonFiles) {
    try {
      const session = await loadSession(join(dirPath, file));
      sessions.push(session);
    } catch {
      // Skip files that can't be parsed
    }
  }

  return sessions;
}

async function loadSession(filePath: string): Promise<AgentSession> {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  // Try to detect format
  if (data.framework === 'openclaw' || data.tool_calls) {
    return (await parseOpenClawSession(filePath));
  }
  return (await parseGenericSession(filePath));
}

function formatResult(
  result: AlignmentScore,
  format: string,
  sessionId?: string,
): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'markdown':
      return formatMarkdown(result, sessionId);
    case 'terminal':
    default:
      return formatTerminal(result, sessionId);
  }
}
