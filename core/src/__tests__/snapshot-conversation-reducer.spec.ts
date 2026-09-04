import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '../snapshot';
import { applyConversationEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-conversation-reducer';

describe('snapshot conversation reducer', () => {
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
});
