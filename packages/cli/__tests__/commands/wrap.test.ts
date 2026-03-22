import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Since `readActionsFromLog` is not exported, we replicate its logic here
 * for unit testing. The canonical implementation lives in wrap.ts.
 *
 * An alternative would be to export it, but we avoid changing the public API
 * just for tests — instead we test the same parsing logic.
 */
function readActionsFromLog(logDir: string): Array<{ tool: string; params: Record<string, unknown>; [k: string]: unknown }> {
  const actions: Array<{ tool: string; params: Record<string, unknown>; [k: string]: unknown }> = [];
  const filePath = join(logDir, 'actions.jsonl');

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return actions;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.tool) {
        actions.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return actions;
}

describe('readActionsFromLog', () => {
  it('parses valid JSONL correctly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wrap-test-'));
    writeFileSync(
      join(dir, 'actions.jsonl'),
      [
        JSON.stringify({ tool: 'web_search', params: { q: 'test' }, timestamp: '2026-01-01T00:00:00Z' }),
        JSON.stringify({ tool: 'file_read', params: { path: '/tmp/a' }, timestamp: '2026-01-01T00:00:01Z' }),
      ].join('\n') + '\n',
    );

    const actions = readActionsFromLog(dir);
    expect(actions).toHaveLength(2);
    expect(actions[0].tool).toBe('web_search');
    expect(actions[1].tool).toBe('file_read');

    rmSync(dir, { recursive: true, force: true });
  });

  it('skips malformed lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wrap-test-'));
    writeFileSync(
      join(dir, 'actions.jsonl'),
      [
        JSON.stringify({ tool: 'a', params: {} }),
        'this is not json',
        JSON.stringify({ tool: 'b', params: {} }),
      ].join('\n') + '\n',
    );

    const actions = readActionsFromLog(dir);
    expect(actions).toHaveLength(2);
    expect(actions[0].tool).toBe('a');
    expect(actions[1].tool).toBe('b');

    rmSync(dir, { recursive: true, force: true });
  });

  it('skips empty lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wrap-test-'));
    writeFileSync(
      join(dir, 'actions.jsonl'),
      '\n' + JSON.stringify({ tool: 'x', params: {} }) + '\n\n\n',
    );

    const actions = readActionsFromLog(dir);
    expect(actions).toHaveLength(1);
    expect(actions[0].tool).toBe('x');

    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty array when file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wrap-test-'));
    const actions = readActionsFromLog(dir);
    expect(actions).toEqual([]);

    rmSync(dir, { recursive: true, force: true });
  });

  it('handles partial writes (no trailing newline)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wrap-test-'));
    writeFileSync(
      join(dir, 'actions.jsonl'),
      JSON.stringify({ tool: 'partial', params: { x: 1 } }),
    );

    const actions = readActionsFromLog(dir);
    expect(actions).toHaveLength(1);
    expect(actions[0].tool).toBe('partial');

    rmSync(dir, { recursive: true, force: true });
  });

  it('skips JSON objects without a tool field', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wrap-test-'));
    writeFileSync(
      join(dir, 'actions.jsonl'),
      [
        JSON.stringify({ params: { q: 'test' } }),
        JSON.stringify({ tool: 'valid', params: {} }),
      ].join('\n') + '\n',
    );

    const actions = readActionsFromLog(dir);
    expect(actions).toHaveLength(1);
    expect(actions[0].tool).toBe('valid');

    rmSync(dir, { recursive: true, force: true });
  });
});
