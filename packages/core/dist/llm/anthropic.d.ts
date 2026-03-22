import type { LlmProvider } from './types.js';
export interface AnthropicProviderOptions {
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    maxAttempts?: number;
}
/**
 * Create an LlmProvider backed by the standard Anthropic SDK.
 *
 * Requires `@anthropic-ai/sdk` to be installed (optional peer dependency).
 * Uses `ANTHROPIC_API_KEY` env var by default.
 */
export declare function createAnthropicProvider(options?: AnthropicProviderOptions): LlmProvider;
//# sourceMappingURL=anthropic.d.ts.map