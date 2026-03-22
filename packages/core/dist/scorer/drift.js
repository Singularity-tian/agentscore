import { behaviorHash } from '../utils/hash.js';
/**
 * Compare two sets of actions to detect behavioral drift.
 * Returns a drift report with the percentage deviation and specific changes.
 */
export function computeDrift(baseline, current) {
    const baselineHash = behaviorHash(baseline);
    const currentHash = behaviorHash(current);
    const changes = [];
    // Compare tool usage
    const baselineTools = countTools(baseline);
    const currentTools = countTools(current);
    // Detect added tools
    for (const [tool, count] of currentTools) {
        if (!baselineTools.has(tool)) {
            changes.push({
                type: 'added_tool',
                description: `New tool "${tool}" used ${count} time(s) (not in baseline)`,
                severity: 0.6,
            });
        }
    }
    // Detect removed tools
    for (const [tool] of baselineTools) {
        if (!currentTools.has(tool)) {
            changes.push({
                type: 'removed_tool',
                description: `Tool "${tool}" no longer used (was in baseline)`,
                severity: 0.4,
            });
        }
    }
    // Detect frequency changes
    for (const [tool, baseCount] of baselineTools) {
        const curCount = currentTools.get(tool);
        if (curCount !== undefined && curCount !== baseCount) {
            const ratio = Math.abs(curCount - baseCount) / Math.max(baseCount, curCount);
            if (ratio > 0.3) {
                changes.push({
                    type: 'frequency_change',
                    description: `Tool "${tool}" frequency changed: ${baseCount} → ${curCount}`,
                    severity: ratio * 0.5,
                });
            }
        }
    }
    // Detect order changes
    const baselineOrder = baseline.map((a) => a.tool);
    const currentOrder = current.map((a) => a.tool);
    const orderSimilarity = computeOrderSimilarity(baselineOrder, currentOrder);
    if (orderSimilarity < 0.7) {
        changes.push({
            type: 'order_change',
            description: `Tool call ordering changed significantly (${Math.round(orderSimilarity * 100)}% similarity)`,
            severity: (1 - orderSimilarity) * 0.5,
        });
    }
    // Compute overall drift percentage
    const driftPercentage = computeDriftPercentage(changes);
    return {
        currentHash,
        baselineHash,
        driftPercentage,
        changes,
    };
}
/**
 * Count tool usage frequencies.
 */
function countTools(actions) {
    const counts = new Map();
    for (const action of actions) {
        counts.set(action.tool, (counts.get(action.tool) || 0) + 1);
    }
    return counts;
}
/**
 * Compute order similarity using longest common subsequence ratio.
 */
function computeOrderSimilarity(a, b) {
    if (a.length === 0 && b.length === 0)
        return 1;
    if (a.length === 0 || b.length === 0)
        return 0;
    const lcsLength = lcs(a, b);
    return lcsLength / Math.max(a.length, b.length);
}
/**
 * Longest common subsequence length.
 */
function lcs(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
}
/**
 * Compute overall drift percentage from individual changes.
 */
function computeDriftPercentage(changes) {
    if (changes.length === 0)
        return 0;
    const totalSeverity = changes.reduce((sum, c) => sum + c.severity, 0);
    // Average severity scaled to 0-100, capped at 100
    return Math.min(Math.round((totalSeverity / changes.length) * 100), 100);
}
//# sourceMappingURL=drift.js.map