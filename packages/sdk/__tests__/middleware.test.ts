import { describe, it, expect, vi } from 'vitest';
import { agentScoreMiddleware } from '../src/middleware.js';
import type { GenericRequest, GenericResponse, NextFunction, ScoredRequest } from '../src/middleware.js';
import type { AgentAction, AlignmentScore } from '@llmagentscore/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body: Record<string, unknown> = {}): GenericRequest {
  return {
    method: 'POST',
    url: '/agent/run',
    headers: { 'content-type': 'application/json' },
    body,
  };
}

function makeRes(): GenericResponse & { _json: unknown; _headers: Record<string, string> } {
  const res: GenericResponse & { _json: unknown; _headers: Record<string, string> } = {
    statusCode: 200,
    _json: undefined,
    _headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
    },
    end() {},
  };
  return res;
}

function makeAction(tool: string, params: Record<string, unknown> = {}): AgentAction {
  return { tool, params, timestamp: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agentScoreMiddleware', () => {
  it('scores a request and attaches score to the request object', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
    });

    const req = makeReq({
      prompt: 'Send an email to alice@example.com.',
      actions: [makeAction('gmail_send', { to: 'alice@example.com' })],
    });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // Score should be attached to the request.
    const scored = req as ScoredRequest;
    expect(scored.agentScore).toBeDefined();
    expect(typeof scored.agentScore!.score).toBe('number');
  });

  it('calls next without scoring when prompt is missing', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: () => undefined,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
    });

    const req = makeReq({ actions: [makeAction('x')] });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as ScoredRequest).agentScore).toBeUndefined();
  });

  it('calls next without scoring when actions are empty', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: () => [],
    });

    const req = makeReq({ prompt: 'Hello.' });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as ScoredRequest).agentScore).toBeUndefined();
  });

  it('sets X-AgentScore-Alignment header on the response', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
    });

    const req = makeReq({
      prompt: 'Search the web for docs.',
      actions: [makeAction('web_search', { q: 'docs' })],
    });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(res._headers['X-AgentScore-Alignment']).toBeDefined();
  });

  it('wraps res.json to inject _agentScore into the response body', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
    });

    const req = makeReq({
      prompt: 'Read file /tmp/a.',
      actions: [makeAction('file_read', { path: '/tmp/a' })],
    });
    const res = makeRes();
    const next: NextFunction = () => {
      // Simulate the downstream handler calling res.json().
      res.json!({ result: 'ok' });
    };

    mw(req, res, next);

    const body = res._json as Record<string, unknown>;
    expect(body.result).toBe('ok');
    expect(body._agentScore).toBeDefined();
    expect(typeof (body._agentScore as AlignmentScore).score).toBe('number');
  });

  it('only sets header when headerOnly is true', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
      headerOnly: true,
    });

    const req = makeReq({
      prompt: 'Search the web.',
      actions: [makeAction('web_search', { q: 'test' })],
    });
    const res = makeRes();
    const originalJson = res.json;
    const next: NextFunction = () => {
      // json should NOT be wrapped.
      res.json!({ data: 1 });
    };

    mw(req, res, next);

    expect(res._headers['X-AgentScore-Alignment']).toBeDefined();
    // json should remain the original function (not wrapped).
    // But since headerOnly is true, the body should not have _agentScore.
    const body = res._json as Record<string, unknown>;
    expect(body).toEqual({ data: 1 });
    expect(body._agentScore).toBeUndefined();
  });

  it('supports a custom header name', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
      headerOnly: true,
      headerName: 'X-Custom-Score',
    });

    const req = makeReq({
      prompt: 'Do something.',
      actions: [makeAction('do_thing')],
    });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(res._headers['X-Custom-Score']).toBeDefined();
    expect(res._headers['X-AgentScore-Alignment']).toBeUndefined();
  });

  it('invokes onScore callback', () => {
    const onScore = vi.fn();
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
      onScore,
    });

    const req = makeReq({
      prompt: 'Write a file.',
      actions: [makeAction('file_write', { path: '/tmp/x' })],
    });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(onScore).toHaveBeenCalledTimes(1);
    const [score, passedReq] = onScore.mock.calls[0];
    expect(typeof score.score).toBe('number');
    expect(passedReq).toBe(req);
  });

  it('calls next(err) if extractPrompt throws', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: () => {
        throw new Error('extract boom');
      },
      extractActions: () => [],
    });

    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('extract boom');
  });

  it('uses extractReport for truthfulness scoring', () => {
    const mw = agentScoreMiddleware({
      extractPrompt: (req) => (req.body as Record<string, unknown>)?.prompt as string,
      extractActions: (req) => (req.body as Record<string, unknown>)?.actions as AgentAction[],
      extractReport: (req) => (req.body as Record<string, unknown>)?.report as string,
    });

    const req = makeReq({
      prompt: 'Send email to bob.',
      actions: [makeAction('gmail_send', { to: 'bob@test.com' })],
      report: 'I sent an email to bob.',
    });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    mw(req, res, next);

    const scored = req as ScoredRequest;
    expect(scored.agentScore).toBeDefined();
    expect(typeof scored.agentScore!.truthfulness).toBe('number');
  });
});
