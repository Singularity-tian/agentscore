import type { AgentSession } from './types.js';
/**
 * Parse OpenClaw session logs from a directory into an AgentSession.
 * OpenClaw stores session data as JSON files in ~/.openclaw/ or a workspace.
 */
export declare function parseOpenClawSession(sessionPath: string): Promise<AgentSession>;
/**
 * Parse all OpenClaw sessions from a directory.
 */
export declare function parseOpenClawDirectory(dirPath: string): Promise<AgentSession[]>;
//# sourceMappingURL=openclaw.d.ts.map