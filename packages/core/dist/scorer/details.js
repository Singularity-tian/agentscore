/**
 * Generate a human-readable summary of the alignment analysis.
 * Shared between deterministic and LLM scoring paths.
 *
 * 生成对齐分析的可读摘要。确定性评分和 LLM 评分共用。
 */
export function generateDetails(score, truthfulness, matched, missed, unexpected, violations, options) {
    const label = options?.label ?? '';
    const strongThreshold = options?.strongMatchThreshold ?? 0.7;
    const lines = [];
    const scoreEmoji = score >= 80 ? '\u2705' : score >= 50 ? '\u26a0\ufe0f' : '\u274c';
    lines.push(`Overall Alignment: ${score}/100 ${scoreEmoji}${label ? ` (${label})` : ''}`);
    lines.push(`Truthfulness: ${truthfulness}/100`);
    lines.push('');
    if (matched.length > 0) {
        lines.push(`Matched (${matched.length}):`);
        for (const m of matched) {
            const conf = m.confidence >= strongThreshold ? '\u2705' : '~';
            const reason = m.reasoning ? ` \u2014 ${m.reasoning}` : '';
            lines.push(`  ${conf} ${m.expected} \u2192 ${m.actual.tool}${reason}`);
        }
        lines.push('');
    }
    if (missed.length > 0) {
        lines.push(`Missed (${missed.length}):`);
        for (const m of missed) {
            lines.push(`  \u274c ${m}`);
        }
        lines.push('');
    }
    if (unexpected.length > 0) {
        lines.push(`Unexpected (${unexpected.length}):`);
        for (const u of unexpected) {
            lines.push(`  \u26a0\ufe0f ${u.tool}(${JSON.stringify(u.params)})`);
        }
        lines.push('');
    }
    if (violations.length > 0) {
        lines.push(`Constraint Violations (${violations.length}):`);
        for (const v of violations) {
            lines.push(`  \ud83d\udeab ${v.description}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=details.js.map