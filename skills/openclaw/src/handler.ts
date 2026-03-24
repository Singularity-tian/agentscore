import {
  computeAlignment,
  type AgentSession,
  type ScoringInput,
} from "@llmagentscore/core";
import { formatReport } from "./report.js";

/**
 * Default alignment score threshold. Sessions scoring below this value
 * are flagged as potentially misaligned.
 */
const DEFAULT_THRESHOLD = 70;

/** Default throttle interval in milliseconds (3 minutes). */
const DEFAULT_THROTTLE_MS = 3 * 60 * 1000;

/** Default API base URL. */
const DEFAULT_DASHBOARD_URL = "https://getagentscore.com";

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Module-level throttle state for successful uploads, keyed by sessionKey. */
const lastUploadAt = new Map<string, number>();

/**
 * Read the configured threshold from the environment, falling back to the default.
 */
function getThreshold(): number {
  const env = process.env["AGENTSCORE_THRESHOLD"];
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
  const env = process.env["AGENTSCORE_THROTTLE_MS"];
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
  return process.env["AGENTSCORE_VERBOSE"] === "true";
}

/**
 * Extract the agentId from an OpenClaw sessionKey.
 *
 * Session keys follow the format `agent:<agentId>:main` or
 * `agent:<agentId>:subagent:<uuid>`. Falls back to the raw key
 * if the format is unexpected.
 */
function parseAgentId(sessionKey: string): string {
  const parts = sessionKey.split(":");
  return parts.length >= 2 ? parts[1] : sessionKey;
}

/**
 * Upload session data to the AgentScore dashboard for server-side scoring.
 *
 * The agent name is derived from the OpenClaw `sessionKey`
 * (format: `agent:<agentId>:...`).
 *
 * Returns `true` on success, `false` on failure or when no API key is set.
 * Errors are logged but never thrown, so the hook never blocks or crashes
 * the OpenClaw agent.
 */
export async function uploadToRemote(
  session: AgentSession,
  sessionKey: string,
): Promise<boolean> {
  const apiKey = process.env["AGENTSCORE_API_KEY"];
  if (!apiKey) {
    return false;
  }

  const dashboardUrl = (
    process.env["AGENTSCORE_DASHBOARD_URL"] ?? DEFAULT_DASHBOARD_URL
  ).replace(/\/+$/, "");
  const agentName = parseAgentId(sessionKey);
  const url = `${dashboardUrl}/api/v1/score`;

  const payload = {
    agentName,
    prompt: session.prompt,
    actions: session.actions,
    report: session.report,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? new Date().toISOString(),
    framework: session.framework ?? "openclaw",
    model: session.model,
    source: "hook" as const,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        `[agentscore] upload failed: HTTP ${response.status}: ${text}`,
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[agentscore] upload failed:`, (err as Error).message);
    return false;
  } finally {
    clearTimeout(timer);
  }
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
 *
 * When `AGENTSCORE_API_KEY` is set, session data is also uploaded to the
 * AgentScore dashboard (`/api/v1/score`) for server-side scoring.
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
  if (event.type !== "message" || event.action !== "sent") {
    return;
  }

  const session = event.context.sessionEntry;
  if (!session) {
    return;
  }

  const now = Date.now();
  const throttleMs = getThrottleMs();
  const last = lastUploadAt.get(event.sessionKey) ?? 0;

  if (now - last < throttleMs) {
    return;
  }

  // Run local scoring and remote upload in parallel.
  const [result, uploaded] = await Promise.all([
    computeAlignmentFromSession(session),
    uploadToRemote(session, event.sessionKey),
  ]);

  // Only throttle after a successful upload so failed attempts can retry.
  if (uploaded) {
    lastUploadAt.set(event.sessionKey, now);
  }

  const warning = result.belowThreshold
    ? `\n\n**Warning:** Alignment score ${result.score.score}/100 is below the threshold of ${result.threshold}.`
    : "";

  event.messages.push(result.report + warning);
};

export default handler;
