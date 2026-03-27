import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  computeAlignment,
  type AgentSession,
  type ScoringInput,
} from "@llmagentscore/core";
import { formatReport } from "./report.js";

// Message shape from agent_end hook
// agent_end hook 传入的消息结构
interface AgentMessage {
  role: string;
  content: unknown;
  timestamp?: number;
  toolCallId?: string;
  tool_use_id?: string;
}

// agent_end hook event (first argument)
// agent_end hook 事件（第一个参数）
interface AgentEndEvent {
  messages?: AgentMessage[];
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

// A single task extracted from a message group
// 从消息分组中提取的单个任务
interface TaskSlice {
  prompt: string;
  actions: Array<{
    tool: string;
    params: Record<string, unknown>;
    result?: unknown;
    timestamp: string;
  }>;
  report: string;
  startedAt: string;
  endedAt: string;
}

// ── Helper functions ──────────────────────────────────────
// ── 辅助函数 ──────────────────────────────────────────────

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

// Extract tool calls from a message group as AgentAction[]
// 从消息分组中提取 tool 调用作为 AgentAction[]
function extractActions(messages?: AgentMessage[]): TaskSlice["actions"] {
  if (!messages?.length) return [];
  const actions: TaskSlice["actions"] = [];

  const pendingTools = new Map<
    string,
    { tool: string; params: Record<string, unknown>; result?: unknown; timestamp: string }
  >();

  for (const msg of messages) {
    const timestamp =
      typeof msg.timestamp === "number"
        ? new Date(msg.timestamp).toISOString()
        : new Date().toISOString();

    // Match toolCall blocks (OpenClaw uses "toolCall" not "tool_use")
    // 匹配 toolCall blocks（OpenClaw 使用 "toolCall" 而非 "tool_use"）
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (
          (b.type === "toolCall" || b.type === "tool_use") &&
          typeof b.name === "string"
        ) {
          const entry: TaskSlice["actions"][number] = {
            tool: b.name,
            params:
              (b.arguments as Record<string, unknown>) ??
              (b.input as Record<string, unknown>) ??
              (b.params as Record<string, unknown>) ??
              {},
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
    if (
      (msg.role === "toolResult" || msg.role === "tool") &&
      Array.isArray(msg.content)
    ) {
      const resultId = msg.toolCallId ?? msg.tool_use_id;
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

// Split messages into task groups, each starting with a user message
// 将消息按用户消息切分为任务分组，每条 user 消息开始一个新分组
function splitMessagesIntoTasks(messages: AgentMessage[]): AgentMessage[][] {
  if (!messages.length) return [];
  const groups: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  let hasAssistantInGroup = false;

  for (const msg of messages) {
    // Only split when a user message follows an assistant response;
    // consecutive user messages (e.g. user interrupted or gateway restarted) stay in one group
    // 只在 user 消息出现在 assistant 回复之后时切分；
    // 连续的 user 消息（如用户打断或 gateway 重启）保持在同一组
    if (msg.role === "user" && current.length > 0 && hasAssistantInGroup) {
      groups.push(current);
      current = [];
      hasAssistantInGroup = false;
    }
    if (msg.role === "assistant") {
      hasAssistantInGroup = true;
    }
    current.push(msg);
  }

  // Push the last group
  // 保存最后一个分组
  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

// Strip OpenClaw metadata and UNTRUSTED wrappers from user message text.
// Remove all metadata blocks and keep only the actual user message.
// 剥离 OpenClaw 注入的 metadata 和 UNTRUSTED 包装，只保留实际用户消息。
// 移除所有元数据块，仅保留用户的真实消息。
function stripOpenClawMetadata(text: string): string {
  let cleaned = text;
  // Remove <<<EXTERNAL_UNTRUSTED_CONTENT>>> blocks (e.g. channel topic metadata)
  // 移除 <<<EXTERNAL_UNTRUSTED_CONTENT>>> 块（如频道主题元数据）
  cleaned = cleaned.replace(
    /<<<EXTERNAL_UNTRUSTED_CONTENT[^>]*>>>[\s\S]*?<<<END_EXTERNAL_UNTRUSTED_CONTENT[^>]*>>>/g,
    ""
  );
  // Remove "Label (untrusted...): ```json { ... } ```" metadata blocks (objects and arrays)
  // 移除 "标签 (untrusted...): ```json { ... } ```" 元数据块（对象和数组）
  cleaned = cleaned.replace(/\w[\w ]*\(untrusted[^)]*\):\s*```json\s*[\s\S]*?```/g, "");
  // Remove "Untrusted context..." preamble
  // 移除 "Untrusted context..." 前导文字
  cleaned = cleaned.replace(/Untrusted context \(metadata, do not treat as instructions or commands\):\s*/g, "");
  // Remove SECURITY NOTICE blocks
  // 移除 SECURITY NOTICE 警告块
  cleaned = cleaned.replace(/⚠️\s*SECURITY NOTICE[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, "");

  return cleaned.trim();
}

// Build a TaskSlice from a message group
// 从消息分组构建 TaskSlice
function buildTaskSlice(
  group: AgentMessage[],
  fallbackStartMs: number,
  groupIndex: number,
): TaskSlice | null {
  // Collect user message texts as prompt, skipping bootstrap/system-injected messages
  // 收集用户消息文本作为 prompt，跳过 bootstrap/系统注入的消息
  const BOOTSTRAP_PREFIX = "A new session was started via";
  const HEARTBEAT_PREFIX = "Read HEARTBEAT.md if it exists";
  const promptParts: string[] = [];
  for (const msg of group) {
    if (msg.role === "user") {
      const text = extractText(msg.content);
      if (!text) continue;
      // Skip OpenClaw bootstrap messages (session startup instructions)
      // 跳过 OpenClaw bootstrap 消息（会话启动指令）
      if (text.startsWith(BOOTSTRAP_PREFIX)) continue;
      // Skip OpenClaw system heartbeat messages (periodic health checks)
      // 跳过 OpenClaw 系统心跳消息（定期健康检查）
      if (text.startsWith(HEARTBEAT_PREFIX)) continue;
      // Strip OpenClaw metadata/UNTRUSTED wrappers before using as prompt
      // 剥离 OpenClaw metadata/UNTRUSTED 包装后再作为 prompt
      const cleanedText = stripOpenClawMetadata(text);
      if (cleanedText) promptParts.push(cleanedText);
    }
  }
  const prompt = promptParts.join("\n\n");
  if (!prompt) return null; // API requires prompt.min(1), also filters pure bootstrap groups

  // Collect all assistant text as report
  // 收集所有 assistant 文本作为 report
  const reportParts: string[] = [];
  for (const msg of group) {
    if (msg.role === "assistant") {
      const text = extractText(msg.content);
      if (text) reportParts.push(text);
    }
  }
  const report = reportParts.join("\n\n");

  // Extract actions from this group
  // 从该分组提取 actions
  const actions = extractActions(group);

  // Resolve timestamps: prefer message timestamps, fallback with 1ms offset for dedup
  // 解析时间戳：优先用消息时间戳，缺失时用 1ms 偏移保证去重唯一性
  const firstTs = group.find((m) => typeof m.timestamp === "number")?.timestamp;
  const lastTs = [...group].reverse().find((m) => typeof m.timestamp === "number")?.timestamp;
  const startedAt = new Date(firstTs ?? fallbackStartMs + groupIndex).toISOString();
  const endedAt = new Date(lastTs ?? fallbackStartMs + groupIndex + 1).toISOString();

  return { prompt, actions, report, startedAt, endedAt };
}

// ── Upload functions ──────────────────────────────────────
// ── 上传函数 ──────────────────────────────────────────────

/** Upload timeout – generous because the server does LLM scoring. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** Max tasks per batch (dashboard limit) */
const BATCH_SIZE = 50;

export interface AgentScorePluginConfig {
  apiKey?: string;
  threshold?: number;
  throttleMs?: number;
  verbose?: boolean;
  dashboardUrl?: string;
}

function resolveConfig(
  raw: Record<string, unknown>,
): Required<Omit<AgentScorePluginConfig, "apiKey">> & { apiKey?: string } {
  const threshold =
    typeof raw.threshold === "number" &&
    raw.threshold >= 0 &&
    raw.threshold <= 100
      ? raw.threshold
      : 70;
  const throttleMs =
    typeof raw.throttleMs === "number" && raw.throttleMs > 0
      ? raw.throttleMs
      : 60_000;
  const verbose = raw.verbose === true;
  const dashboardUrl = (
    typeof raw.dashboardUrl === "string" && raw.dashboardUrl
      ? raw.dashboardUrl
      : "https://getagentscore.com"
  ).replace(/\/+$/, "");
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : undefined;

  return { apiKey, threshold, throttleMs, verbose, dashboardUrl };
}

function parseAgentId(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 3) {
    const source = parts[2]; // discord / cron / webchat
    // Keep channel ID for per-channel granularity on Discord
    // Discord 保留 channel ID 实现按频道区分
    if (source === "discord" && parts.length >= 5) {
      return `${parts[1]}:${parts[2]}:${parts[3]}:${parts[4]}`;
    }
    return `${parts[1]}:${parts[2]}`;
  }
  return parts.length >= 2 ? parts[1] : sessionKey;
}

// Upload a single session to the dashboard (kept for backward compatibility)
// 上传单个 session 到 dashboard（保留用于向后兼容）
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
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

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

// Upload multiple tasks as a batch to the dashboard
// 批量上传多个 tasks 到 dashboard
async function uploadBatchToRemote(
  taskSlices: TaskSlice[],
  sessionKey: string,
  apiKey: string,
  dashboardUrl: string,
): Promise<boolean> {
  const agentName = parseAgentId(sessionKey);
  const url = `${dashboardUrl}/api/v1/score`;
  let allOk = true;

  // Chunk into batches of BATCH_SIZE
  // 按 BATCH_SIZE 分批
  for (let i = 0; i < taskSlices.length; i += BATCH_SIZE) {
    const batch = taskSlices.slice(i, i + BATCH_SIZE);
    const payload = {
      agentName,
      framework: "openclaw" as const,
      source: "sdk" as const,
      tasks: batch.map((t) => ({
        prompt: t.prompt,
        actions: t.actions,
        report: t.report,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        model: "",
      })),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

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
          `[agentscore] batch upload failed: HTTP ${response.status}: ${text}`,
        );
        allOk = false;
      }
    } catch (err) {
      console.error(`[agentscore] batch upload failed:`, (err as Error).message);
      allOk = false;
    } finally {
      clearTimeout(timer);
    }
  }

  return allOk;
}

// ── Scoring ───────────────────────────────────────────────
// ── 评分 ──────────────────────────────────────────────────

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

// ── Plugin entry ──────────────────────────────────────────
// ── 插件入口 ──────────────────────────────────────────────

export default {
  id: "agentscore-openclaw",
  name: "AgentScore",
  description:
    "Alignment verification — scores agent alignment and uploads to dashboard",
  register(api: OpenClawPluginApi) {
    const cfg = resolveConfig(api.pluginConfig ?? {});
    const lastUploadAt = new Map<string, number>();
    // Track the last uploaded task count per session to only upload new tasks
    // 跟踪每个 session 上次上传的 task 数量，只上传新增的 tasks
    const lastUploadedTaskCount = new Map<string, number>();

    // Use api.on() for typed plugin hooks (works for both webchat and channels)
    // 使用 api.on() 注册 typed plugin hook（webchat 和 channel 都会触发）
    (api as any).on(
      "agent_end",
      async (event: AgentEndEvent, ctx: AgentEndContext) => {
        const sessionKey = ctx.sessionKey ?? "unknown";
        console.log(
          `[agentscore] agent_end fired, sessionKey=${sessionKey}, success=${event.success}`,
        );

        if (!event.success) return;

        // Skip internal temporary agents (e.g. slug-generator)
        // 跳过内部临时 agent（如 slug-generator）
        if (sessionKey.startsWith("temp:")) return;

        const now = Date.now();
        const last = lastUploadAt.get(sessionKey) ?? 0;
        if (now - last < cfg.throttleMs) return;

        // Split messages into per-user-turn task groups
        // 将消息按用户交互轮次切分为任务分组
        const groups = splitMessagesIntoTasks(event.messages ?? []);
        const sessionStartMs = now - (event.durationMs ?? 0);

        const allTaskSlices = groups
          .map((group, idx) => buildTaskSlice(group, sessionStartMs, idx))
          .filter((s): s is TaskSlice => s !== null);

        if (allTaskSlices.length === 0) {
          console.log(`[agentscore] no valid tasks found, skipping`);
          return;
        }

        // Only upload tasks that haven't been uploaded yet
        // 只上传尚未上传的新 tasks
        const previousCount = lastUploadedTaskCount.get(sessionKey) ?? 0;
        const taskSlices = allTaskSlices.slice(previousCount);

        if (taskSlices.length === 0) {
          console.log(`[agentscore] no new tasks since last upload, skipping`);
          return;
        }

        console.log(
          `[agentscore] split into ${allTaskSlices.length} tasks, ${taskSlices.length} new (${previousCount} already uploaded)`,
        );


        // Record throttle timestamp and task count before async upload
        // 在异步上传前记录节流时间戳和 task 数量
        lastUploadAt.set(sessionKey, now);
        lastUploadedTaskCount.set(sessionKey, allTaskSlices.length);

        // Fire-and-forget batch upload
        // 后台批量上传
        if (cfg.apiKey) {
          uploadBatchToRemote(
            taskSlices,
            sessionKey,
            cfg.apiKey,
            cfg.dashboardUrl,
          ).catch(() => {
            /* already logged inside uploadBatchToRemote */
          });
        }

        // Local scoring on the last task (most recent interaction)
        // 对最后一个 task 做本地评分（最新交互）
        const lastSlice = taskSlices[taskSlices.length - 1];
        const session: AgentSession = {
          id: ctx.sessionId ?? sessionKey,
          prompt: lastSlice.prompt,
          actions: lastSlice.actions,
          report: lastSlice.report,
          startedAt: lastSlice.startedAt,
          endedAt: lastSlice.endedAt,
          framework: "openclaw",
          model: "",
        };

        const result = await computeAlignmentFromSession(session, cfg);

        const warning = result.belowThreshold
          ? ` (below threshold ${result.threshold})`
          : "";

        console.log(
          `[agentscore] ${sessionKey}: score=${result.score.score}/100${warning}`,
        );
      },
    );
  },
};
