import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * Parse a generic JSON session log file into an AgentSession.
 * Supports a flexible schema to work with any agent framework.
 */
export async function parseGenericSession(filePath) {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return normalizeGenericSession(data);
}
/**
 * Parse all JSON session files from a directory.
 */
export async function parseGenericDirectory(dirPath) {
    const files = await readdir(dirPath);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const sessions = [];
    for (const file of jsonFiles) {
        try {
            const session = await parseGenericSession(join(dirPath, file));
            sessions.push(session);
        }
        catch {
            // Skip files that can't be parsed
        }
    }
    return sessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}
/**
 * Normalize a generic session JSON object.
 * Tries multiple common field names for flexibility.
 */
function normalizeGenericSession(data) {
    const prompt = data.prompt ||
        data.system_prompt ||
        data.instructions ||
        data.task ||
        data.input ||
        '';
    const rawActions = data.tool_calls ||
        data.actions ||
        data.steps ||
        data.events ||
        [];
    const actions = rawActions.map((action) => {
        const a = action;
        return {
            tool: a.tool || a.name || a.function || a.type || 'unknown',
            params: a.params ||
                a.arguments ||
                a.input ||
                a.parameters ||
                {},
            result: a.result ?? a.output ?? a.response ?? undefined,
            timestamp: a.timestamp ||
                a.created_at ||
                a.time ||
                new Date().toISOString(),
        };
    });
    const report = data.report ||
        data.response ||
        data.summary ||
        data.output ||
        data.result ||
        '';
    const framework = data.framework ||
        detectFramework(data) ||
        'custom';
    return {
        id: data.id || data.session_id || crypto.randomUUID(),
        prompt,
        actions,
        report,
        startedAt: data.started_at ||
            data.created_at ||
            data.timestamp ||
            data.start ||
            new Date().toISOString(),
        endedAt: data.ended_at ||
            data.completed_at ||
            data.end ||
            undefined,
        framework,
        model: data.model || undefined,
    };
}
/**
 * Attempt to detect the framework from session data.
 */
function detectFramework(data) {
    const str = JSON.stringify(data).toLowerCase();
    if (str.includes('openclaw') || str.includes('open_claw'))
        return 'openclaw';
    if (str.includes('langchain') || str.includes('lang_chain'))
        return 'langchain';
    if (str.includes('crewai') || str.includes('crew_ai'))
        return 'crewai';
    if (str.includes('claude-code') || str.includes('claude_code'))
        return 'claude-code';
    return null;
}
//# sourceMappingURL=generic.js.map