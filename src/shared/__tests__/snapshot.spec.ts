import { describe, expect, it } from 'vitest';
import {
  appendUserPrompt,
  applyMainEventToSnapshot,
  createInitialSnapshot,
  updateAgentFolder,
} from '../snapshot';

describe('snapshot reducer', () => {
  it('updates the agent folder and clears the old thread mapping', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].codexThreadId = 'thread-old';

    expect(updateAgentFolder(snapshot, 'agent-dina', '/Users/nbonamy/src/id8', '2026-06-05T00:00:01.000Z')).toStrictEqual({
      id: 'agent-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
  });

  it('appends user prompts and reduces assistant deltas into one streaming message', () => {
    const snapshot = createInitialSnapshot();

    appendUserPrompt(snapshot, 'agent-dina', 'hello', '2026-06-05T00:00:01.000Z');
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'hello' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: ' back' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(snapshot.messages.at(-2)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-1',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      parts: [{ type: 'text', text: 'hello back' }],
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });
    expect(snapshot.messages.at(-1)?.status).toBe('complete');
  });

  it('records thread starts and app-server status updates', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.started',
      payload: { cwd: '/Users/nbonamy/src/codex-claw' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'appServer.statusChanged',
      payload: { status: 'running', detail: 'connected' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].codexThreadId).toBe('thread-1');
    expect(snapshot.appServer).toStrictEqual({ status: 'running', detail: 'connected' });
  });

  it('handles reducer fallback and error events without Codex protocol leaking into UI state', () => {
    const snapshot = createInitialSnapshot();

    expect(updateAgentFolder(snapshot, 'missing-agent', '/tmp/nope')).toBeNull();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'message.delta',
      payload: { delta: 'ignored without agent' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    expect(snapshot.messages).toHaveLength(1);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-with-empty-delta',
      type: 'message.delta',
      payload: { delta: 123 },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'text', text: '' }]);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'error',
      payload: {},
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Codex app-server error' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'Codex app-server error' }]);
  });
});
