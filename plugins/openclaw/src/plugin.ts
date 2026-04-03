import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { jsonrepair } from "jsonrepair";
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

/**
 * Extract the last assistant text reply from a message list.
 * 从消息列表中提取最后一条 assistant 文本回复。
 */
function extractLastAssistantReply(messages: AgentMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const text = extractText(messages[i].content);
      if (text?.trim()) return text.trim();
    }
  }
  return null;
}

const STATUS_EMOJI: Record<string, string> = {
  completed: '✅',
  not_completed: '❌',
  partial: '⚠️',
  skipped: '⏭️',
};

/**
 * Parse LLM analysis output as JSON with repair fallback.
 * 解析 LLM 分析输出为 JSON，支持修复不合法 JSON。
 */
function parseAnalysisJson(raw: string): {
  status?: string;
  skipReason?: string;
  taskCompletion?: string;
  issues?: unknown;
  suggestions?: unknown;
} | null {
  try {
    // Strip markdown code fences if present
    // 去掉 markdown 代码块包裹
    let cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    // Extract first JSON object if surrounded by text
    // 从文本中提取第一个 { ... } 对象
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
    // Repair and parse
    // 修复并解析
    return JSON.parse(jsonrepair(cleaned));
  } catch {
    return null;
  }
}

/**
 * Build a plain-text Discord message from analysis agent output + cached header info.
 * Attempts to parse JSON output; falls back to raw text on failure.
 * 根据分析 agent 的输出和缓存的 header 信息构建纯文本 Discord 消息。
 * 尝试解析 JSON 输出；失败时回退到原始文本。
 */
function formatAnalysisMessage(
  raw: string,
  headerInfo: { agentLabel: string; timeLabel: string; promptPreview: string } | null,
): string {
  const headerBlock = headerInfo
    ? `📋 **${headerInfo.agentLabel}**\n🕐 ${headerInfo.timeLabel}\n> ${headerInfo.promptPreview}\n`
    : '';

  const parsed = parseAnalysisJson(raw);

  // JSON parse succeeded — build structured message
  // JSON 解析成功 — 构建结构化消息
  if (parsed && typeof parsed.status === 'string') {
    const emoji = STATUS_EMOJI[parsed.status] ?? '📋';

    if (parsed.status === 'skipped') {
      return `${headerBlock}${emoji} Skipped: ${parsed.skipReason ?? 'no reason given'}\n`;
    }

    const lines: string[] = [];
    lines.push(`${headerBlock}${emoji} ${parsed.taskCompletion ?? '(no details)'}`);

    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    if (issues.length > 0) {
      lines.push('', '❗ **Issues**');
      for (const issue of issues) lines.push(`• ${issue}`);
    }

    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    if (suggestions.length > 0) {
      lines.push('', '💡 **Suggestions**');
      for (const s of suggestions) lines.push(`• ${s}`);
    }

    let result = lines.join('\n');
    if (result.length > 1900) result = result.slice(0, 1900) + '\n...(truncated)';
    return result + '\n';
  }

  // JSON parse failed — fallback to raw text
  // JSON 解析失败 — 回退到原始文本
  let result = `${headerBlock}${raw}`;
  if (result.length > 1900) result = result.slice(0, 1900) + '\n...(truncated)';
  return result + '\n';
}

/**
 * Serialize conversation history before the current task for analysis context.
 * Includes tool calls but truncates results to save tokens.
 * 将当前 task 之前的对话历史序列化为分析上下文。包含 tool call 但截断 result。
 */
