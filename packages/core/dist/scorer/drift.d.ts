import type { AgentAction } from '../parser/types.js';
import type { DriftReport } from './types.js';
/**
 * Compare two sets of actions to detect behavioral drift.
 * Returns a drift report with the percentage deviation and specific changes.
 */
export declare function computeDrift(baseline: AgentAction[], current: AgentAction[]): DriftReport;
//# sourceMappingURL=drift.d.ts.map