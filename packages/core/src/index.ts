// Types
export type {
  AgentAction,
  PromptInstruction,
  Constraint,
  AgentSession,
  ScoringInput,
} from './parser/types.js';

export type {
  AlignmentScore,
  MatchedAction,
  TruthfulnessResult,
  TruthfulnessClaim,
  ConstraintViolation,
  DriftReport,
  DriftChange,
  LlmJudgeLogs,
} from './scorer/types.js';

// LLM types
export type { LlmProvider, Schema } from './llm/types.js';
export { createAnthropicProvider, type AnthropicProviderOptions } from './llm/anthropic.js';

// LLM schema types
export type {
  Checkpoint,
  ExtractCheckpointsResponse,
  CheckpointVerification,
  VerifyCheckpointsResponse,
  ConstraintCheck,
  CheckConstraintsResponse,
  TruthfulnessClaim as LlmTruthfulnessClaim,
  VerifyTruthfulnessResponse,
} from './scorer/llm-schemas.js';

// Parsers
export { parsePrompt } from './parser/prompt.js';
export { parseOpenClawSession, parseOpenClawDirectory } from './parser/openclaw.js';
export { parseGenericSession, parseGenericDirectory } from './parser/generic.js';

// Scorers
export { computeAlignment } from './scorer/align.js';
export { computeAlignmentLLM } from './scorer/llm-align.js';
export { computeTruthfulness } from './scorer/truthful.js';
export { computeDrift } from './scorer/drift.js';

// Unified entry point
export { scoreSession } from './score-session.js';

// Utils
export { matchScore, tokenize, cosineSimilarity } from './utils/semantic.js';
export { extractEntities, entityOverlap } from './utils/entities.js';
export { getToolVerbs, toolVerbMatch, TOOL_VERB_MAP } from './utils/tool-verbs.js';
export { sessionFingerprint, hashString, behaviorHash } from './utils/hash.js';
