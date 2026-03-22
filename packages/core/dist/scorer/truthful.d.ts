import type { AgentAction } from '../parser/types.js';
import type { TruthfulnessResult } from './types.js';
/**
 * Verify the truthfulness of an agent's report against its actual actions.
 *
 * Parses the report into individual claims, then checks each claim
 * against the list of actual actions taken.
 */
export declare function computeTruthfulness(report: string, actions: AgentAction[]): TruthfulnessResult;
//# sourceMappingURL=truthful.d.ts.map