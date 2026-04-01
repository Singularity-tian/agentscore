import type { AgentAction } from '../parser/types.js';
import type { MatchedAction, ConstraintViolation } from './types.js';
/**
 * Generate a human-readable summary of the alignment analysis.
 * Shared between deterministic and LLM scoring paths.
 *
 * 生成对齐分析的可读摘要。确定性评分和 LLM 评分共用。
 */
export declare function generateDetails(score: number, truthfulness: number, matched: MatchedAction[], missed: string[], unexpected: AgentAction[], violations: ConstraintViolation[], options?: {
    label?: string;
    strongMatchThreshold?: number;
}): string;
//# sourceMappingURL=details.d.ts.map