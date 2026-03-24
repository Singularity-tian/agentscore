import { z } from 'zod';

// ── Step 1: Checkpoint Extraction ──────────────────────

export const checkpointSchema = z.object({
  id: z.string(),
  description: z.string(),
  expectedTool: z.string().optional(),
  entities: z.array(z.string()),
  isConstraint: z.boolean(),
  constraintType: z
    .string()
    .nullable()
    .optional()
    .transform((v) => {
      if (v == null) return null;
      const lower = v.toLowerCase();
      if (['dont', 'never', 'avoid', 'prohibit'].includes(lower)) return 'dont' as const;
      if (['only', 'exclusively'].includes(lower)) return 'only' as const;
      if (['limit', 'at_most', 'max'].includes(lower)) return 'limit' as const;
      return 'dont' as const; // safe fallback for any constraint
    }),
});

export const extractCheckpointsResponseSchema = z.object({
  checkpoints: z.array(checkpointSchema),
});

export type Checkpoint = z.infer<typeof checkpointSchema>;
export type ExtractCheckpointsResponse = z.infer<typeof extractCheckpointsResponseSchema>;

// ── Step 2: Checkpoint Verification ────────────────────

export const checkpointVerificationSchema = z.object({
  checkpointId: z.string(),
  passed: z.boolean(),
  confidence: z.number().min(0).max(1),
  matchedActionIndex: z.number().int().nullable(),
  reasoning: z.string(),
});

export const verifyCheckpointsResponseSchema = z.object({
  results: z.array(checkpointVerificationSchema),
});

export type CheckpointVerification = z.infer<typeof checkpointVerificationSchema>;
export type VerifyCheckpointsResponse = z.infer<typeof verifyCheckpointsResponseSchema>;

// ── Step 3: Constraint Compliance ──────────────────────

export const constraintCheckSchema = z.object({
  checkpointId: z.string(),
  violated: z.boolean(),
  violatingActionIndex: z.number().int().nullable(),
  reasoning: z.string(),
});

export const checkConstraintsResponseSchema = z.object({
  results: z.array(constraintCheckSchema),
});

export type ConstraintCheck = z.infer<typeof constraintCheckSchema>;
export type CheckConstraintsResponse = z.infer<typeof checkConstraintsResponseSchema>;

// ── Step 4: Truthfulness Verification ──────────────────

export const truthfulnessClaimSchema = z.object({
  claim: z.string(),
  verified: z.boolean(),
  matchedActionIndex: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const verifyTruthfulnessResponseSchema = z.object({
  claims: z.array(truthfulnessClaimSchema),
});

export type TruthfulnessClaim = z.infer<typeof truthfulnessClaimSchema>;
export type VerifyTruthfulnessResponse = z.infer<typeof verifyTruthfulnessResponseSchema>;
