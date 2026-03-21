import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSession, AgentAction } from './types.js';

/**
 * Parse a generic JSON session log file into an AgentSession.
 * Supports a flexible schema to work with any agent framework.
 */
export async function parseGenericSession(filePath: string): Promise<AgentSession> {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);
  return normalizeGenericSession(data);
}

/**
 * Parse all JSON session files from a directory.
 */
export async function parseGenericDirectory(dirPath: string): Promise<AgentSession[]> {
  const files = await readdir(dirPath);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const sessions: AgentSession[] = [];
  for (const file of jsonFiles) {
    try {
      const session = await parseGenericSession(join(dirPath, file));
      sessions.push(session);
    } catch {
      // Skip files that can't be parsed
    }
  }

  return sessions.sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
}

/**
 * Normalize a generic session JSON object.
 * Tries multiple common field names for flexibility.
 */
function normalizeGenericSession(data: Record<string, unknown>): AgentSession {
  const prompt =
    (data.prompt as string) ||
    (data.system_prompt as string) ||
    (data.instructions as string) ||
    (data.task as string) ||
    (data.input as string) ||
    '';

  const rawActions =
    (data.tool_calls as unknown[]) ||
    (data.actions as unknown[]) ||
    (data.steps as unknown[]) ||
    (data.events as unknown[]) ||
    [];

  const actions: AgentAction[] = rawActions.map((action: unknown) => {
    const a = action as Record<string, unknown>;
    return {
      tool: (a.tool as string) || (a.name as string) || (a.function as string) || (a.type as string) || 'unknown',
      params: (a.params as Record<string, unknown>) ||
        (a.arguments as Record<string, unknown>) ||
        (a.input as Record<string, unknown>) ||
        (a.parameters as Record<string, unknown>) ||
        {},
      result: a.result ?? a.output ?? a.response ?? undefined,
      timestamp:
        (a.timestamp as string) ||
        (a.created_at as string) ||
        (a.time as string) ||
        new Date().toISOString(),
    };
  });

  const report =
    (data.report as string) ||
    (data.response as string) ||
    (data.summary as string) ||
    (data.output as string) ||
    (data.result as string) ||
    '';

  const framework =
    (data.framework as AgentSession['framework']) ||
    detectFramework(data) ||
    'custom';

  return {
    id: (data.id as string) || (data.session_id as string) || crypto.randomUUID(),
    prompt,
    actions,
    report,
    startedAt:
      (data.started_at as string) ||
      (data.created_at as string) ||
      (data.timestamp as string) ||
      (data.start as string) ||
      new Date().toISOString(),
    endedAt:
      (data.ended_at as string) ||
      (data.completed_at as string) ||
      (data.end as string) ||
      undefined,
    framework,
    model: (data.model as string) || undefined,
  };
}

/**
 * Attempt to detect the framework from session data.
 */
function detectFramework(data: Record<string, unknown>): AgentSession['framework'] | null {
  const str = JSON.stringify(data).toLowerCase();
  if (str.includes('openclaw') || str.includes('open_claw')) return 'openclaw';
  if (str.includes('langchain') || str.includes('lang_chain')) return 'langchain';
  if (str.includes('crewai') || str.includes('crew_ai')) return 'crewai';
  if (str.includes('claude-code') || str.includes('claude_code')) return 'claude-code';
  return null;
}
