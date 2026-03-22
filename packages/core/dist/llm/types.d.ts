/**
 * A schema that can parse/validate unknown data into type T.
 * Compatible with Zod v3, v4, and any object with a `.parse()` method.
 */
export interface Schema<T> {
    parse(data: unknown): T;
}
/**
 * Provider interface for LLM-based scoring.
 * Implementations must accept a prompt and a schema,
 * and return a validated, typed result.
 *
 * Retry logic should be handled internally by the provider.
 */
export interface LlmProvider {
    generateStructured<T>(prompt: string, schema: Schema<T>): Promise<T>;
}
//# sourceMappingURL=types.d.ts.map