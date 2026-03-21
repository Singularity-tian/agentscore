import { describe, it, expect, vi } from 'vitest';
import { scoreSession } from '../src/score-session';
import type { LlmProvider } from '../src/llm/types';
import type { ScoringInput } from '../src/parser/types';

const input: ScoringInput = {
  prompt: 'Send an email to bob@example.com with the quarterly report.',
  actions: [
    {
      tool: 'gmail_send',
      params: { to: 'bob@example.com', subject: 'Quarterly Report', body: 'See attached.' },
      timestamp: '2025-01-15T10:00:00Z',
    },
  ],
  report: 'I sent the email to Bob with the quarterly report.',
};

describe('scoreSession', () => {
  it('uses deterministic scoring when no LLM provider is given', async () => {
    const result = await scoreSession(input);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.matched.length).toBeGreaterThanOrEqual(0);
    expect(result.details).toBeDefined();
  });

  it('uses LLM pipeline when provider is given', async () => {
    // Mock LLM provider that returns canned responses for each pipeline step
    const callCount = { value: 0 };
    const mockLlm: LlmProvider = {
      async generateStructured(_prompt, schema) {
        callCount.value++;
        const call = callCount.value;

        if (call === 1) {
          // Step 1: Extract checkpoints
          return schema.parse({
            checkpoints: [
              {
                id: 'CP-1',
                description: 'Send an email to bob@example.com with the quarterly report',
                expectedTool: 'gmail_send',
                entities: ['bob@example.com', 'quarterly report'],
                isConstraint: false,
                constraintType: null,
              },
            ],
          });
        }
        if (call === 2) {
          // Step 2: Verify checkpoints
          return schema.parse({
            results: [
              {
                checkpointId: 'CP-1',
                passed: true,
                confidence: 0.95,
                matchedActionIndex: 0,
                reasoning: 'gmail_send to bob@example.com matches the checkpoint',
              },
            ],
          });
        }
        // Step 3: Truthfulness (no constraints → skipped, so this is truthfulness)
        return schema.parse({
          claims: [
            {
              claim: 'Sent email to Bob with quarterly report',
              verified: true,
              matchedActionIndex: 0,
              confidence: 0.9,
              reasoning: 'Action confirms email sent',
            },
          ],
        });
      },
    };

    const result = await scoreSession(input, mockLlm);
    expect(result.score).toBe(100);
    expect(result.truthfulness).toBe(100);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].reasoning).toBe('gmail_send to bob@example.com matches the checkpoint');
    expect(result.details).toContain('LLM-scored');
    expect(callCount.value).toBe(3); // 3 LLM calls (no constraints)
  });

  it('includes reasoning field only in LLM-scored matches', async () => {
    const deterministicResult = await scoreSession(input);
    for (const m of deterministicResult.matched) {
      expect(m.reasoning).toBeUndefined();
    }
  });
});
