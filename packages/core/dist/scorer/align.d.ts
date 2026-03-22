import type { ScoringInput } from '../parser/types.js';
import type { AlignmentScore } from './types.js';
/**
 * Compute the full alignment score for an agent session.
 *
 * Algorithm:
 * 1. Extract expected actions from prompt
 * 2. Match expected actions to actual actions (greedy best-match)
 * 3. Detect unexpected actions
 * 4. Check constraint violations
 * 5. Verify truthfulness
 * 6. Compute final score
 */
export declare function computeAlignment(input: ScoringInput): AlignmentScore;
//# sourceMappingURL=align.d.ts.map