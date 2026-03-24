import {
  computeAlignment,
  type AgentSession,
  type ScoringInput,
} from '@llmagentscore/core';
import { formatReport } from './report.js';

/**
 * Default alignment score threshold. Sessions scoring below this value
 * are flagged as potentially misaligned.
 */
const DEFAULT_THRESHOLD = 70;

/** Default throttle interval in milliseconds (3 minutes). */
const DEFAULT_THROTTLE_MS = 3 * 60 * 1000;

/** Module-level throttle state, keyed by sessionKey. */
const lastComputeAt = new Map<string, number>();

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
 * Read the configured throttle interval (in ms) from the environment.
 */
function getThrottleMs(): number {
  const env = process.env['AGENTSCORE_THROTTLE_MS'];
  if (env !== undefined) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_THROTTLE_MS;
}

/**
 * Check whether verbose output is enabled.
 */
function isVerbose(): boolean {
  return process.env['AGENTSCORE_VERBOSE'] === 'true';
}

/**
 * Compute alignment for a completed session.
 *
 * Exported so consumers can call it programmatically outside the hook
 * event flow.
 */
export async function computeAlignmentFromSession(session: AgentSession) {
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
 * OpenClaw hook handler — triggered on `message:sent` events.
 *
 * Uses a per-session throttle so alignment is only computed at most once
 * per interval (default 3 min). Messages that arrive within the throttle
 * window are silently skipped — no report is pushed.
 */
const handler = async (event: {
  type: string;
  action: string;
  sessionKey: string;
  timestamp: Date;
  messages: string[];
  context: {
    sessionEntry?: AgentSession;
    [key: string]: unknown;
  };
}) => {
  if (event.type !== 'message' || event.action !== 'sent') {
    return;
  }

  const session = event.context.sessionEntry;
  if (!session) {
    return;
  }

  const now = Date.now();
  const throttleMs = getThrottleMs();
  const last = lastComputeAt.get(event.sessionKey) ?? 0;

  if (now - last < throttleMs) {
    return;
  }

  lastComputeAt.set(event.sessionKey, now);

  const result = await computeAlignmentFromSession(session);

  const warning = result.belowThreshold
    ? `\n\n**Warning:** Alignment score ${result.score.score}/100 is below the threshold of ${result.threshold}.`
    : '';

  event.messages.push(result.report + warning);
};

export default handler;
