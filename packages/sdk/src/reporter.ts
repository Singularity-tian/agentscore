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

/** Response returned after a successful report to `/api/v1/score`. */
export interface ReportResponse {
  /** Whether the dashboard accepted the report. */
  ok: boolean;
  /** Dashboard-assigned session identifier. */
  reportId?: string;
  /** Dashboard-assigned agent identifier. */
  agentId?: string;
  /** Server-computed alignment score. */
  alignmentScore?: number;
  /** Server-computed truthfulness score. */
  truthfulnessScore?: number;
  /** Scoring detail breakdown from the server. */
  details?: string;
  /** Whether the session was skipped (duplicate). */
  skipped?: boolean;
  /** Human-readable message from the server. */
  message?: string;
}

/**
 * HTTP client that POSTs raw session data to the AgentScore dashboard's
 * server-side scoring endpoint (`/api/v1/score`).
 *
 * The server re-computes alignment scores — the SDK no longer uploads
 * pre-computed scores, closing the trust gap where an agent could fabricate
 * its own score.
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
   * Sends raw actions + prompt to `/api/v1/score` for server-side scoring.
   */
  async report(result: SessionResult): Promise<ReportResponse> {
    const payload = {
      agentName: this.agentName,
      prompt: result.prompt,
      actions: result.actions,
      report: result.report,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      framework: this.framework,
      model: result.model,
      source: 'sdk' as const,
    };
    return this.post('/api/v1/score', payload);
  }

  /**
   * Report multiple session results in one request (batch upload).
   *
   * Sends to `/api/v1/score` using the batch format.
   */
  async reportBatch(results: SessionResult[]): Promise<ReportResponse> {
    const tasks = results.map((r) => ({
      prompt: r.prompt,
      actions: r.actions,
      report: r.report,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      model: r.model,
    }));

    const payload = {
      agentName: this.agentName,
      framework: this.framework,
      source: 'sdk' as const,
      tasks,
    };

    return this.post('/api/v1/score', payload);
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
        agentId: typeof data.agentId === 'string' ? data.agentId : undefined,
        alignmentScore: typeof data.alignmentScore === 'number' ? data.alignmentScore : undefined,
        truthfulnessScore: typeof data.truthfulnessScore === 'number' ? data.truthfulnessScore : undefined,
        details: typeof data.details === 'string' ? data.details : undefined,
        skipped: typeof data.skipped === 'boolean' ? data.skipped : undefined,
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
