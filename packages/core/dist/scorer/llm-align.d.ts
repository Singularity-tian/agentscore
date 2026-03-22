import type { ScoringInput } from '../parser/types.js';
import type { AlignmentScore } from './types.js';
import type { LlmProvider } from '../llm/types.js';
/**
 * Compute alignment score using the LLM-as-judge pipeline.
 *
 * 4-step pipeline:
 * 1. Extract atomic checkpoints from prompt
 * 2. Verify each checkpoint against actions
 * 3. Check constraint compliance (if any constraints)
 * 4. Verify truthfulness of report (if report is non-empty)
 *
 * @param input - The scoring input (prompt, actions, report)
 * @param llm   - An LlmProvider implementation for structured generation
 */
export declare function computeAlignmentLLM(input: ScoringInput, llm: LlmProvider): Promise<AlignmentScore>;
//# sourceMappingURL=llm-align.d.ts.map