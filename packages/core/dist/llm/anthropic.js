const DEFAULTS = {
    model: 'claude-sonnet-4-6',
    temperature: 0.1,
    maxTokens: 2048,
    maxAttempts: 3,
};
/**
 * Create an LlmProvider backed by the standard Anthropic SDK.
 *
 * Requires `@anthropic-ai/sdk` to be installed (optional peer dependency).
 * Uses `ANTHROPIC_API_KEY` env var by default.
 */
export function createAnthropicProvider(options) {
    const resolvedKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    const model = options?.model ?? DEFAULTS.model;
    const temperature = options?.temperature ?? DEFAULTS.temperature;
    const maxTokens = options?.maxTokens ?? DEFAULTS.maxTokens;
    const maxAttempts = options?.maxAttempts ?? DEFAULTS.maxAttempts;
    if (!resolvedKey) {
        throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY or pass apiKey option.');
    }
    const apiKey = resolvedKey;
    // Lazy-load the SDK to avoid hard dependency
    let clientPromise = null;
    async function getClient() {
        if (!clientPromise) {
            // @ts-expect-error — optional peer dependency, may not be installed
            clientPromise = import('@anthropic-ai/sdk').then((mod) => new mod.default({ apiKey }));
        }
        return clientPromise;
    }
    return {
        async generateStructured(prompt, schema) {
            const client = await getClient();
            let lastError;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const response = await client.messages.create({
                        model,
                        max_tokens: maxTokens,
                        temperature,
                        messages: [{ role: 'user', content: prompt }],
                    });
                    const text = response.content
                        .filter((block) => block.type === 'text')
                        .map((block) => block.text ?? '')
                        .join('');
                    const cleaned = text
                        .replace(/^```(?:json)?\s*\n?/m, '')
                        .replace(/\n?```\s*$/m, '')
                        .trim();
                    const parsed = JSON.parse(cleaned);
                    return schema.parse(parsed);
                }
                catch (err) {
                    lastError = err;
                    if (attempt < maxAttempts) {
                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
                        await new Promise((resolve) => setTimeout(resolve, delay));
                    }
                }
            }
            throw lastError;
        },
    };
}
//# sourceMappingURL=anthropic.js.map