import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  computeAlignment,
  type AgentSession,
  type ScoringInput,
} from "@llmagentscore/core";
import { formatReport } from "./report.js";

// Typed plugin hook event shape for agent_end
// agent_end typed plugin hook 事件结构
interface AgentEndEvent {
  sessionKey?: string;
  agentId?: string;
  model?: string;
  durationMs?: number;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 20_000;

export interface AgentScorePluginConfig {
  apiKey?: string;
  threshold?: number;
  throttleMs?: number;
  verbose?: boolean;
  dashboardUrl?: string;
}

function resolveConfig(raw: Record<string, unknown>): Required<
  Omit<AgentScorePluginConfig, "apiKey">
> & { apiKey?: string } {
  const threshold = typeof raw.threshold === "number" && raw.threshold >= 0 && raw.threshold <= 100
    ? raw.threshold : 70;
  const throttleMs = typeof raw.throttleMs === "number" && raw.throttleMs > 0
    ? raw.throttleMs : 180_000;
  const verbose = raw.verbose === true;
  const dashboardUrl = (typeof raw.dashboardUrl === "string" && raw.dashboardUrl
    ? raw.dashboardUrl : "https://getagentscore.com"
  ).replace(/\/+$/, "");
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : undefined;

  return { apiKey, threshold, throttleMs, verbose, dashboardUrl };
}

function parseAgentId(sessionKey: string): string {
  const parts = sessionKey.split(":");
  return parts.length >= 2 ? parts[1] : sessionKey;
}

/**
 * Upload session data to the AgentScore dashboard for server-side scoring.
 */
export async function uploadToRemote(
  session: AgentSession,
  sessionKey: string,
  apiKey: string,
  dashboardUrl: string,
): Promise<boolean> {
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
 */
export async function computeAlignmentFromSession(
  session: AgentSession,
  opts: { threshold: number; verbose: boolean },
) {
  const input: ScoringInput = {
    prompt: session.prompt,
    actions: session.actions,
    report: session.report,
  };

  const score = computeAlignment(input);
  const report = formatReport(score, { verbose: opts.verbose });

  return {
    score,
    report,
    belowThreshold: score.score < opts.threshold,
    threshold: opts.threshold,
  };
}

export default {
  id: "agentscore",
  name: "AgentScore",
  description: "Alignment verification — scores agent alignment and uploads to dashboard",
  register(api: OpenClawPluginApi) {
    const cfg = resolveConfig(api.pluginConfig ?? {});
    const lastUploadAt = new Map<string, number>();

    // Use api.on() for typed plugin hooks (works for both webchat and channels)
    // 使用 api.on() 注册 typed plugin hook（webchat 和 channel 都会触发）
    (api as any).on("agent_end", async (event: AgentEndEvent) => {
      const sessionKey = event.sessionKey ?? "unknown";
      console.log(`[agentscore] agent_end fired, sessionKey=${sessionKey}`);

      const now = Date.now();
      const last = lastUploadAt.get(sessionKey) ?? 0;
      if (now - last < cfg.throttleMs) return;

      // Build a minimal session from the agent_end event
      // 从 agent_end 事件构建最小 session
      const session: AgentSession = {
        id: sessionKey,
        prompt: "",
        actions: [],
        report: "",
        startedAt: new Date(now - (event.durationMs ?? 0)).toISOString(),
        endedAt: new Date(now).toISOString(),
        framework: "openclaw",
        model: event.model ?? "",
      };

      const uploadPromise = cfg.apiKey
        ? uploadToRemote(session, sessionKey, cfg.apiKey, cfg.dashboardUrl)
        : Promise.resolve(false);

      const [result, uploaded] = await Promise.all([
        computeAlignmentFromSession(session, cfg),
        uploadPromise,
      ]);

      if (uploaded) {
        lastUploadAt.set(sessionKey, now);
      }

      const warning = result.belowThreshold
        ? ` (below threshold ${result.threshold})`
        : "";

      console.log(`[agentscore] ${sessionKey}: score=${result.score.score}/100${warning}`);
    });
  },
};
