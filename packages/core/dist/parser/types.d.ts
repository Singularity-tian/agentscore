/** A single action taken by an agent (tool call, API call, file operation, etc.) */
export interface AgentAction {
    /** Tool or function name (e.g., "gmail_send", "file_write") */
    tool: string;
    /** Parameters passed to the tool */
    params: Record<string, unknown>;
    /** What the tool returned */
    result?: unknown;
    /** ISO timestamp of when the action was executed */
    timestamp: string;
}
/** An instruction extracted from the agent's prompt */
export interface PromptInstruction {
    /** The raw text of the instruction */
    text: string;
    /** Extracted action verb (e.g., "send", "search", "create") */
    verb: string;
    /** Entities referenced (emails, URLs, filenames, names) */
    entities: string[];
}
/** A constraint extracted from the prompt (negative instructions) */
export interface Constraint {
    /** The raw text of the constraint */
    text: string;
    /** Type of constraint */
    type: 'dont' | 'only' | 'limit';
    /** Tool or action this constraint applies to */
    target: string;
}
/** A complete agent session with all data needed for scoring */
export interface AgentSession {
    /** Unique session identifier */
    id: string;
    /** The prompt / instructions given to the agent */
    prompt: string;
    /** Actions the agent actually performed */
    actions: AgentAction[];
    /** What the agent reported it did */
    report: string;
    /** ISO timestamp when the session started */
    startedAt: string;
    /** ISO timestamp when the session ended */
    endedAt?: string;
    /** Agent framework that produced this session */
    framework: 'openclaw' | 'claude-code' | 'langchain' | 'crewai' | 'custom';
    /** Model used (e.g., "claude-sonnet-4-20250514") */
    model?: string;
}
/** Input to the scoring engine */
export interface ScoringInput {
    /** The instructions given to the agent */
    prompt: string;
    /** What the agent actually did */
    actions: AgentAction[];
    /** What the agent said it did */
    report: string;
}
//# sourceMappingURL=types.d.ts.map