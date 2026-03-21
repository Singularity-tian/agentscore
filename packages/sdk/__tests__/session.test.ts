import { describe, it, expect } from 'vitest';
import { AgentScoreSession } from '../src/session.js';
import type { AgentAction } from '@agentscore/core';

function makeAction(tool: string, params: Record<string, unknown> = {}): AgentAction {
  return { tool, params, timestamp: new Date().toISOString() };
}

describe('AgentScoreSession', () => {
  // -----------------------------------------------------------------------
  // startSession
  // -----------------------------------------------------------------------
  describe('startSession', () => {
    it('creates a session with a unique id and ISO startedAt', () => {
      const session = AgentScoreSession.startSession({ prompt: 'Do something.' });

      expect(session.sessionId).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(session.startedAt).toBeDefined();
      // Should be a parseable ISO date
      expect(Number.isNaN(Date.parse(session.startedAt))).toBe(false);
    });

    it('defaults label to "unnamed" when not provided', () => {
      const session = AgentScoreSession.startSession({ prompt: 'Hello.' });
      expect(session.label).toBe('unnamed');
    });

    it('respects explicit label, model, and metadata', () => {
      const session = AgentScoreSession.startSession({
        prompt: 'Send an email.',
        label: 'email-test',
        model: 'claude-sonnet-4-20250514',
        metadata: { user: 'test-user' },
      });

      expect(session.label).toBe('email-test');
      expect(session.model).toBe('claude-sonnet-4-20250514');
      expect(session.metadata).toEqual({ user: 'test-user' });
    });

    it('generates unique ids across multiple sessions', () => {
      const ids = new Set(
        Array.from({ length: 50 }, () =>
          AgentScoreSession.startSession({ prompt: '.' }).sessionId,
        ),
      );
      expect(ids.size).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // recordAction
  // -----------------------------------------------------------------------
  describe('recordAction', () => {
    it('increments actionCount', () => {
      const session = AgentScoreSession.startSession({ prompt: 'Search for docs.' });
      expect(session.actionCount).toBe(0);

      session.recordAction(makeAction('web_search', { query: 'docs' }));
      expect(session.actionCount).toBe(1);

      session.recordAction(makeAction('file_read', { path: '/tmp/a.txt' }));
      expect(session.actionCount).toBe(2);
    });

    it('throws after the session has ended', () => {
      const session = AgentScoreSession.startSession({ prompt: 'Hello.' });
      session.end();

      expect(() => session.recordAction(makeAction('oops'))).toThrowError(
        /already ended/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // end
  // -----------------------------------------------------------------------
  describe('end', () => {
    it('returns a SessionResult with a computed score', () => {
      const session = AgentScoreSession.startSession({
        prompt: 'Send an email to alice@example.com.',
      });
      session.recordAction(
        makeAction('gmail_send', { to: 'alice@example.com', body: 'Hi!' }),
      );

      const result = session.end('I sent an email to alice.');

      expect(result.sessionId).toBe(session.sessionId);
      expect(result.label).toBe('unnamed');
      expect(result.actions).toHaveLength(1);
      expect(result.score).toBeDefined();
      expect(typeof result.score.score).toBe('number');
      expect(result.score.score).toBeGreaterThanOrEqual(0);
      expect(result.score.score).toBeLessThanOrEqual(100);
      expect(result.startedAt).toBeDefined();
      expect(result.endedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('works with an empty report (truthfulness defaults to 100)', () => {
      const session = AgentScoreSession.startSession({
        prompt: 'Search the web.',
      });
      session.recordAction(makeAction('web_search', { q: 'test' }));

      const result = session.end();
      expect(result.score.truthfulness).toBe(100);
    });

    it('throws when called twice', () => {
      const session = AgentScoreSession.startSession({ prompt: '.' });
      session.end();
      expect(() => session.end()).toThrowError(/already ended/);
    });

    it('sets isEnded to true', () => {
      const session = AgentScoreSession.startSession({ prompt: '.' });
      expect(session.isEnded).toBe(false);
      session.end();
      expect(session.isEnded).toBe(true);
    });

    it('returns a copy of actions (not a live reference)', () => {
      const session = AgentScoreSession.startSession({ prompt: 'Do x.' });
      session.recordAction(makeAction('x'));
      const result = session.end();

      // Mutating the returned array should not affect the internal state.
      result.actions.push(makeAction('y'));
      expect(result.actions).toHaveLength(2); // mutated copy
    });

    it('computes missed instructions when no matching action exists', () => {
      const session = AgentScoreSession.startSession({
        prompt: 'Delete the old backups and send a report.',
      });
      // Record an action that matches neither instruction.
      session.recordAction(makeAction('ping', { host: 'localhost' }));

      const result = session.end();
      expect(result.score.missed.length).toBeGreaterThan(0);
    });
  });
});
