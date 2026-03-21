import type { SessionResult } from './session.js';

/** Configuration for the AgentScore reporter. */
export interface ReporterOptions {
  /** Base URL of the AgentScore dashboard API (e.g., "https://dashboard.agentscore.dev"). */
  dashboardUrl: string;
  /** API key used to authenticate with the dashboard. */
  apiKey: string;
  /**
   * If `true`, errors during reporting are silently swallowed instead of
   * throwing.  Defaults to `false`.
   */
  silent?: boolean;
  /**
   * Custom headers to attach to every request (e.g., for proxies or extra
   * auth).
   */
  headers?: Record<string, string>;
  /**
   * Request timeout in milliseconds.  Defaults to 10 000 (10 s).
   */
  timeoutMs?: number;
}

/** Minimal response returned after a successful report. */
export interface ReportResponse {
  /** Whether the dashboard accepted the report. */
  ok: boolean;
  /** Dashboard-assigned identifier for the report. */
  reportId?: string;
  /** Human-readable message from the server. */
  message?: string;
}

/**
 * HTTP client that POSTs scored session results to the AgentScore dashboard.
 *
 * ```ts
 * const reporter = new AgentScoreReporter({
 *   dashboardUrl: 'https://dashboard.agentscore.dev',
 *   apiKey: process.env.AGENTSCORE_API_KEY!,
 * });
 * await reporter.report(sessionResult);
 * ```
 */
export class AgentScoreReporter {
  private readonly dashboardUrl: string;
  private readonly apiKey: string;
  private readonly silent: boolean;
  private readonly extraHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: ReporterOptions) {
    if (!options.dashboardUrl) {
      throw new Error('ReporterOptions.dashboardUrl is required');
    }
    if (!options.apiKey) {
      throw new Error('ReporterOptions.apiKey is required');
    }

    // Trim trailing slash so we can append paths safely.
    this.dashboardUrl = options.dashboardUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.silent = options.silent ?? false;
    this.extraHeaders = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /**
   * Report a single session result to the dashboard.
   *
   * Throws on network/server errors unless `silent` mode is enabled.
   */
  async report(result: SessionResult): Promise<ReportResponse> {
    return this.post('/api/v1/reports', result);
  }

  /**
   * Report multiple session results in one request (batch upload).
   */
  async reportBatch(results: SessionResult[]): Promise<ReportResponse> {
    return this.post('/api/v1/reports/batch', { results });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async post(path: string, body: unknown): Promise<ReportResponse> {
    const url = `${this.dashboardUrl}${path}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `AgentScore dashboard responded with ${response.status}: ${text}`,
        );
      }

      const data = (await response.json()) as Record<string, unknown>;

      return {
        ok: true,
        reportId: typeof data.id === 'string' ? data.id : undefined,
        message: typeof data.message === 'string' ? data.message : undefined,
      };
    } catch (err) {
      if (this.silent) {
        return { ok: false, message: String(err) };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
