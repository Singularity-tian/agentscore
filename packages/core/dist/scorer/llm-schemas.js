import { z } from 'zod';
// ── Step 1: Checkpoint Extraction ──────────────────────
export const checkpointSchema = z.object({
    id: z.string(),
    description: z.string(),
    expectedTool: z.string().optional(),
    entities: z.array(z.string()),
    isConstraint: z.boolean(),
    constraintType: z.enum(['dont', 'only', 'limit']).nullable().optional(),
});
export const extractCheckpointsResponseSchema = z.object({
    checkpoints: z.array(checkpointSchema),
});
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
//# sourceMappingURL=llm-schemas.js.map