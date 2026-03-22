import type { AgentAction } from '../parser/types.js';
/**
 * Compute a SHA-256 fingerprint of an agent session's behavioral pattern.
 * Used for drift detection — comparing behavioral patterns over time.
 */
export declare function sessionFingerprint(actions: AgentAction[]): string;
/**
 * Compute a SHA-256 hash of a string (e.g., prompt text).
 */
export declare function hashString(input: string): string;
/**
 * Compute a behavioral pattern hash that captures tool usage frequencies
 * and common sequences (more resilient to minor reorderings).
 */
export declare function behaviorHash(actions: AgentAction[]): string;
//# sourceMappingURL=hash.d.ts.map