import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * Parse OpenClaw session logs from a directory into an AgentSession.
 * OpenClaw stores session data as JSON files in ~/.openclaw/ or a workspace.
 */
export async function parseOpenClawSession(sessionPath) {
    const content = await readFile(sessionPath, 'utf-8');
    const data = JSON.parse(content);
    return normalizeOpenClawSession(data);
}
/**
 * Parse all OpenClaw sessions from a directory.
 */
export async function parseOpenClawDirectory(dirPath) {
    const files = await readdir(dirPath);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const sessions = [];
    for (const file of jsonFiles) {
        try {
            const session = await parseOpenClawSession(join(dirPath, file));
            sessions.push(session);
        }
        catch {
            // Skip files that can't be parsed
        }
    }
    return sessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}
/**
 * Normalize an OpenClaw session JSON object into our standard format.
 * Handles various OpenClaw log formats.
 */
function normalizeOpenClawSession(data) {
    // Extract prompt from various possible fields
    const prompt = data.prompt ||
        data.system_prompt ||
        data.instructions ||
        data.task ||
        '';
    // Extract actions / tool calls
    const rawActions = data.tool_calls ||
        data.actions ||
        data.steps ||
        [];
    const actions = rawActions.map((action) => {
        const a = action;
        return {
            tool: a.tool || a.name || a.function || 'unknown',
            params: a.params ||
                a.arguments ||
                a.input ||
                {},
            result: a.result ?? a.output ?? a.response ?? undefined,
            timestamp: a.timestamp ||
                a.created_at ||
                new Date().toISOString(),
        };
    });
    // Extract report (agent's summary of what it did)
    const report = data.report ||
        data.response ||
        data.summary ||
        data.output ||
        '';
    return {
        id: data.id || data.session_id || crypto.randomUUID(),
        prompt,
        actions,
        report,
        startedAt: data.started_at ||
            data.created_at ||
            data.timestamp ||
            new Date().toISOString(),
        endedAt: data.ended_at || data.completed_at || undefined,
        framework: 'openclaw',
        model: data.model || undefined,
    };
}
//# sourceMappingURL=openclaw.js.map