function serializeContext(groups: AgentMessage[][], currentGroupIndex: number): string {
  if (currentGroupIndex <= 0) return '(no prior context)';
  const lines: string[] = [];
  // Only include the last 5 groups to avoid token explosion
  // 只包含最近 5 组以控制 token 用量
  const startIdx = Math.max(0, currentGroupIndex - 5);
  for (let g = startIdx; g < currentGroupIndex; g++) {
    for (const msg of groups[g]) {
      if (msg.role === 'user') {
        const text = extractText(msg.content);
        if (text) {
          const cleaned = stripOpenClawMetadata(text);
          if (cleaned) lines.push(`[user] ${cleaned.slice(0, 500)}`);
        }
      } else if (msg.role === 'assistant') {
        const text = extractText(msg.content);
        if (text) lines.push(`[assistant] ${text.slice(0, 300)}`);
        // Serialize tool calls from assistant content blocks
        // 序列化 assistant 消息中的 tool call
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            const b = block as Record<string, unknown>;
            if ((b.type === 'toolCall' || b.type === 'tool_use') && typeof b.name === 'string') {
              const params = JSON.stringify(b.arguments ?? b.input ?? b.params ?? {}).slice(0, 200);
              lines.push(`  → ${b.name}(${params})`);
            }
          }
        }
      } else if (msg.role === 'toolResult' || msg.role === 'tool') {
        const text = extractText(msg.content);
        if (text) lines.push(`  ← ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n') || '(no prior context)';
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
  // Remove "System: [timestamp] ..." lines (process exit notifications, cron triggers, messaging events)
  // 移除 "System: [timestamp] ..." 行（进程退出通知、cron 触发、消息事件）
  cleaned = cleaned.replace(/^System: \[.*?\].*$/gm, "");

  return cleaned.trim();
}

// Extract channel name from OpenClaw metadata before stripping
// 在剥离 metadata 前从 OpenClaw 元数据中提取频道名称
function extractChannelName(text: string): string | null {
  const match = text.match(/"group_channel"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
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
      // Strip OpenClaw metadata/UNTRUSTED wrappers before using as prompt
      // 剥离 OpenClaw metadata/UNTRUSTED 包装后再作为 prompt
      const cleanedText = stripOpenClawMetadata(text);
      if (!cleanedText) continue;
      // Skip OpenClaw system heartbeat messages (periodic health checks)
      // 跳过 OpenClaw 系统心跳消息（定期健康检查）
      if (cleanedText.startsWith(HEARTBEAT_PREFIX)) continue;
      promptParts.push(cleanedText);
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
  // Analysis agent config (auto-derived from OpenClaw main config if not set)
  // 分析 agent 配置（未设置时从 OpenClaw 主配置自动推导）
  analysisHooksUrl?: string;
  analysisHooksToken?: string;
  analysisDiscordChannelId?: string;
}

type ResolvedConfig = Required<Omit<AgentScorePluginConfig, "apiKey" | "analysisHooksUrl" | "analysisHooksToken" | "analysisDiscordChannelId">>
  & Pick<AgentScorePluginConfig, "apiKey" | "analysisHooksUrl" | "analysisHooksToken" | "analysisDiscordChannelId">;

function resolveConfig(
  raw: Record<string, unknown>,
): ResolvedConfig {
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

  // Analysis config: only channelId is required from user
  // hooksUrl and hooksToken auto-derived from OpenClaw main config (can be overridden)
  // 分析配置：用户只需填 channelId
  // hooksUrl 和 hooksToken 从 OpenClaw 主配置自动推导（可手动覆盖）
  const analysisDiscordChannelId = typeof raw.analysisDiscordChannelId === "string"
    ? raw.analysisDiscordChannelId
    : (typeof globalThis.process?.env?.AGENTSCORE_DISCORD_CHANNEL_ID === "string" ? globalThis.process.env.AGENTSCORE_DISCORD_CHANNEL_ID : undefined);
  // Optional overrides (normally auto-derived in register())
  // 可选覆盖（通常在 register() 中自动推导）
  const analysisHooksUrl = typeof raw.analysisHooksUrl === "string" ? raw.analysisHooksUrl : undefined;
  const analysisHooksToken = typeof raw.analysisHooksToken === "string" ? raw.analysisHooksToken : undefined;

  return { apiKey, threshold, throttleMs, verbose, dashboardUrl, analysisHooksUrl, analysisHooksToken, analysisDiscordChannelId };
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
  displayName?: string,
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
      // Pass channel name as display name for dashboard
      // 将频道名称作为备注名传给 dashboard
      ...(displayName ? { displayName } : {}),
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

// ── Analysis dispatch ─────────────────────────────────────
// ── 分析派发 ────────��─────────────────────────────────────

/** Timeout for hooks dispatch — short since it's fire-and-forget. */
const DISPATCH_TIMEOUT_MS = 10_000;

/** Cached header info for analysis agent output formatting. */
// 缓存的 header 信息，用于分析 agent 输出格式化。
interface AnalysisHeaderInfo {
  agentLabel: string;
  timeLabel: string;
  promptPreview: string;
}
const pendingAnalysisHeaders = new Map<string, AnalysisHeaderInfo>();

/**
 * Dispatch analysis request to a dedicated OpenClaw analysis agent via hooks API.
 * The analysis agent will review the session and post findings to Discord.
 * 通过 hooks API 将分析请求派发给专用的 OpenClaw 分析 agent。
 * 分析 agent 会审查 session 并将结果发送到 Discord。
 */
async function dispatchAnalysis(
  taskSlice: TaskSlice,
  context: string,
  sessionKey: string,
  channelName: string | undefined,
  hooksUrl: string,
  hooksToken: string,
  discordChannelId: string,
): Promise<void> {
  // Build fixed header: agent name | display name | time | prompt preview
  // ������固定头部：agent 名称 | 备注名 | 时间 | prompt 预览
  const agentLabel = channelName ? `${channelName} (${sessionKey})` : sessionKey;
  const timeLabel = new Date(taskSlice.startedAt).toLocaleString('en-US', { timeZone: 'UTC', hour12: false });
  const promptPreview = taskSlice.prompt.slice(0, 50) + (taskSlice.prompt.length > 50 ? '...' : '');
  const message = [
    `## Instructions`,
    `You are an agent behavior analyst. Analyze the agent session below.`,
    `Respond with a JSON object only, no other text. Schema:`,
    ``,
    `If the session is casual chat, greeting, or simple Q&A with no meaningful tool calls:`,
    `{"status":"skipped","skipReason":"brief reason"}`,
    ``,
    `Otherwise:`,
    `{"status":"completed|not_completed|partial","taskCompletion":"one sentence summary","issues":["issue 1","issue 2"],"suggestions":["fix 1","fix 2"]}`,
    ``,
    `Rules:`,
    `- status must be one of: completed, not_completed, partial, skipped`,
    `- issues: 0-4 items, each one line`,
    `- suggestions: 0-3 items, each one line`,
    `- Respond with raw JSON only, no markdown fences, no extra text`,
    ``,
    `## Session`,
    `Agent: ${sessionKey}`,
    ``,
    `## Context`,
    context,
    ``,
    `## User Prompt`,
    taskSlice.prompt,
    ``,
    `## Agent Actions (${taskSlice.actions.length} total)`,
    ...(() => {
      const actions = taskSlice.actions;
      const fmt = (a: typeof actions[0], i: number) =>
        `${i + 1}. ${a.tool}(${JSON.stringify(a.params).slice(0, 200)})`;
      if (actions.length <= 20) return actions.map(fmt);
      // Show first 10 + last 10 to capture both start and end behavior
      // 显示前 10 + 后 10，确保能看到 session 开头和结尾的行为
      const head = actions.slice(0, 10).map(fmt);
      const tail = actions.slice(-10).map((a, i) => fmt(a, actions.length - 10 + i));
      return [...head, `... (${actions.length - 20} more actions omitted)`, ...tail];
    })(),
    ``,
    `## Agent Report`,
    taskSlice.report || '(empty)',
  ].join('\n');

  // Generate unique sessionKey and cache header for agent_end intercept
  // 生成唯一 sessionKey 并缓存 header 供 agent_end 拦截使用
  const monitorSessionKey = `subagent:ags-monitor:${Date.now()}`;
  pendingAnalysisHeaders.set(monitorSessionKey, { agentLabel, timeLabel: `${timeLabel} UTC`, promptPreview });

  // Clean up stale entries older than 5 minutes to prevent memory leaks
  // 清理超过 5 分钟的旧条目防止内存泄漏
  const staleThreshold = Date.now() - 5 * 60 * 1000;
  for (const [key] of pendingAnalysisHeaders) {
    const ts = parseInt(key.split(':').pop() ?? '0', 10);
    if (ts < staleThreshold) pendingAnalysisHeaders.delete(key);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(hooksUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hooksToken}`,
      },
      body: JSON.stringify({
        message,
        name: 'agentscore-analysis',
        sessionKey: monitorSessionKey,
        wakeMode: 'now',
        deliver: false,
        channel: 'discord',
        to: discordChannelId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[agentscore] analysis dispatch failed: HTTP ${response.status}: ${text}`);
    }
  } catch (err) {
    console.error(`[agentscore] analysis dispatch failed:`, (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
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

    // Auto-derive hooks URL and token from OpenClaw main config
    // 从 OpenClaw 主配置自动推导 hooks URL 和 token
    if (!cfg.analysisHooksUrl) {
      const port = (api.config as any).gateway?.port ?? 18789;
      cfg.analysisHooksUrl = `http://localhost:${port}/hooks/agent`;
    }
    if (!cfg.analysisHooksToken) {
      cfg.analysisHooksToken = (api.config as any).hooks?.token ?? undefined;
    }

    const lastUploadAt = new Map<string, number>();
    // Track the last uploaded task count per session to only upload new tasks
    // 跟踪每个 session 上次上传的 task 数量，只上传新增的 tasks
    const lastUploadedTaskCount = new Map<string, number>();

    // Register /ags-setup command for interactive configuration
    // 注册 /ags-setup 命令用于交互式配置
    (api as any).registerCommand({
      name: 'ags-setup',
      description: 'Configure AgentScore analysis agent — set Discord channel for reports',
      acceptsArgs: true,
      handler: async (ctx: any) => {
        const args = ctx.args?.trim();

        // /ags-setup or /ags-setup status — show current config
        // /ags-setup 或 /ags-setup status — 显示当前配置
        if (!args || args === 'status') {
          const status = cfg.analysisDiscordChannelId
            ? `✅ Analysis enabled\n` +
              `  Hooks URL: ${cfg.analysisHooksUrl}\n` +
              `  Hooks token: ${cfg.analysisHooksToken ? '(set)' : '(not set)'}\n` +
              `  Discord channel: ${cfg.analysisDiscordChannelId}`
            : `❌ Analysis not configured\n\n` +
              `Usage:\n` +
              `  /ags-setup here — use current channel for reports\n` +
              `  /ags-setup status — show current config`;
          return { text: status };
        }

        // /ags-setup here — use current Discord channel, write to config
        // /ags-setup here — 使用当前 Discord channel，写入配置
        if (args === 'here') {
          if (ctx.channelId !== 'discord') {
            return { text: '⚠️ This command only works in Discord channels.' };
          }
          if (!ctx.to) {
            return { text: '⚠️ Could not detect Discord channel ID.' };
          }

          try {
            // Read current config, update plugin section, write back
            // 读取当前配置，更新 plugin 部分，写回
            const config = await (api as any).runtime.config.loadConfig();

            // Auto-enable hooks if not enabled
            // 自动启用 hooks（如未启用）
            let needsRestart = false;
            if (!(config as any).hooks?.enabled) {
              if (!(config as any).hooks) (config as any).hooks = {};
              (config as any).hooks.enabled = true;
              if (!(config as any).hooks.token) {
                // Generate a random token
                // 生成随机 token
                (config as any).hooks.token = `ags_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
              }
              needsRestart = true;
            }

            // Ensure hooks allows monitor: sessionKey prefix
            // 确保 hooks 允许 monitor: sessionKey 前缀
            if (!(config as any).hooks.allowRequestSessionKey) {
              (config as any).hooks.allowRequestSessionKey = true;
              if (!Array.isArray((config as any).hooks.allowedSessionKeyPrefixes)) {
                (config as any).hooks.allowedSessionKeyPrefixes = ['hook:', 'subagent:ags-monitor:'];
              } else {
                if (!(config as any).hooks.allowedSessionKeyPrefixes.includes('hook:')) {
                  (config as any).hooks.allowedSessionKeyPrefixes.push('hook:');
                }
                if (!(config as any).hooks.allowedSessionKeyPrefixes.includes('subagent:ags-monitor:')) {
                  (config as any).hooks.allowedSessionKeyPrefixes.push('subagent:ags-monitor:');
                }
              }
              needsRestart = true;
            }

            const pluginSection = (config.plugins as Record<string, Record<string, unknown>>)?.['agentscore-openclaw']?.config as Record<string, unknown> ?? {};
            pluginSection.analysisDiscordChannelId = ctx.to;

            // Auto-detect hooks URL and token from main config
            // 从主配置自动检测 hooks URL 和 token
            const port = (config as any).gateway?.port ?? 18789;
            pluginSection.analysisHooksUrl = `http://localhost:${port}/hooks/agent`;
            pluginSection.analysisHooksToken = (config as any).hooks.token;

            // Ensure plugin entry exists and write back
            // 确保 plugin 入口存在并写回
            if (!(config as any).plugins) (config as any).plugins = {};
            if (!(config as any).plugins.entries) (config as any).plugins.entries = {};
            if (!(config as any).plugins.entries['agentscore-openclaw']) (config as any).plugins.entries['agentscore-openclaw'] = {};
            (config as any).plugins.entries['agentscore-openclaw'].config = pluginSection;
            await (api as any).runtime.config.writeConfigFile(config);

            // Update in-memory config
            // 更新内存中的配置
            cfg.analysisDiscordChannelId = ctx.to;
            cfg.analysisHooksUrl = pluginSection.analysisHooksUrl as string;
            cfg.analysisHooksToken = pluginSection.analysisHooksToken as string;

            const restartNote = needsRestart
              ? `\n\n⚠️ Hooks was just enabled — restart/rebuild required for the hooks endpoint to start. After restart, analysis will work automatically.`
              : '';

            return {
              text: `✅ Analysis configured!\n\n` +
                `Reports will be sent to this channel.\n` +
                `Hooks URL: ${cfg.analysisHooksUrl}\n` +
                `Hooks token: (set)` +
                restartNote
            };
          } catch (err) {
            return { text: `❌ Failed to write config: ${(err as Error).message}` };
          }
        }

        return { text: `Unknown argument: ${args}\n\nUsage:\n  /ags-setup — show status\n  /ags-setup here — use current channel` };
      },
    });

    // Use api.on() for typed plugin hooks (works for both webchat and channels)
    // 使用 api.on() 注册 typed plugin hook（webchat 和 channel 都会触发）
    (api as any).on(
      "agent_end",
      async (event: AgentEndEvent, ctx: AgentEndContext) => {
        const sessionKey = ctx.sessionKey ?? "unknown";
        console.log(
          `[agentscore] agent_end fired, sessionKey=${sessionKey}, success=${event.success}`,
        );

        // Intercept analysis agent output: format as embed and send to Discord (before success check)
        // 拦截分析 agent 输出：格式化为 embed 后发送到 Discord（在 success 检查之前）
        if (sessionKey.includes("ags-monitor:")) {
          if (cfg.analysisDiscordChannelId && event.messages?.length) {
            // Retrieve cached header by stripping OpenClaw's "agent:main:" prefix
            // 通过剥离 OpenClaw 的 "agent:main:" 前缀获取缓存的 header
            const monitorKey = sessionKey.replace(/^agent:main:/, '');
            const headerInfo = pendingAnalysisHeaders.get(monitorKey) ?? null;
            pendingAnalysisHeaders.delete(monitorKey);

            const assistantReply = extractLastAssistantReply(event.messages as AgentMessage[]);
            if (assistantReply) {
              const message = formatAnalysisMessage(assistantReply, headerInfo);
              try {
                await (api as any).runtime.channel.discord.sendMessageDiscord(
                  cfg.analysisDiscordChannelId,
                  message,
                );
              } catch (err) {
                console.error('[agentscore] failed to send analysis to Discord:', (err as Error).message);
              }
            }
          }
          return;
        }

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

        // Extract channel name from first user message metadata (before it's stripped)
        // 从第一条用户消息的 metadata 中提取频道名称（在剥离前）
        let channelName: string | undefined;
        const messages = event.messages ?? [];
        for (const msg of messages) {
          if (msg.role === "user") {
            const rawText = extractText(msg.content);
            if (rawText) {
              channelName = extractChannelName(rawText) ?? undefined;
              break;
            }
          }
        }

        // Fire-and-forget batch upload
        // 后台批量上传
        if (cfg.apiKey) {
          uploadBatchToRemote(
            taskSlices,
            sessionKey,
            cfg.apiKey,
            cfg.dashboardUrl,
            channelName,
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

        // Dispatch analysis to dedicated OpenClaw agent (fire-and-forget)
        // 派发分析给专用 OpenClaw agent（后台执行）
        if (cfg.analysisHooksUrl && cfg.analysisHooksToken && cfg.analysisDiscordChannelId) {
          const lastGroupIndex = groups.length - 1;
          const context = serializeContext(groups, lastGroupIndex);

          dispatchAnalysis(
            lastSlice,
            context,
            sessionKey,
            channelName,
            cfg.analysisHooksUrl,
            cfg.analysisHooksToken,
            cfg.analysisDiscordChannelId,
          ).catch(() => { /* already logged */ });
        }
      },
    );
  },
};
