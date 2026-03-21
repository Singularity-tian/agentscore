import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installInterceptor } from '../src/interceptor.js';
import type { AgentAction } from '@agentscore/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock Response. */
function mockResponse(body: unknown = {}, status = 200): Response {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('installInterceptor', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    // Always restore in case a test fails before calling handle.restore().
    globalThis.fetch = originalFetch;
  });

  // -----------------------------------------------------------------------
  // Basic interception
  // -----------------------------------------------------------------------
  it('intercepts fetch calls to known LLM hosts', async () => {
    const captured: AgentAction[] = [];
    const fakeFetch = vi.fn().mockResolvedValue(
      mockResponse({ id: 'chatcmpl-123', choices: [] }),
    );
    globalThis.fetch = fakeFetch;

    const handle = installInterceptor((action) => captured.push(action));

    await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4', messages: [] }),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].tool).toBe('llm_call:openai');
    expect(captured[0].params).toMatchObject({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      status: 200,
    });
    expect(captured[0].result).toEqual({ id: 'chatcmpl-123', choices: [] });
    expect(captured[0].timestamp).toBeDefined();

    handle.restore();
  });

  it('intercepts Anthropic API calls', async () => {
    const captured: AgentAction[] = [];
    const fakeFetch = vi.fn().mockResolvedValue(mockResponse({ id: 'msg-1' }));
    globalThis.fetch = fakeFetch;

    const handle = installInterceptor((action) => captured.push(action));

    await globalThis.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514' }),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].tool).toBe('llm_call:anthropic');

    handle.restore();
  });

  // -----------------------------------------------------------------------
  // Non-LLM requests should pass through
  // -----------------------------------------------------------------------
  it('does not intercept non-LLM requests', async () => {
    const captured: AgentAction[] = [];
    const fakeFetch = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    globalThis.fetch = fakeFetch;

    const handle = installInterceptor((action) => captured.push(action));

    await globalThis.fetch('https://example.com/api/data');

    expect(captured).toHaveLength(0);
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    handle.restore();
  });

  // -----------------------------------------------------------------------
  // Extra host patterns
  // -----------------------------------------------------------------------
  it('supports extraHosts option', async () => {
    const captured: AgentAction[] = [];
    const fakeFetch = vi.fn().mockResolvedValue(mockResponse());
    globalThis.fetch = fakeFetch;

    const handle = installInterceptor((action) => captured.push(action), {
      extraHosts: [/my-custom-llm\.internal/],
    });

    await globalThis.fetch('https://my-custom-llm.internal/generate', {
      method: 'POST',
      body: '{}',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].tool).toContain('llm_call:');

    handle.restore();
  });

  // -----------------------------------------------------------------------
  // Body redaction
  // -----------------------------------------------------------------------
  it('redacts bodies when redactBodies is true', async () => {
    const captured: AgentAction[] = [];
    const fakeFetch = vi.fn().mockResolvedValue(
      mockResponse({ secret: 'value' }),
    );
    globalThis.fetch = fakeFetch;

    const handle = installInterceptor((action) => captured.push(action), {
      redactBodies: true,
    });

    await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] }),
    });

    expect(captured).toHaveLength(1);
    // Body should NOT appear in params
    expect(captured[0].params).not.toHaveProperty('body');
    // Result should be undefined
    expect(captured[0].result).toBeUndefined();

    handle.restore();
  });

  // -----------------------------------------------------------------------
  // Restore
  // -----------------------------------------------------------------------
  it('restores the original fetch', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(mockResponse());
    globalThis.fetch = fakeFetch;
    const preInstallFetch = globalThis.fetch;

    const handle = installInterceptor(() => {});

    // Fetch should now be patched (different reference).
    expect(globalThis.fetch).not.toBe(preInstallFetch);

    handle.restore();

    // After restore, fetch should be back to the pre-install reference.
    expect(globalThis.fetch).toBe(preInstallFetch);
  });

  // -----------------------------------------------------------------------
  // Callback errors should not break fetch
  // -----------------------------------------------------------------------
  it('swallows callback errors without breaking fetch', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      mockResponse({ data: 'ok' }),
    );
    globalThis.fetch = fakeFetch;

    const handle = installInterceptor(() => {
      throw new Error('callback boom');
    });

    const response = await globalThis.fetch(
      'https://api.openai.com/v1/chat/completions',
      { method: 'POST', body: '{}' },
    );

    expect(response.status).toBe(200);

    handle.restore();
  });

  // -----------------------------------------------------------------------
  // Parses JSON body from init
  // -----------------------------------------------------------------------
  it('captures parsed JSON body from init', async () => {
    const captured: AgentAction[] = [];
    const fakeFetch = vi.fn().mockResolvedValue(mockResponse());
    globalThis.fetch = fakeFetch;

    const handle = installInterceptor((action) => captured.push(action));

    const requestBody = { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] };
    await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].params.body).toEqual(requestBody);

    handle.restore();
  });
});
