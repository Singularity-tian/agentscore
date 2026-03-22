import {
  computeAlignment,
  type AgentSession,
  type AlignmentScore,
  type ScoringInput,
} from '@llmagentscore/core';
import { formatReport } from './report.js';

/**
 * Default alignment score threshold. Sessions scoring below this value
 * are flagged as potentially misaligned.
 */
const DEFAULT_THRESHOLD = 70;

/**
 * Read the configured threshold from the environment, falling back to the default.
 */
function getThreshold(): number {
  const env = process.env['AGENTSCORE_THRESHOLD'];
  if (env !== undefined) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      return parsed;
    }
  }
  return DEFAULT_THRESHOLD;
}

/**
 * Check whether verbose output is enabled.
 */
function isVerbose(): boolean {
  return process.env['AGENTSCORE_VERBOSE'] === 'true';
}

/**
 * Lifecycle hook: called by the OpenClaw runtime after a task completes.
 *
 * Computes the alignment score for the given session and returns it.
 * When the score falls below the configured threshold the result is
 * flagged via {@link AlignmentResult.belowThreshold}.
 */
export async function onTaskComplete(session: AgentSession): Promise<AlignmentResult> {
  const input: ScoringInput = {
    prompt: session.prompt,
    actions: session.actions,
    report: session.report,
  };

  const score = computeAlignment(input);
  const threshold = getThreshold();
  const verbose = isVerbose();
  const report = formatReport(score, { verbose });

  return {
    score,
    report,
    belowThreshold: score.score < threshold,
    threshold,
  };
}

/**
 * Lifecycle hook: called before the agent's response is returned to the user.
 *
 * Appends the formatted alignment report to the agent's response text so
 * the user can see how well the agent followed instructions.
 */
export async function onBeforeRespond(
  session: AgentSession,
  response: string,
): Promise<string> {
  const result = await onTaskComplete(session);

  const separator = '\n\n---\n\n';
  const warning = result.belowThreshold
    ? `\n\n**Warning:** Alignment score ${result.score.score}/100 is below the threshold of ${result.threshold}.`
    : '';

  return response + separator + result.report + warning;
}

/**
 * The result returned by the {@link onTaskComplete} hook.
 */
export interface AlignmentResult {
  /** The computed alignment score */
  score: AlignmentScore;
  /** Human-readable report string */
  report: string;
  /** Whether the score fell below the configured threshold */
  belowThreshold: boolean;
  /** The threshold that was used */
  threshold: number;
}
