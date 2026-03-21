import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseOpenClawSession,
  parseGenericSession,
  computeAlignment,
} from '../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../__fixtures__/sessions');

describe('end-to-end pipeline', () => {
  it('should parse OpenClaw session and compute alignment score', async () => {
    const session = await parseOpenClawSession(join(fixturesDir, 'openclaw-simple.json'));

    expect(session.id).toBe('session-001');
    expect(session.framework).toBe('openclaw');
    expect(session.actions).toHaveLength(3);

    const result = computeAlignment({
      prompt: session.prompt,
      actions: session.actions,
      report: session.report,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.details).toBeTruthy();
  });

  it('should parse generic session and compute alignment score', async () => {
    const session = await parseGenericSession(join(fixturesDir, 'generic-session.json'));

    expect(session.id).toBe('session-005');
    expect(session.actions).toHaveLength(3);

    const result = computeAlignment({
      prompt: session.prompt,
      actions: session.actions,
      report: session.report,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should detect lying agent end-to-end', async () => {
    const session = await parseOpenClawSession(join(fixturesDir, 'openclaw-lying.json'));

    const result = computeAlignment({
      prompt: session.prompt,
      actions: session.actions,
      report: session.report,
    });

    // Agent claims it sent emails but didn't
    expect(result.truthfulness).toBeLessThan(100);
    expect(result.missed.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect constraint violations end-to-end', async () => {
    const session = await parseOpenClawSession(join(fixturesDir, 'constraint-violation.json'));

    const result = computeAlignment({
      prompt: session.prompt,
      actions: session.actions,
      report: session.report,
    });

    expect(result.violations.length).toBeGreaterThanOrEqual(1);
  });

  it('should produce consistent scores for same input', async () => {
    const session = await parseOpenClawSession(join(fixturesDir, 'openclaw-simple.json'));
    const input = {
      prompt: session.prompt,
      actions: session.actions,
      report: session.report,
    };

    const result1 = computeAlignment(input);
    const result2 = computeAlignment(input);

    expect(result1.score).toBe(result2.score);
    expect(result1.truthfulness).toBe(result2.truthfulness);
    expect(result1.matched.length).toBe(result2.matched.length);
  });
});
