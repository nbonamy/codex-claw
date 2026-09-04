import { describe, expect, it } from 'vitest';
import { updateAgentFolder } from '../agent-manager';
import {
  applyMainEventToSnapshot,
  createInitialSnapshot,
} from '../snapshot';

describe('snapshot reducer', () => {

  it('handles reducer fallback and error events without Codex protocol leaking into UI state', () => {
    const snapshot = createInitialSnapshot();

    expect(updateAgentFolder(snapshot, 'missing-agent', '/tmp/nope')).toBeNull();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'message.delta',
      payload: { delta: 'ignored without agent' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-with-empty-delta',
      type: 'message.delta',
      payload: { delta: 123 },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'error',
      payload: {},
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Backend error' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'Backend error' }]);
  });

  it('keeps retryable connection errors transient until the retry sequence fails', () => {
    const snapshot = createInitialSnapshot();
    const agentId = snapshot.agents[0].id;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      applyMainEventToSnapshot(snapshot, {
        seq: attempt,
        agentId,
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'error',
        payload: {
          message: `Reconnecting… ${attempt}/5`,
          willRetry: true,
          error: { message: `Reconnecting… ${attempt}/5` },
        },
        occurredAt: `2026-06-05T00:00:0${attempt}.000Z`,
      });
    }

    expect(snapshot.messages).toStrictEqual([]);
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'working',
      detail: 'Reconnecting… 5/5',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 6,
      agentId,
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'error',
      payload: {
        message: 'Connection failed',
        willRetry: false,
        error: { message: 'Connection failed' },
      },
      occurredAt: '2026-06-05T00:00:06.000Z',
    });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]?.parts).toStrictEqual([{ type: 'status', text: 'Connection failed' }]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Connection failed' });
  });

  it('clears subagents when the agent starts a different root conversation', () => {
    const snapshot = createInitialSnapshot();
    const agentId = snapshot.agents[0].id;
    snapshot.subagentTrees[agentId] = {
      rootConversationId: 'thread-old',
      nodes: {},
      operations: {},
      activities: {},
    };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId,
      backend: 'codex',
      threadId: 'thread-new',
      type: 'thread.started',
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.subagentTrees[agentId]).toBeUndefined();
  });
});
