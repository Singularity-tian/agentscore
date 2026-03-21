import type { PromptInstruction, Constraint } from './types.js';
import { extractEntities } from '../utils/entities.js';

/**
 * Patterns that indicate imperative instructions.
 * Matches sentences starting with action verbs.
 */
const IMPERATIVE_VERBS = [
  'send', 'search', 'find', 'create', 'write', 'read', 'update', 'delete',
  'remove', 'add', 'post', 'publish', 'check', 'review', 'analyze', 'run',
  'execute', 'deploy', 'build', 'install', 'configure', 'set', 'get',
  'fetch', 'download', 'upload', 'save', 'open', 'close', 'start', 'stop',
  'make', 'generate', 'compile', 'test', 'debug', 'fix', 'merge', 'push',
  'pull', 'commit', 'schedule', 'notify', 'alert', 'email', 'message',
  'forward', 'reply', 'cc', 'include', 'exclude', 'filter', 'sort',
  'summarize', 'report', 'log', 'monitor', 'track', 'backup', 'restore',
  'export', 'import', 'convert', 'transform', 'format', 'validate',
  'verify', 'confirm', 'approve', 'reject', 'accept', 'deny', 'grant',
  'list', 'show', 'display', 'print', 'output', 'copy', 'move', 'rename',
  'navigate', 'visit', 'browse', 'click', 'select', 'submit', 'enter',
  'type', 'fill', 'complete', 'process', 'handle', 'call', 'query',
  'look', 'put', 'use', 'apply', 'modify', 'change', 'edit', 'draft',
  'prepare', 'organize', 'clean', 'clear', 'reset', 'refresh', 'sync',
  'connect', 'disconnect', 'attach', 'detach', 'link', 'unlink',
];

/**
 * Patterns that indicate negative constraints.
 */
const CONSTRAINT_PATTERNS = {
  dont: /(?:don'?t|do not|never|avoid|refrain from)\s+(.+)/i,
  only: /(?:only|exclusively|solely|just)\s+(.+)/i,
  limit: /(?:limit|restrict|cap|maximum|at most|no more than)\s+(.+)/i,
};

/**
 * Parse a prompt into individual instructions and constraints.
 */
export function parsePrompt(prompt: string): {
  instructions: PromptInstruction[];
  constraints: Constraint[];
} {
  const instructions: PromptInstruction[] = [];
  const constraints: Constraint[] = [];

  // Split into sentences
  const sentences = splitIntoSentences(prompt);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed || trimmed.length < 3) continue;

    // Check for constraints first
    const constraint = parseConstraint(trimmed);
    if (constraint) {
      constraints.push(constraint);
      continue;
    }

    // Check for imperative instructions
    const instruction = parseInstruction(trimmed);
    if (instruction) {
      instructions.push(instruction);
    }
  }

  return { instructions, constraints };
}

/**
 * Split text into sentences, handling common edge cases.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries, bullet points, and numbered lists
  return text
    .split(/(?:\.\s+|[.!?]\s*$|\n+|(?:^|\n)\s*[-•*]\s+|(?:^|\n)\s*\d+[.)]\s+)/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Try to parse a sentence as a constraint.
 */
function parseConstraint(sentence: string): Constraint | null {
  for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS) as [
    Constraint['type'],
    RegExp,
  ][]) {
    const match = sentence.match(pattern);
    if (match) {
      return {
        text: sentence,
        type,
        target: match[1].trim(),
      };
    }
  }
  return null;
}

/**
 * Try to parse a sentence as an imperative instruction.
 */
function parseInstruction(sentence: string): PromptInstruction | null {
  const lowerSentence = sentence.toLowerCase().trim();

  // Check if starts with an imperative verb
  const firstWord = lowerSentence.split(/\s+/)[0];
  const isImperative = IMPERATIVE_VERBS.includes(firstWord);

  // Also match "please <verb>" and "then <verb>" patterns
  const secondWord = lowerSentence.split(/\s+/)[1];
  const isPoliteImperative =
    (firstWord === 'please' || firstWord === 'then' || firstWord === 'also' || firstWord === 'next') &&
    secondWord &&
    IMPERATIVE_VERBS.includes(secondWord);

  if (!isImperative && !isPoliteImperative) {
    return null;
  }

  const verb = isImperative ? firstWord : secondWord!;
  const entities = extractEntities(sentence);
  const entityList = [
    ...entities.emails,
    ...entities.urls,
    ...entities.filenames,
    ...entities.quotedStrings,
  ];

  return {
    text: sentence,
    verb,
    entities: entityList,
  };
}
