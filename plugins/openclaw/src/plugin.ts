import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  computeAlignment,
  type AgentSession,
  type ScoringInput,
} from "@llmagentscore/core";
import { formatReport } from "./report.js";

// agent_end hook event (first argument)
// agent_end hook 事件（第一个参数）
interface AgentEndEvent {
  messages?: Array<{ role: string; content: unknown }>;
  success?: boolean;
  error?: string;
  durationMs?: number;
}

// agent_end hook context (second argument)
// agent_end hook 上下文（第二个参数）
interface AgentEndContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
  trigger?: string;
  channelId?: string;
}

// Extract text from a content block or string
// 从 content block 或字符串中提取文本
function extractText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === "object" && block !== null && "text" in block) {
        return (block as { text: string }).text;
      }
    }
  }
  return null;
}

// Extract first user prompt text from messages array
// 从 messages 数组中提取第一条用户 prompt
function extractPrompt(messages?: AgentEndEvent["messages"]): string {
  if (!messages?.length) return "(no prompt)";
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const text = extractText(msg.content);
    if (text) return text;
  }
  return "(no prompt)";
}

// Extract assistant's last text reply as report
// 提取 assistant 最后一条文本回复作为 report
function extractReport(messages?: AgentEndEvent["messages"]): string {
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") continue;
    const text = extractText(messages[i].content);
    if (text) return text;
  }
  return "";
}

// Extract tool calls from messages as AgentAction[]
// 从 messages 中提取 tool 调用作为 AgentAction[]
function extractActions(messages?: AgentEndEvent["messages"]): Array<{
  tool: string;
  params: Record<string, unknown>;
  result?: unknown;
  timestamp: string;
}> {
  if (!messages?.length) return [];
  const actions: Array<{
    tool: string;
    params: Record<string, unknown>;
    result?: unknown;
    timestamp: string;
  }> = [];

  // Collect tool_use blocks from assistant messages
  // 从 assistant 消息中收集 tool_use blocks
  const pendingTools = new Map<string, { tool: string; params: Record<string, unknown>; result?: unknown; timestamp: string }>();

  for (const msg of messages) {
    const timestamp = typeof (msg as any).timestamp === "number"
      ? new Date((msg as any).timestamp).toISOString()
      : new Date().toISOString();

    // Match toolCall blocks (OpenClaw uses "toolCall" not "tool_use")
    // 匹配 toolCall blocks（OpenClaw 使用 "toolCall" 而非 "tool_use"）
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if ((b.type === "toolCall" || b.type === "tool_use") && typeof b.name === "string") {
          const entry: { tool: string; params: Record<string, unknown>; result?: unknown; timestamp: string } = {
            tool: b.name,
            params: (b.input as Record<string, unknown>) ?? (b.params as Record<string, unknown>) ?? {},
            timestamp,
          };
          const id = (b.id ?? b.toolCallId) as string | undefined;
          if (id) pendingTools.set(id, entry);
          actions.push(entry);
        }
      }
    }

    // Match toolResult messages (OpenClaw uses role="toolResult")
    // 匹配 toolResult 消息（OpenClaw 使用 role="toolResult"）
    if ((msg.role === "toolResult" || msg.role === "tool") && Array.isArray(msg.content)) {
      const resultId = (msg as any).toolCallId ?? (msg as any).tool_use_id;
      if (typeof resultId === "string") {
        const pending = pendingTools.get(resultId);
        if (pending) {
          const text = extractText(msg.content);
          pending.result = text ?? msg.content;
        }
      }
    }
  }

  return actions;
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
    source: "sdk" as const,
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
    (api as any).on("agent_end", async (event: AgentEndEvent, ctx: AgentEndContext) => {
      const sessionKey = ctx.sessionKey ?? "unknown";
      const prompt = extractPrompt(event.messages);
      console.log(`[agentscore] agent_end fired, sessionKey=${sessionKey}, success=${event.success}`);
      // Debug: dump message roles and content block types
      // 调试：输出消息角色和 content block 类型
      for (const msg of event.messages ?? []) {
        const types = Array.isArray(msg.content)
          ? (msg.content as Array<Record<string, unknown>>).map(b => b.type).join(",")
          : typeof msg.content;
        console.log(`[agentscore] msg role=${msg.role} contentTypes=${types}`);
      }

      if (!event.success) return;

      const now = Date.now();
      const last = lastUploadAt.get(sessionKey) ?? 0;
      if (now - last < cfg.throttleMs) return;

      // Build session from event + context
      // 从 event 和 context 构建 session
      const actions = extractActions(event.messages);
      const report = extractReport(event.messages);
      console.log(`[agentscore] extracted ${actions.length} actions, report length=${report.length}`);

      const session: AgentSession = {
        id: ctx.sessionId ?? sessionKey,
        prompt,
        actions,
        report,
        startedAt: new Date(now - (event.durationMs ?? 0)).toISOString(),
        endedAt: new Date(now).toISOString(),
        framework: "openclaw",
        model: "",
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
