import { describe, it, expect } from 'vitest';
import { parsePrompt } from '../../src/parser/prompt.js';

describe('parsePrompt', () => {
  it('should extract imperative instructions', () => {
    const { instructions } = parsePrompt(
      'Search for competitor pricing. Send an email to the team. Create a report.',
    );
    expect(instructions).toHaveLength(3);
    expect(instructions[0].verb).toBe('search');
    expect(instructions[1].verb).toBe('send');
    expect(instructions[2].verb).toBe('create');
  });

  it('should extract constraints', () => {
    const { constraints } = parsePrompt(
      "Don't delete any files. Only use the production database. Limit requests to 10 per minute.",
    );
    expect(constraints).toHaveLength(3);
    expect(constraints[0].type).toBe('dont');
    expect(constraints[1].type).toBe('only');
    expect(constraints[2].type).toBe('limit');
  });

  it('should handle mixed instructions and constraints', () => {
    const { instructions, constraints } = parsePrompt(
      "Search for data. Update the records. Don't modify the config file.",
    );
    expect(instructions.length).toBeGreaterThanOrEqual(2);
    expect(constraints.length).toBeGreaterThanOrEqual(1);
  });

  it('should extract entities from instructions', () => {
    const { instructions } = parsePrompt('Send an email to john@company.com');
    expect(instructions[0].entities).toContain('john@company.com');
  });

  it('should handle bullet point lists', () => {
    const { instructions } = parsePrompt(
      '- Search for pricing data\n- Send results to team\n- Create summary report',
    );
    expect(instructions.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle numbered lists', () => {
    const { instructions } = parsePrompt(
      '1. Search for data\n2. Update the database\n3. Send a notification',
    );
    expect(instructions.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle "please" prefix', () => {
    const { instructions } = parsePrompt('Please send the report to the team');
    expect(instructions).toHaveLength(1);
    expect(instructions[0].verb).toBe('send');
  });

  it('should return empty arrays for non-imperative text', () => {
    const { instructions, constraints } = parsePrompt(
      'The weather is nice today. I like coding.',
    );
    expect(instructions).toHaveLength(0);
    expect(constraints).toHaveLength(0);
  });
});
