import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  parseOpenClawSession,
  parseGenericSession,
  computeAlignment,
  type AgentSession,
  type AlignmentScore,
} from '@agentscore/core';
import { formatTerminal } from '../output/terminal.js';
import { formatJson } from '../output/json.js';
import { formatMarkdown } from '../output/markdown.js';

export interface CheckOptions {
  path?: string;
  format?: 'terminal' | 'json' | 'markdown';
  threshold?: number;
}

/**
 * The `agentscore check` command.
 * Score agent sessions from a directory or file.
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

    let hasFailure = false;

    for (const session of sessions) {
      const result = computeAlignment({
        prompt: session.prompt,
        actions: session.actions,
        report: session.report,
      });

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
