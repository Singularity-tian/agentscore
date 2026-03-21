import type { SessionResult } from './session.js';

/** Configuration for the AgentScore reporter. */
export interface ReporterOptions {
  /** Base URL of the AgentScore dashboard (e.g., "https://getagentscore.com"). */
  dashboardUrl: string;
  /** API key used to authenticate with the dashboard. */
  apiKey: string;
  /** Agent name used when reporting sessions (defaults to "unnamed-agent"). */
  agentName?: string;
  /** Agent framework identifier (defaults to "custom"). */
  framework?: 'openclaw' | 'langchain' | 'crewai' | 'claude-code' | 'custom';
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
  /** Dashboard-assigned agent identifier. */
  agentId?: string;
  /** Alignment score returned by the dashboard. */
  score?: number;
  /** Human-readable message from the server. */
  message?: string;
}

/**
 * HTTP client that POSTs scored session results to the AgentScore dashboard.
 *
 * ```ts
 * const reporter = new AgentScoreReporter({
 *   dashboardUrl: 'https://getagentscore.com',
 *   apiKey: process.env.AGENTSCORE_API_KEY!,
 *   agentName: 'my-agent',
 * });
 * await reporter.report(sessionResult);
 * ```
 */
export class AgentScoreReporter {
  private readonly dashboardUrl: string;
  private readonly apiKey: string;
  private readonly agentName: string;
  private readonly framework: string;
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
    this.agentName = options.agentName ?? 'unnamed-agent';
    this.framework = options.framework ?? 'custom';
    this.silent = options.silent ?? false;
    this.extraHeaders = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /**
   * Report a single session result to the dashboard.
   *
   * Transforms the SDK's `SessionResult` into the flat format expected by
   * `POST /api/sessions`.
   */
  async report(result: SessionResult): Promise<ReportResponse> {
    const payload = this.toIngestionPayload(result);
    return this.post('/api/sessions', payload);
  }

  /**
   * Report multiple session results in one request (batch upload).
   */
  async reportBatch(results: SessionResult[]): Promise<ReportResponse> {
    const payloads = results.map((r) => this.toIngestionPayload(r));
    return this.post('/api/sessions/batch', { sessions: payloads });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Transform a `SessionResult` (nested score object) into the flat payload
   * expected by the dashboard's `POST /api/sessions` endpoint.
   */
  private toIngestionPayload(result: SessionResult): Record<string, unknown> {
    const { score } = result;
    return {
      agentName: this.agentName,
      framework: this.framework,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      alignmentScore: score.score,
      truthfulnessScore: score.truthfulness,
      totalExpected: score.matched.length + score.missed.length,
      matchedActions: score.matched.length,
      missedActions: score.missed.length,
      unexpectedActions: score.unexpected.length,
      model: result.model,
      matchedDetails: score.matched,
      missedDetails: score.missed,
      unexpectedDetails: score.unexpected,
    };
  }

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
        agentId: typeof data.agentId === 'string' ? data.agentId : undefined,
        score: typeof data.score === 'number' ? data.score : undefined,
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
