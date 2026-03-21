import type { AgentAction } from '@agentscore/core';

/** Well-known LLM provider API host patterns. */
const LLM_HOST_PATTERNS: RegExp[] = [
  /api\.openai\.com/,
  /api\.anthropic\.com/,
  /generativelanguage\.googleapis\.com/,
  /api\.cohere\.ai/,
  /api\.mistral\.ai/,
  /api\.together\.xyz/,
  /api\.groq\.com/,
  /api\.fireworks\.ai/,
];

/** Callback invoked every time an intercepted LLM call completes. */
export type InterceptorCallback = (action: AgentAction) => void;

/** Options for installing the fetch interceptor. */
export interface InterceptorOptions {
  /** Extra host patterns to match in addition to the defaults. */
  extraHosts?: RegExp[];
  /**
   * If `true`, request/response bodies are **not** captured (only the URL and
   * method are recorded).  Useful in production to avoid logging sensitive data.
   */
  redactBodies?: boolean;
}

/** Handle returned by `installInterceptor` used to restore the original fetch. */
export interface InterceptorHandle {
  /** Remove the monkey-patch and restore the original `globalThis.fetch`. */
  restore: () => void;
}

/**
 * Monkey-patch `globalThis.fetch` so that every outgoing request whose URL
 * matches a known LLM API host is captured as an `AgentAction` and forwarded
 * to `callback`.
 *
 * The original `fetch` is called transparently -- callers will not notice any
 * difference in behavior.
 *
 * ```ts
 * const handle = installInterceptor((action) => session.recordAction(action));
 * // ... use fetch normally ...
 * handle.restore();
 * ```
 */
export function installInterceptor(
  callback: InterceptorCallback,
  options: InterceptorOptions = {},
): InterceptorHandle {
  const originalFetch = globalThis.fetch;

  const patterns = [...LLM_HOST_PATTERNS, ...(options.extraHosts ?? [])];
  const redact = options.redactBodies === true;

  const patchedFetch: typeof globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = extractUrl(input);
    if (!isLlmUrl(url, patterns)) {
      return originalFetch(input, init);
    }

    // Build a best-effort snapshot of the request body.
    let requestBody: unknown = undefined;
    if (!redact) {
      requestBody = extractBody(input, init);
    }

    const startTime = Date.now();

    // Forward to the real fetch.
    const response = await originalFetch(input, init);

    const elapsed = Date.now() - startTime;

    // Clone so the caller can still consume the body.
    let responseBody: unknown = undefined;
    if (!redact) {
      try {
        const cloned = response.clone();
        responseBody = await cloned.json();
      } catch {
        // Body is not JSON -- ignore.
      }
    }

    const action: AgentAction = {
      tool: `llm_call:${extractToolLabel(url)}`,
      params: {
        url,
        method: resolveMethod(input, init),
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        status: response.status,
        elapsedMs: elapsed,
      },
      result: responseBody,
      timestamp: new Date().toISOString(),
    };

    try {
      callback(action);
    } catch {
      // Never let a callback error break the caller's fetch chain.
    }

    return response;
  };

  globalThis.fetch = patchedFetch;

  return {
    restore() {
      // Only restore if we are still the active patch.
      if (globalThis.fetch === patchedFetch) {
        globalThis.fetch = originalFetch;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  // Request object
  return input.url;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input !== 'string' && !(input instanceof URL) && input.method) {
    return input.method;
  }
  return 'GET';
}

function extractBody(input: RequestInfo | URL, init?: RequestInit): unknown {
  const raw = init?.body;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  // Fall back to Request body (we cannot read a consumed stream, so skip).
  if (!raw && typeof input !== 'string' && !(input instanceof URL)) {
    // Cannot reliably clone a Request body that may have already been consumed.
    return undefined;
  }
  return undefined;
}

function isLlmUrl(url: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(url));
}

/** Derive a short label from the URL, e.g. "openai" or "anthropic". */
function extractToolLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    // "api.openai.com" -> "openai"
    if (parts.length >= 3) return parts[parts.length - 2];
    return parts[0];
  } catch {
    return 'unknown';
  }
}
