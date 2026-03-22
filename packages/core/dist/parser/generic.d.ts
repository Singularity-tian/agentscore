import type { AgentSession } from './types.js';
/**
 * Parse a generic JSON session log file into an AgentSession.
 * Supports a flexible schema to work with any agent framework.
 */
export declare function parseGenericSession(filePath: string): Promise<AgentSession>;
/**
 * Parse all JSON session files from a directory.
 */
export declare function parseGenericDirectory(dirPath: string): Promise<AgentSession[]>;
//# sourceMappingURL=generic.d.ts.map