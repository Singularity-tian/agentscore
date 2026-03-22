import { createHash } from 'node:crypto';
/**
 * Compute a SHA-256 fingerprint of an agent session's behavioral pattern.
 * Used for drift detection — comparing behavioral patterns over time.
 */
export function sessionFingerprint(actions) {
    // Create a normalized representation of the behavioral pattern
    // We use tool names and their order, ignoring specific params/timestamps
    const pattern = actions
        .map((a) => a.tool)
        .join('|');
    return createHash('sha256').update(pattern).digest('hex');
}
/**
 * Compute a SHA-256 hash of a string (e.g., prompt text).
 */
export function hashString(input) {
    return createHash('sha256').update(input).digest('hex');
}
/**
 * Compute a behavioral pattern hash that captures tool usage frequencies
 * and common sequences (more resilient to minor reorderings).
 */
export function behaviorHash(actions) {
    const toolCounts = new Map();
    const toolPairs = new Map();
    for (let i = 0; i < actions.length; i++) {
        const tool = actions[i].tool;
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
        if (i < actions.length - 1) {
            const pair = `${tool}->${actions[i + 1].tool}`;
            toolPairs.set(pair, (toolPairs.get(pair) || 0) + 1);
        }
    }
    // Sort for deterministic output
    const countsStr = [...toolCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tool, count]) => `${tool}:${count}`)
        .join(',');
    const pairsStr = [...toolPairs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pair, count]) => `${pair}:${count}`)
        .join(',');
    const pattern = `${countsStr}||${pairsStr}`;
    return createHash('sha256').update(pattern).digest('hex');
}
//# sourceMappingURL=hash.js.map