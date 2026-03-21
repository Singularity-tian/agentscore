import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSession, AgentAction } from './types.js';

/**
 * Parse OpenClaw session logs from a directory into an AgentSession.
 * OpenClaw stores session data as JSON files in ~/.openclaw/ or a workspace.
 */
export async function parseOpenClawSession(sessionPath: string): Promise<AgentSession> {
  const content = await readFile(sessionPath, 'utf-8');
  const data = JSON.parse(content);
  return normalizeOpenClawSession(data);
}

/**
 * Parse all OpenClaw sessions from a directory.
 */
export async function parseOpenClawDirectory(dirPath: string): Promise<AgentSession[]> {
  const files = await readdir(dirPath);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const sessions: AgentSession[] = [];
  for (const file of jsonFiles) {
    try {
      const session = await parseOpenClawSession(join(dirPath, file));
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
 * Normalize an OpenClaw session JSON object into our standard format.
 * Handles various OpenClaw log formats.
 */
function normalizeOpenClawSession(data: Record<string, unknown>): AgentSession {
  // Extract prompt from various possible fields
  const prompt =
    (data.prompt as string) ||
    (data.system_prompt as string) ||
    (data.instructions as string) ||
    (data.task as string) ||
    '';

  // Extract actions / tool calls
  const rawActions =
    (data.tool_calls as unknown[]) ||
    (data.actions as unknown[]) ||
    (data.steps as unknown[]) ||
    [];

  const actions: AgentAction[] = rawActions.map((action: unknown) => {
    const a = action as Record<string, unknown>;
    return {
      tool: (a.tool as string) || (a.name as string) || (a.function as string) || 'unknown',
      params: (a.params as Record<string, unknown>) ||
        (a.arguments as Record<string, unknown>) ||
        (a.input as Record<string, unknown>) ||
        {},
      result: a.result ?? a.output ?? a.response ?? undefined,
      timestamp:
        (a.timestamp as string) ||
        (a.created_at as string) ||
        new Date().toISOString(),
    };
  });

  // Extract report (agent's summary of what it did)
  const report =
    (data.report as string) ||
    (data.response as string) ||
    (data.summary as string) ||
    (data.output as string) ||
    '';

  return {
    id: (data.id as string) || (data.session_id as string) || crypto.randomUUID(),
    prompt,
    actions,
    report,
    startedAt:
      (data.started_at as string) ||
      (data.created_at as string) ||
      (data.timestamp as string) ||
      new Date().toISOString(),
    endedAt: (data.ended_at as string) || (data.completed_at as string) || undefined,
    framework: 'openclaw',
    model: (data.model as string) || undefined,
  };
}
