import { describe, expect, it } from 'vitest';
import {
  appendUserPrompt,
  createInitialSnapshot,
  selectAgent,
} from '../snapshot';
import { applyConversationEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-conversation-reducer';
import type { MainToRendererEvent, RendererMessage } from '../contracts';
import {
  commandToolPart,
  toolPartPayload,
} from './snapshot-test-fixtures';

describe('snapshot reducer', () => {

  it('ignores compaction events missing required turn context at a legacy boundary', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      type: 'context.compactionStarted',
      payload: { itemId: 'compact-1' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.messages).toStrictEqual([]);
  });

  it('inserts running compaction markers without showing empty assistant thinking after the boundary', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'Before compaction.' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'context.compactionStarted',
      payload: { itemId: 'compact-1' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'After compaction.' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: expect.any(String),
        parts: [{ type: 'text', text: 'Before compaction.' }],
      },
      {
        id: 'compaction-turn-1',
        agentId: 'agent-dina',
        kind: 'compaction',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [],
      },
      {
        id: 'assistant-turn-1-segment-20260605t000002000z',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [{ type: 'text', text: 'After compaction.' }],
      },
    ]);
  });

  it('marks compaction markers complete when the turn completes', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'context.compactionStarted',
      payload: { itemId: 'compact-1' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'compaction-turn-1',
        agentId: 'agent-dina',
        kind: 'compaction',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [],
      },
    ]);
  });

  it('marks only the matching compaction complete when completion arrives before turn completion', () => {
    const snapshot = createInitialSnapshot();
    for (const [seq, turnId] of [[1, 'turn-1'], [2, 'turn-2']] as const) {
      applyMainEventToSnapshot(snapshot, {
        seq,
        agentId: 'agent-dina',
        backend: 'codex',
        threadId: 'thread-1',
        turnId,
        type: 'context.compactionStarted',
        payload: { itemId: `compact-${turnId}` },
        occurredAt: `2026-06-05T00:00:0${seq}.000Z`,
      });
    }

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-2',
      type: 'context.compactionCompleted',
      payload: { itemId: 'compact-turn-2' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.filter((message) => message.kind === 'compaction').map((message) => ({
      turnId: message.turnId,
      status: message.status,
    }))).toStrictEqual([
      { turnId: 'turn-1', status: 'streaming' },
      { turnId: 'turn-2', status: 'complete' },
    ]);
  });
});
