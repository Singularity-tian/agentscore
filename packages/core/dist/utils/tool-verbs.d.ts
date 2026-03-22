/**
 * Maps common tool names to natural language action verbs.
 * Used for matching prompt instructions to actual tool calls.
 */
export declare const TOOL_VERB_MAP: Record<string, string[]>;
/**
 * Look up natural language verbs for a given tool name.
 * Falls back to splitting the tool name on underscores/camelCase.
 */
export declare function getToolVerbs(toolName: string): string[];
/**
 * Check if a tool name matches a natural language description.
 * Returns a confidence score (0-1).
 */
export declare function toolVerbMatch(toolName: string, description: string): number;
//# sourceMappingURL=tool-verbs.d.ts.map