import type { AgentAction, ScoringInput, AlignmentScore } from '@llmagentscore/core';
import { computeAlignment } from '@llmagentscore/core';
import * as logWriter from './log-writer.js';

/** Configuration options for creating a session. */
export interface SessionOptions {
  /** A human-readable label for the session (defaults to "unnamed"). */
  label?: string;
  /** The prompt / instructions given to the agent. */
  prompt: string;
  /** Model identifier (e.g., "claude-sonnet-4-20250514"). */
  model?: string;
  /** Arbitrary metadata attached to the session. */
  metadata?: Record<string, unknown>;
}

/** Snapshot returned when a session ends. */
export interface SessionResult {
  /** Unique session identifier. */
  sessionId: string;
  /** Label given at creation time. */
  label: string;
  /** Model identifier (e.g., "claude-sonnet-4-20250514"). */
  model?: string;
  /** Recorded actions. */
  actions: AgentAction[];
  /** The original prompt given to the agent. */
  prompt: string;
  /** What the agent reported it did. */
  report: string;
  /** Alignment score computed by the core engine. */
  score: AlignmentScore;
  /** ISO timestamp when the session started. */
  startedAt: string;
  /** ISO timestamp when the session ended. */
  endedAt: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * High-level wrapper around the core scoring engine.
 *
 * Usage:
 * ```ts
 * const session = AgentScoreSession.startSession({ prompt: '...' });
 * session.recordAction({ tool: 'gmail_send', params: { to: 'x' }, timestamp: new Date().toISOString() });
 * const result = session.end('The agent sent an email.');
 * console.log(result.score);
 * ```
 */
export class AgentScoreSession {
  /** Unique session identifier (UUID v4-ish). */
  readonly sessionId: string;
  readonly label: string;
  readonly prompt: string;
  readonly model: string | undefined;
  readonly metadata: Record<string, unknown>;
  readonly startedAt: string;

  private readonly actions: AgentAction[] = [];
  private ended = false;

  private constructor(options: SessionOptions) {
    this.sessionId = generateId();
    this.label = options.label ?? 'unnamed';
    this.prompt = options.prompt;
    this.model = options.model;
    this.metadata = options.metadata ?? {};
    this.startedAt = new Date().toISOString();

    logWriter.writePrompt(this.prompt);
    logWriter.writeMetadata({
      sessionId: this.sessionId,
      label: this.label,
      model: this.model,
      metadata: this.metadata,
      startedAt: this.startedAt,
    });
  }

  /** Create and return a new session. */
  static startSession(options: SessionOptions): AgentScoreSession {
    return new AgentScoreSession(options);
  }

  /**
   * Record an action performed by the agent.
   *
   * If `timestamp` is omitted from the action, the current time is used.
   */
  recordAction(action: AgentAction): void {
    if (this.ended) {
      throw new Error(
        `Session ${this.sessionId} has already ended. Cannot record more actions.`,
      );
    }
    const timestamped = {
      ...action,
      timestamp: action.timestamp ?? new Date().toISOString(),
    };
    this.actions.push(timestamped);
    logWriter.appendAction(timestamped);
  }

  /**
   * End the session, compute the alignment score, and return the result.
   *
   * @param report - What the agent reported it did (used for truthfulness).
   */
  end(report = ''): SessionResult {
    if (this.ended) {
      throw new Error(
        `Session ${this.sessionId} has already ended.`,
      );
    }
    this.ended = true;

    const endedAt = new Date().toISOString();

    const input: ScoringInput = {
      prompt: this.prompt,
      actions: [...this.actions],
      report,
    };

    const score = computeAlignment(input);

    return {
      sessionId: this.sessionId,
      label: this.label,
      model: this.model,
      actions: [...this.actions],
      prompt: this.prompt,
      report,
      score,
      startedAt: this.startedAt,
      endedAt,
      durationMs:
        new Date(endedAt).getTime() - new Date(this.startedAt).getTime(),
    };
  }

  /** Whether this session has already been ended. */
  get isEnded(): boolean {
    return this.ended;
  }

  /** Number of actions recorded so far. */
  get actionCount(): number {
    return this.actions.length;
  }
}

/** Generate a simple pseudo-random identifier. */
function generateId(): string {
  const hex = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}
