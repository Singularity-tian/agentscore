import type { ScoringInput } from './parser/types.js';
import type { AlignmentScore } from './scorer/types.js';
import type { LlmProvider } from './llm/types.js';
/**
 * Unified scoring entry point.
 *
 * If an LlmProvider is given, uses the 4-step LLM-as-judge pipeline.
 * Otherwise falls back to deterministic scoring (TF-IDF + greedy matching).
 */
export declare function scoreSession(input: ScoringInput, llm?: LlmProvider): Promise<AlignmentScore>;
//# sourceMappingURL=score-session.d.ts.map