import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isWrapperMode, appendAction, writePrompt, writeMetadata } from '../src/log-writer.js';
import type { AgentAction } from '@llmagentscore/core';

describe('log-writer', () => {
  let savedLogDir: string | undefined;

  beforeEach(() => {
    savedLogDir = process.env.AGENTSCORE_LOG_DIR;
    delete process.env.AGENTSCORE_LOG_DIR;
  });

  afterEach(() => {
    if (savedLogDir !== undefined) {
      process.env.AGENTSCORE_LOG_DIR = savedLogDir;
    } else {
      delete process.env.AGENTSCORE_LOG_DIR;
    }
  });

  // -----------------------------------------------------------------------
  // isWrapperMode
  // -----------------------------------------------------------------------
  describe('isWrapperMode', () => {
    it('returns false when AGENTSCORE_LOG_DIR is not set', () => {
      expect(isWrapperMode()).toBe(false);
    });

    it('returns true when AGENTSCORE_LOG_DIR is set', () => {
      process.env.AGENTSCORE_LOG_DIR = '/tmp/test';
      expect(isWrapperMode()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // appendAction
  // -----------------------------------------------------------------------
  describe('appendAction', () => {
    it('is a no-op when env var is unset', () => {
      const action: AgentAction = {
        tool: 'test',
        params: {},
        timestamp: new Date().toISOString(),
      };
      // Should not throw
      expect(() => appendAction(action)).not.toThrow();
    });

    it('appends a JSON line to actions.jsonl when env var is set', () => {
      const dir = mkdtempSync(join(tmpdir(), 'logwriter-test-'));
      process.env.AGENTSCORE_LOG_DIR = dir;

      const action: AgentAction = {
        tool: 'web_search',
        params: { query: 'test' },
        timestamp: '2026-01-01T00:00:00Z',
      };

      appendAction(action);

      const content = readFileSync(join(dir, 'actions.jsonl'), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(action);

      rmSync(dir, { recursive: true, force: true });
    });

    it('appends multiple actions as separate lines', () => {
      const dir = mkdtempSync(join(tmpdir(), 'logwriter-test-'));
      process.env.AGENTSCORE_LOG_DIR = dir;

      appendAction({ tool: 'a', params: {}, timestamp: '2026-01-01T00:00:00Z' });
      appendAction({ tool: 'b', params: {}, timestamp: '2026-01-01T00:00:01Z' });

      const content = readFileSync(join(dir, 'actions.jsonl'), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).tool).toBe('a');
      expect(JSON.parse(lines[1]).tool).toBe('b');

      rmSync(dir, { recursive: true, force: true });
    });

    it('silently handles write errors (invalid dir path)', () => {
      process.env.AGENTSCORE_LOG_DIR = '/nonexistent/path/that/does/not/exist';
      expect(() =>
        appendAction({ tool: 'x', params: {}, timestamp: '2026-01-01T00:00:00Z' }),
      ).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // writePrompt
  // -----------------------------------------------------------------------
  describe('writePrompt', () => {
    it('is a no-op when env var is unset', () => {
      expect(() => writePrompt('hello')).not.toThrow();
    });

    it('writes prompt.txt when env var is set', () => {
      const dir = mkdtempSync(join(tmpdir(), 'logwriter-test-'));
      process.env.AGENTSCORE_LOG_DIR = dir;

      writePrompt('Do something useful.');

      const content = readFileSync(join(dir, 'prompt.txt'), 'utf-8');
      expect(content).toBe('Do something useful.');

      rmSync(dir, { recursive: true, force: true });
    });

    it('only writes once (second call is no-op)', () => {
      const dir = mkdtempSync(join(tmpdir(), 'logwriter-test-'));
      process.env.AGENTSCORE_LOG_DIR = dir;

      writePrompt('first');
      writePrompt('second');

      const content = readFileSync(join(dir, 'prompt.txt'), 'utf-8');
      expect(content).toBe('first');

      rmSync(dir, { recursive: true, force: true });
    });

    it('silently handles write errors', () => {
      process.env.AGENTSCORE_LOG_DIR = '/nonexistent/path/that/does/not/exist';
      expect(() => writePrompt('hello')).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // writeMetadata
  // -----------------------------------------------------------------------
  describe('writeMetadata', () => {
    it('is a no-op when env var is unset', () => {
      expect(() => writeMetadata({ sessionId: '123' })).not.toThrow();
    });

    it('writes metadata.json when env var is set', () => {
      const dir = mkdtempSync(join(tmpdir(), 'logwriter-test-'));
      process.env.AGENTSCORE_LOG_DIR = dir;

      const meta = { sessionId: 'abc', label: 'test' };
      writeMetadata(meta);

      const content = readFileSync(join(dir, 'metadata.json'), 'utf-8');
      expect(JSON.parse(content)).toEqual(meta);

      rmSync(dir, { recursive: true, force: true });
    });

    it('only writes once (second call is no-op)', () => {
      const dir = mkdtempSync(join(tmpdir(), 'logwriter-test-'));
      process.env.AGENTSCORE_LOG_DIR = dir;

      writeMetadata({ version: 1 });
      writeMetadata({ version: 2 });

      const content = readFileSync(join(dir, 'metadata.json'), 'utf-8');
      expect(JSON.parse(content).version).toBe(1);

      rmSync(dir, { recursive: true, force: true });
    });

    it('silently handles write errors', () => {
      process.env.AGENTSCORE_LOG_DIR = '/nonexistent/path/that/does/not/exist';
      expect(() => writeMetadata({ x: 1 })).not.toThrow();
    });
  });
});
