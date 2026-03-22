import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentAction } from '@llmagentscore/core';

/**
 * Singleton JSONL log writer for the CLI wrapper anti-tampering flow.
 *
 * When `AGENTSCORE_LOG_DIR` is set, every action is appended to
 * `$AGENTSCORE_LOG_DIR/actions.jsonl` using synchronous writes so each
 * action is flushed immediately (crash-safe).
 *
 * When the env var is not set, all methods are silent no-ops.
 */

function getLogDir(): string | undefined {
  return process.env.AGENTSCORE_LOG_DIR;
}

/** Returns `true` when the CLI wrapper has set `AGENTSCORE_LOG_DIR`. */
export function isWrapperMode(): boolean {
  return !!getLogDir();
}

/** Append a single action as a JSON line to `actions.jsonl`. */
export function appendAction(action: AgentAction): void {
  const dir = getLogDir();
  if (!dir) return;
  try {
    appendFileSync(join(dir, 'actions.jsonl'), JSON.stringify(action) + '\n');
  } catch {
    // Best-effort — never break the agent.
  }
}

/** Write the prompt to `prompt.txt` (once). */
export function writePrompt(prompt: string): void {
  const dir = getLogDir();
  if (!dir) return;
  try {
    const target = join(dir, 'prompt.txt');
    if (!existsSync(target)) {
      writeFileSync(target, prompt, 'utf-8');
    }
  } catch {
    // Best-effort.
  }
}

/** Write session metadata to `metadata.json` (once). */
export function writeMetadata(meta: Record<string, unknown>): void {
  const dir = getLogDir();
  if (!dir) return;
  try {
    const target = join(dir, 'metadata.json');
    if (!existsSync(target)) {
      writeFileSync(target, JSON.stringify(meta, null, 2), 'utf-8');
    }
  } catch {
    // Best-effort.
  }
}
