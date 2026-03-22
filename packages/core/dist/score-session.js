import { computeAlignment } from './scorer/align.js';
import { computeAlignmentLLM } from './scorer/llm-align.js';
/**
 * Unified scoring entry point.
 *
 * If an LlmProvider is given, uses the 4-step LLM-as-judge pipeline.
 * Otherwise falls back to deterministic scoring (TF-IDF + greedy matching).
 */
export async function scoreSession(input, llm) {
    if (llm) {
        return computeAlignmentLLM(input, llm);
    }
    return computeAlignment(input);
}
//# sourceMappingURL=score-session.js.map