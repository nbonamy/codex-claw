import { describe, expect, it, vi } from 'vitest';
import { sendAgentPrompt } from '../agent-chat-service';
import { applyMainEventToSnapshot, createInitialSnapshot } from '../../shared/snapshot';
import type { CodexAgentSessionManager } from '../codex/agent-session';
import type { MainToRendererEvent } from '../../shared/contracts';

describe('agent chat service', () => {
  it('queues a prompt immediately and records the returned thread id later', async () => {
    const snapshot = createInitialSnapshot();
    const completion = deferred<{ threadId: string; turnId: string }>();
    const sessionManager = {
      sendPrompt: vi.fn().mockReturnValue(completion.promise),
    } as unknown as CodexAgentSessionManager;
    const events: MainToRendererEvent[] = [];

    const result = sendAgentPrompt(snapshot, sessionManager, 'agent-dina', ' hello ', undefined, (event) => {
      const fullEvent = {
        ...event,
        seq: events.length + 1,
        occurredAt: '2026-06-05T00:00:01.000Z',
      };
      events.push(fullEvent);
      applyMainEventToSnapshot(snapshot, fullEvent);
    });

    expect(result).toBe(snapshot);
    expect(sessionManager.sendPrompt).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-dina',
      folder: '~/src/codex-claw',
    }), 'hello');
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'starting' });
    expect(events.map((event) => event.payload)).toStrictEqual([
      { type: 'starting' },
      { status: 'starting', detail: 'Starting Codex app-server...' },
    ]);

    completion.resolve({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].codexThreadId).toBe('thread-1');
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(events.map((event) => event.payload)).toStrictEqual([
      { type: 'starting' },
      { status: 'starting', detail: 'Starting Codex app-server...' },
      { type: 'working' },
      { status: 'running', detail: 'Codex app-server connected.' },
    ]);
  });

  it('records visible app-server errors without throwing through IPC', async () => {
    const snapshot = createInitialSnapshot();
    const completion = deferred<{ threadId: string; turnId: string }>();
    const sessionManager = {
      sendPrompt: vi.fn().mockReturnValue(completion.promise),
    } as unknown as CodexAgentSessionManager;
    const events: MainToRendererEvent[] = [];

    sendAgentPrompt(snapshot, sessionManager, 'agent-dina', 'hello', undefined, (event) => {
      const fullEvent = {
        ...event,
        seq: events.length + 1,
        occurredAt: '2026-06-05T00:00:01.000Z',
      };
      events.push(fullEvent);
      applyMainEventToSnapshot(snapshot, fullEvent);
    });

    completion.reject(new Error('not authenticated'));
    await flushMicrotasks();

    expect(snapshot.appServer).toStrictEqual({ status: 'error', detail: 'not authenticated' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'not authenticated' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'not authenticated' }]);
  });

  it('ignores blank prompts, missing agents, and busy agents', () => {
    const snapshot = createInitialSnapshot();
    const sessionManager = {
      sendPrompt: vi.fn(),
    } as unknown as CodexAgentSessionManager;

    sendAgentPrompt(snapshot, sessionManager, 'agent-dina', '   ', undefined, vi.fn());
    sendAgentPrompt(snapshot, sessionManager, 'missing-agent', 'hello', undefined, vi.fn());
    snapshot.agents[0].status = { type: 'working' };
    sendAgentPrompt(snapshot, sessionManager, 'agent-dina', 'hello', undefined, vi.fn());

    expect(sessionManager.sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.messages).toHaveLength(0);
  });

  it('passes selected model and reasoning effort to the session manager', () => {
    const snapshot = createInitialSnapshot();
    const sessionManager = {
      sendPrompt: vi.fn().mockResolvedValue({ threadId: 'thread-1', turnId: 'turn-1' }),
    } as unknown as CodexAgentSessionManager;

    sendAgentPrompt(
      snapshot,
      sessionManager,
      'agent-dina',
      'hello',
      { model: 'gpt-5.1-codex', reasoningEffort: 'high' },
      vi.fn(),
    );

    expect(sessionManager.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      'hello',
      { model: 'gpt-5.1-codex', reasoningEffort: 'high' },
    );
  });

  it('passes selected prompt skills to the session manager', () => {
    const snapshot = createInitialSnapshot();
    const sessionManager = {
      sendPrompt: vi.fn().mockResolvedValue({ threadId: 'thread-1', turnId: 'turn-1' }),
    } as unknown as CodexAgentSessionManager;

    sendAgentPrompt(
      snapshot,
      sessionManager,
      'agent-dina',
      '/frontend-design polish the composer',
      {
        skills: [
          {
            name: 'frontend-design',
            path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
          },
        ],
      },
      vi.fn(),
    );

    expect(sessionManager.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      '/frontend-design polish the composer',
      {
        skills: [
          {
            name: 'frontend-design',
            path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
          },
        ],
      },
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
