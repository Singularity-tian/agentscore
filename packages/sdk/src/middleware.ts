import type { AgentAction, AlignmentScore } from '@agentscore/core';
import { computeAlignment } from '@agentscore/core';

// ---------------------------------------------------------------------------
// Generic request / response types (no express or fastify type imports)
// ---------------------------------------------------------------------------

/** Minimal shape of an incoming HTTP request. */
export interface GenericRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/** Minimal shape of an HTTP response with a writable status and JSON helper. */
export interface GenericResponse {
  statusCode?: number;
  /** Express-style status setter (returns `this` for chaining). */
  status?: (code: number) => GenericResponse;
  /** Send a JSON body. */
  json?: (body: unknown) => void;
  /** Generic send / end. */
  end?: (body?: string) => void;
  /** Set a header. */
  setHeader?: (name: string, value: string) => void;
}

/** Standard Node-style next callback. */
export type NextFunction = (err?: unknown) => void;

// ---------------------------------------------------------------------------
// Middleware options
// ---------------------------------------------------------------------------

/** Configuration for the scoring middleware. */
export interface MiddlewareOptions {
  /**
   * Extract the agent prompt from the request.
   * Must return the raw prompt string that will be scored against.
   */
  extractPrompt: (req: GenericRequest) => string | undefined;

  /**
   * Extract the list of agent actions from the request.
   * Must return an array of actions the agent actually performed.
   */
  extractActions: (req: GenericRequest) => AgentAction[] | undefined;

  /**
   * Extract the agent's self-reported summary from the request.
   * Optional -- if omitted, truthfulness is not scored.
   */
  extractReport?: (req: GenericRequest) => string | undefined;

  /**
   * Called with the computed score for every request that includes enough data
   * to score.  Use this hook to log, persist, or forward the score.
   */
  onScore?: (score: AlignmentScore, req: GenericRequest) => void;

  /**
   * If `true` the score is attached to a response header
   * (`X-AgentScore-Alignment`) instead of being injected into the response
   * body.
   *
   * Defaults to `false` -- the score is added as `_agentScore` on JSON
   * response bodies.
   */
  headerOnly?: boolean;

  /**
   * Name of the response header.  Defaults to `X-AgentScore-Alignment`.
   */
  headerName?: string;
}

/** Result stored on the request after scoring. */
export interface ScoredRequest extends GenericRequest {
  agentScore?: AlignmentScore;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create a Connect/Express/Fastify-compatible middleware that automatically
 * scores incoming requests containing agent session data.
 *
 * ```ts
 * app.use(
 *   agentScoreMiddleware({
 *     extractPrompt: (req) => req.body?.prompt,
 *     extractActions: (req) => req.body?.actions,
 *   }),
 * );
 * ```
 */
export function agentScoreMiddleware(
  options: MiddlewareOptions,
): (req: GenericRequest, res: GenericResponse, next: NextFunction) => void {
  const headerName = options.headerName ?? 'X-AgentScore-Alignment';

  return (req: GenericRequest, res: GenericResponse, next: NextFunction) => {
    try {
      const prompt = options.extractPrompt(req);
      const actions = options.extractActions(req);

      if (!prompt || !actions || actions.length === 0) {
        // Not enough data to score -- pass through.
        next();
        return;
      }

      const report = options.extractReport?.(req) ?? '';

      const score = computeAlignment({ prompt, actions, report });

      // Attach score to the request so downstream handlers can access it.
      (req as ScoredRequest).agentScore = score;

      // Notify the caller.
      options.onScore?.(score, req);

      // Attach score to the response.
      if (options.headerOnly) {
        res.setHeader?.(headerName, String(score.score));
      } else {
        // Wrap the json method to inject the score into the response body.
        const originalJson = res.json;
        if (typeof originalJson === 'function') {
          res.json = (body: unknown) => {
            const enriched =
              body !== null && typeof body === 'object'
                ? { ...(body as Record<string, unknown>), _agentScore: score }
                : body;
            return originalJson.call(res, enriched);
          };
        }
        // Always set the header as well for easy consumption.
        res.setHeader?.(headerName, String(score.score));
      }

      next();
    } catch (err) {
      // Scoring should never crash the server -- forward the error.
      next(err);
    }
  };
}
