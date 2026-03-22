import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentScoreReporter } from '../src/reporter.js';
import type { SessionResult } from '../src/session.js';
import type { AlignmentScore } from '@llmagentscore/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(body: unknown = {}, status = 200): Response {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSessionResult(overrides: Partial<SessionResult> = {}): SessionResult {
  const score: AlignmentScore = {
    score: 85,
    truthfulness: 90,
    matched: [],
    missed: [],
    unexpected: [],
    violations: [],
    details: '',
  };

  return {
    sessionId: 'test-session-1',
    label: 'test',
    model: 'gpt-4',
    actions: [
      { tool: 'web_search', params: { q: 'test' }, timestamp: '2026-01-01T00:00:00Z' },
    ],
    prompt: 'Search the web for test.',
    report: 'I searched the web.',
    score,
    startedAt: '2026-01-01T00:00:00Z',
    endedAt: '2026-01-01T00:01:00Z',
    durationMs: 60000,
    ...overrides,
  };
}

describe('AgentScoreReporter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -----------------------------------------------------------------------
  // Constructor validation
  // -----------------------------------------------------------------------
  it('throws when dashboardUrl is empty', () => {
    expect(
      () => new AgentScoreReporter({ dashboardUrl: '', apiKey: 'sk_test' }),
    ).toThrow(/dashboardUrl/);
  });

  it('throws when apiKey is empty', () => {
    expect(
      () => new AgentScoreReporter({ dashboardUrl: 'https://example.com', apiKey: '' }),
    ).toThrow(/apiKey/);
  });

  // -----------------------------------------------------------------------
  // report()
  // -----------------------------------------------------------------------
  describe('report', () => {
    it('sends POST to /api/v1/score', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(
        mockResponse({ id: 'sess-1', alignmentScore: 85 }),
      );
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com',
        apiKey: 'sk_test_123',
        agentName: 'my-agent',
      });

      await reporter.report(makeSessionResult());

      expect(fakeFetch).toHaveBeenCalledTimes(1);
      const [url, init] = fakeFetch.mock.calls[0];
      expect(url).toBe('https://dash.example.com/api/v1/score');
      expect(init.method).toBe('POST');
    });

    it('payload includes prompt, actions, report, source: sdk', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(mockResponse({ id: 'sess-1' }));
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com',
        apiKey: 'sk_test',
      });

      const result = makeSessionResult();
      await reporter.report(result);

      const body = JSON.parse(fakeFetch.mock.calls[0][1].body);
      expect(body.prompt).toBe(result.prompt);
      expect(body.actions).toEqual(result.actions);
      expect(body.report).toBe(result.report);
      expect(body.source).toBe('sdk');
    });

    it('includes Authorization header', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(mockResponse({}));
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com',
        apiKey: 'sk_my_key',
      });

      await reporter.report(makeSessionResult());

      const headers = fakeFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer sk_my_key');
    });

    it('parses response fields correctly', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(
        mockResponse({
          id: 'sess-1',
          alignmentScore: 73,
          truthfulnessScore: 88,
          skipped: false,
          details: 'matched 5/6',
        }),
      );
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com',
        apiKey: 'sk_test',
      });

      const resp = await reporter.report(makeSessionResult());
      expect(resp.ok).toBe(true);
      expect(resp.alignmentScore).toBe(73);
      expect(resp.truthfulnessScore).toBe(88);
      expect(resp.skipped).toBe(false);
      expect(resp.details).toBe('matched 5/6');
      expect(resp.reportId).toBe('sess-1');
    });

    it('throws on non-200 response', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(
        new Response('Unauthorized', { status: 401 }),
      );
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com',
        apiKey: 'sk_bad',
      });

      await expect(reporter.report(makeSessionResult())).rejects.toThrow(/401/);
    });

    it('silent mode returns { ok: false } on error', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(
        new Response('Server Error', { status: 500 }),
      );
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com',
        apiKey: 'sk_test',
        silent: true,
      });

      const resp = await reporter.report(makeSessionResult());
      expect(resp.ok).toBe(false);
    });

    it('trims trailing slash from dashboardUrl', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(mockResponse({}));
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com/',
        apiKey: 'sk_test',
      });

      await reporter.report(makeSessionResult());

      const url = fakeFetch.mock.calls[0][0];
      expect(url).toBe('https://dash.example.com/api/v1/score');
    });
  });

  // -----------------------------------------------------------------------
  // reportBatch()
  // -----------------------------------------------------------------------
  describe('reportBatch', () => {
    it('sends batch format with tasks array', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
      globalThis.fetch = fakeFetch;

      const reporter = new AgentScoreReporter({
        dashboardUrl: 'https://dash.example.com',
        apiKey: 'sk_test',
        agentName: 'batch-agent',
        framework: 'langchain',
      });

      await reporter.reportBatch([makeSessionResult(), makeSessionResult()]);

      const body = JSON.parse(fakeFetch.mock.calls[0][1].body);
      expect(body.agentName).toBe('batch-agent');
      expect(body.framework).toBe('langchain');
      expect(body.source).toBe('sdk');
      expect(body.tasks).toHaveLength(2);
      expect(body.tasks[0]).toHaveProperty('prompt');
      expect(body.tasks[0]).toHaveProperty('actions');
      expect(body.tasks[0]).toHaveProperty('report');
    });
  });

  // -----------------------------------------------------------------------
  // Timeout
  // -----------------------------------------------------------------------
  it('aborts after configured timeout', async () => {
    const fakeFetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Simulate the abort signal firing
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    globalThis.fetch = fakeFetch;

    const reporter = new AgentScoreReporter({
      dashboardUrl: 'https://dash.example.com',
      apiKey: 'sk_test',
      timeoutMs: 50,
    });

    await expect(reporter.report(makeSessionResult())).rejects.toThrow(/aborted/i);
  });
});
