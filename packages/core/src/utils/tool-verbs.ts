/**
 * Maps common tool names to natural language action verbs.
 * Used for matching prompt instructions to actual tool calls.
 */
export const TOOL_VERB_MAP: Record<string, string[]> = {
  // Email
  'gmail_send': ['send email', 'email', 'mail', 'send message'],
  'gmail_read': ['read email', 'check email', 'check inbox'],
  'email_send': ['send email', 'email', 'mail'],
  'send_email': ['send email', 'email', 'mail'],

  // Search
  'web_search': ['search', 'look up', 'find', 'research', 'google'],
  'tavily_search': ['search', 'look up', 'find', 'research'],
  'google_search': ['search', 'look up', 'find', 'google'],
  'bing_search': ['search', 'look up', 'find'],

  // Files
  'file_write': ['write file', 'create file', 'save', 'generate document', 'write'],
  'file_read': ['read file', 'open file', 'check file', 'review'],
  'file_delete': ['delete file', 'remove file', 'delete'],
  'create_file': ['create file', 'write file', 'save'],
  'read_file': ['read file', 'open file', 'check file'],

  // Messaging
  'slack_post': ['post to slack', 'message slack', 'send to channel', 'slack'],
  'slack_send': ['post to slack', 'message slack', 'send to channel', 'slack'],
  'discord_send': ['send discord', 'post discord', 'message discord'],

  // Code
  'shell_exec': ['run command', 'execute', 'run script', 'run'],
  'run_command': ['run command', 'execute', 'run script'],
  'git_commit': ['commit', 'save changes', 'push code'],
  'git_push': ['push', 'push code', 'deploy'],

  // Browser
  'browser_navigate': ['visit', 'go to', 'open page', 'navigate', 'browse'],
  'browser_click': ['click', 'press', 'select'],
  'navigate': ['visit', 'go to', 'open page', 'navigate'],

  // Database
  'db_query': ['query', 'fetch data', 'look up records', 'query database'],
  'db_insert': ['insert', 'add record', 'save to database'],
  'db_update': ['update record', 'modify', 'change', 'update database'],
  'db_delete': ['delete record', 'remove from database'],

  // Spreadsheets
  'sheets_update': ['update spreadsheet', 'edit sheet', 'modify spreadsheet'],
  'sheets_read': ['read spreadsheet', 'get data from sheet'],

  // Calendar
  'calendar_create': ['create event', 'schedule', 'add to calendar'],
  'calendar_read': ['check calendar', 'read calendar', 'get events'],

  // API
  'api_call': ['call api', 'make request', 'fetch'],
  'http_request': ['make request', 'call api', 'fetch', 'http'],
};

/**
 * Look up natural language verbs for a given tool name.
 * Falls back to splitting the tool name on underscores/camelCase.
 */
export function getToolVerbs(toolName: string): string[] {
  const normalized = toolName.toLowerCase().trim();
  if (TOOL_VERB_MAP[normalized]) {
    return TOOL_VERB_MAP[normalized];
  }
  // Fallback: split on underscores and camelCase
  const words = normalized
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
  return [words];
}

/**
 * Check if a tool name matches a natural language description.
 * Returns a confidence score (0-1).
 */
export function toolVerbMatch(toolName: string, description: string): number {
  const verbs = getToolVerbs(toolName);
  const descLower = description.toLowerCase();

  let bestScore = 0;
  for (const verb of verbs) {
    if (descLower.includes(verb)) {
      // Exact phrase match in the description
      bestScore = Math.max(bestScore, 0.9);
    } else {
      // Check individual words
      const verbWords = verb.split(' ');
      const matchedWords = verbWords.filter((w) => descLower.includes(w));
      const wordScore = matchedWords.length / verbWords.length;
      bestScore = Math.max(bestScore, wordScore * 0.7);
    }
  }

  return bestScore;
}
