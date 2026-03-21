import type { AgentAction } from '../parser/types.js';

/** A successfully matched action: expected instruction → actual execution */
export interface MatchedAction {
  /** The expected instruction text */
  expected: string;
  /** The actual action that matched */
  actual: AgentAction;
  /** Match confidence (0-1) */
  confidence: number;
}

/** Result of truthfulness verification */
export interface TruthfulnessResult {
  /** Overall truthfulness score (0-100) */
  score: number;
  /** Individual claim verifications */
  claims: TruthfulnessClaim[];
}

/** A single claim from the agent's report and its verification status */
export interface TruthfulnessClaim {
  /** What the agent claimed it did */
  claimed: string;
  /** Whether a matching action was found */
  verified: boolean;
  /** The matching action, if found */
  matchedAction?: AgentAction;
  /** Match confidence (0-1) */
  confidence: number;
}

/** A constraint that was violated by the agent */
export interface ConstraintViolation {
  /** The constraint that was violated */
  constraint: string;
  /** The action that violated it */
  violatingAction: AgentAction;
  /** Description of the violation */
  description: string;
}

/** Complete alignment score output */
export interface AlignmentScore {
  /** Overall alignment score (0-100) */
  score: number;
  /** Truthfulness score (0-100) */
  truthfulness: number;
  /** Actions that matched expected instructions */
  matched: MatchedAction[];
  /** Instructions that were not executed */
  missed: string[];
  /** Actions taken that were not in the instructions */
  unexpected: AgentAction[];
  /** Constraint violations */
  violations: ConstraintViolation[];
  /** Human-readable summary */
  details: string;
}

/** Drift analysis comparing current behavior to a baseline */
export interface DriftReport {
  /** Current session hash */
  currentHash: string;
  /** Baseline session hash */
  baselineHash: string;
  /** Drift percentage (0-100) */
  driftPercentage: number;
  /** What changed from baseline */
  changes: DriftChange[];
}

/** A single behavioral change detected in drift analysis */
export interface DriftChange {
  /** Type of change */
  type: 'added_tool' | 'removed_tool' | 'frequency_change' | 'order_change';
  /** Description of the change */
  description: string;
  /** Severity (0-1) */
  severity: number;
}
