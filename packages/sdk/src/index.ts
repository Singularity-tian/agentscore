// ---------------------------------------------------------------------------
// @llmagentscore/sdk — Public API
// ---------------------------------------------------------------------------

// Session
export { AgentScoreSession } from "./session.js";
export type { SessionOptions, SessionResult } from "./session.js";

// Fetch interceptor
export { installInterceptor } from "./interceptor.js";
export type {
  InterceptorCallback,
  InterceptorOptions,
  InterceptorHandle,
} from "./interceptor.js";

// Dashboard reporter
export { AgentScoreReporter } from "./reporter.js";
export type { ReporterOptions, ReportResponse } from "./reporter.js";

// Log writer (CLI wrapper anti-tampering)
export * as logWriter from "./log-writer.js";

// Middleware
export { agentScoreMiddleware } from "./middleware.js";
export type {
  MiddlewareOptions,
  GenericRequest,
  GenericResponse,
  NextFunction,
  ScoredRequest,
} from "./middleware.js";

// Re-export core types that SDK consumers commonly need
export type {
  AgentAction,
  ScoringInput,
  AlignmentScore,
  MatchedAction,
  ConstraintViolation,
} from "@llmagentscore/core";

export { computeAlignment } from "@llmagentscore/core";
