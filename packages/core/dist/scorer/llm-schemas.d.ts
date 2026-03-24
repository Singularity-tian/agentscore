import { z } from 'zod';
export declare const checkpointSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    expectedTool: z.ZodOptional<z.ZodString>;
    entities: z.ZodArray<z.ZodString, "many">;
    isConstraint: z.ZodBoolean;
    constraintType: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, "dont" | "only" | "limit" | null, string | null | undefined>;
}, "strip", z.ZodTypeAny, {
    id: string;
    description: string;
    entities: string[];
    isConstraint: boolean;
    constraintType: "dont" | "only" | "limit" | null;
    expectedTool?: string | undefined;
}, {
    id: string;
    description: string;
    entities: string[];
    isConstraint: boolean;
    expectedTool?: string | undefined;
    constraintType?: string | null | undefined;
}>;
export declare const extractCheckpointsResponseSchema: z.ZodObject<{
    checkpoints: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodString;
        expectedTool: z.ZodOptional<z.ZodString>;
        entities: z.ZodArray<z.ZodString, "many">;
        isConstraint: z.ZodBoolean;
        constraintType: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, "dont" | "only" | "limit" | null, string | null | undefined>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        description: string;
        entities: string[];
        isConstraint: boolean;
        constraintType: "dont" | "only" | "limit" | null;
        expectedTool?: string | undefined;
    }, {
        id: string;
        description: string;
        entities: string[];
        isConstraint: boolean;
        expectedTool?: string | undefined;
        constraintType?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    checkpoints: {
        id: string;
        description: string;
        entities: string[];
        isConstraint: boolean;
        constraintType: "dont" | "only" | "limit" | null;
        expectedTool?: string | undefined;
    }[];
}, {
    checkpoints: {
        id: string;
        description: string;
        entities: string[];
        isConstraint: boolean;
        expectedTool?: string | undefined;
        constraintType?: string | null | undefined;
    }[];
}>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type ExtractCheckpointsResponse = z.infer<typeof extractCheckpointsResponseSchema>;
export declare const checkpointVerificationSchema: z.ZodObject<{
    checkpointId: z.ZodString;
    passed: z.ZodBoolean;
    confidence: z.ZodNumber;
    matchedActionIndex: z.ZodNullable<z.ZodNumber>;
    reasoning: z.ZodString;
}, "strip", z.ZodTypeAny, {
    checkpointId: string;
    passed: boolean;
    confidence: number;
    matchedActionIndex: number | null;
    reasoning: string;
}, {
    checkpointId: string;
    passed: boolean;
    confidence: number;
    matchedActionIndex: number | null;
    reasoning: string;
}>;
export declare const verifyCheckpointsResponseSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        checkpointId: z.ZodString;
        passed: z.ZodBoolean;
        confidence: z.ZodNumber;
        matchedActionIndex: z.ZodNullable<z.ZodNumber>;
        reasoning: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        checkpointId: string;
        passed: boolean;
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
    }, {
        checkpointId: string;
        passed: boolean;
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    results: {
        checkpointId: string;
        passed: boolean;
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
    }[];
}, {
    results: {
        checkpointId: string;
        passed: boolean;
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
    }[];
}>;
export type CheckpointVerification = z.infer<typeof checkpointVerificationSchema>;
export type VerifyCheckpointsResponse = z.infer<typeof verifyCheckpointsResponseSchema>;
export declare const constraintCheckSchema: z.ZodObject<{
    checkpointId: z.ZodString;
    violated: z.ZodBoolean;
    violatingActionIndex: z.ZodNullable<z.ZodNumber>;
    reasoning: z.ZodString;
}, "strip", z.ZodTypeAny, {
    checkpointId: string;
    reasoning: string;
    violated: boolean;
    violatingActionIndex: number | null;
}, {
    checkpointId: string;
    reasoning: string;
    violated: boolean;
    violatingActionIndex: number | null;
}>;
export declare const checkConstraintsResponseSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        checkpointId: z.ZodString;
        violated: z.ZodBoolean;
        violatingActionIndex: z.ZodNullable<z.ZodNumber>;
        reasoning: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        checkpointId: string;
        reasoning: string;
        violated: boolean;
        violatingActionIndex: number | null;
    }, {
        checkpointId: string;
        reasoning: string;
        violated: boolean;
        violatingActionIndex: number | null;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    results: {
        checkpointId: string;
        reasoning: string;
        violated: boolean;
        violatingActionIndex: number | null;
    }[];
}, {
    results: {
        checkpointId: string;
        reasoning: string;
        violated: boolean;
        violatingActionIndex: number | null;
    }[];
}>;
export type ConstraintCheck = z.infer<typeof constraintCheckSchema>;
export type CheckConstraintsResponse = z.infer<typeof checkConstraintsResponseSchema>;
export declare const truthfulnessClaimSchema: z.ZodObject<{
    claim: z.ZodString;
    verified: z.ZodBoolean;
    matchedActionIndex: z.ZodNullable<z.ZodNumber>;
    confidence: z.ZodNumber;
    reasoning: z.ZodString;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    matchedActionIndex: number | null;
    reasoning: string;
    claim: string;
    verified: boolean;
}, {
    confidence: number;
    matchedActionIndex: number | null;
    reasoning: string;
    claim: string;
    verified: boolean;
}>;
export declare const verifyTruthfulnessResponseSchema: z.ZodObject<{
    claims: z.ZodArray<z.ZodObject<{
        claim: z.ZodString;
        verified: z.ZodBoolean;
        matchedActionIndex: z.ZodNullable<z.ZodNumber>;
        confidence: z.ZodNumber;
        reasoning: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
        claim: string;
        verified: boolean;
    }, {
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
        claim: string;
        verified: boolean;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    claims: {
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
        claim: string;
        verified: boolean;
    }[];
}, {
    claims: {
        confidence: number;
        matchedActionIndex: number | null;
        reasoning: string;
        claim: string;
        verified: boolean;
    }[];
}>;
export type TruthfulnessClaim = z.infer<typeof truthfulnessClaimSchema>;
export type VerifyTruthfulnessResponse = z.infer<typeof verifyTruthfulnessResponseSchema>;
//# sourceMappingURL=llm-schemas.d.ts.map