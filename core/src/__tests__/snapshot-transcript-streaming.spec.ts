import { describe, expect, it } from 'vitest';
import { selectAgent } from '../agent-manager';
import {
  appendUserPrompt,
  createInitialSnapshot,
} from '../snapshot';
import { applyConversationEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-conversation-reducer';
import type { MainToRendererEvent, RendererMessage } from '../contracts';
import {
  commandToolPart,
  toolPartPayload,
} from './snapshot-test-fixtures';

describe('snapshot reducer', () => {

  it('starts a turn even when a legacy boundary supplies a malformed payload', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      turnId: 'turn-legacy',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-legacy',
      status: 'streaming',
      turnId: 'turn-legacy',
    });
  });

  it('appends user prompts and reduces assistant deltas into one streaming message', () => {
    const snapshot = createInitialSnapshot();

    appendUserPrompt(snapshot, 'agent-dina', 'hello', '2026-06-05T00:00:01.000Z');
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.started',
      payload: { status: 'inProgress', startedAt: '2026-06-05T00:00:00.000Z' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-1',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      createdAt: '2026-06-05T00:00:02.000Z',
      parts: [],
    });
    const messages = snapshot.messages;
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'hello', itemId: 'commentary-1', phase: 'commentary' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    expect(snapshot.messages).toBe(messages);
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: ' back', itemId: 'commentary-1', phase: 'commentary' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(snapshot.messages.at(-2)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-1',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      parts: [{ type: 'text', text: 'hello back', itemId: 'commentary-1', phase: 'commentary' }],
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });
    expect(snapshot.messages.at(-1)?.status).toBe('complete');
  });

  it('inserts steer prompts at the streaming point and resumes assistant output in a new segment', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.started',
      payload: { status: 'inProgress', startedAt: '2026-06-05T00:00:00.000Z' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-before', delta: 'I will inventory the Markdown files.' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.steer',
      payload: {
        prompt: 'read all the markdown files',
        attachments: [{ type: 'file', path: '/tmp/context.md', name: 'context.md' }],
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-after', delta: 'Reading them now.' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: expect.any(String),
        parts: [
          { type: 'text', text: 'I will inventory the Markdown files.', itemId: 'msg-before' },
        ],
      },
      {
        id: 'steer-turn-1-20260605t000003000z',
        agentId: 'agent-dina',
        kind: 'steer',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [
          { type: 'text', text: 'read all the markdown files' },
          {
            type: 'attachment',
            attachment: { kind: 'file', path: '/tmp/context.md', name: 'context.md' },
          },
        ],
      },
      {
        id: 'assistant-turn-1-segment-20260605t000003000z',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [
          { type: 'text', text: 'Reading them now.', itemId: 'msg-after' },
        ],
      },
    ]);

    applyMainEventToSnapshot(snapshot, {
      seq: 5,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages.filter((message) => message.role === 'assistant').map((message) => message.status)).toStrictEqual([
      'complete',
      'complete',
    ]);
  });

  it('applies a repeated steer event idempotently after a response snapshot already contains it', () => {
    const snapshot = createInitialSnapshot();
    const event = {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.steer' as const,
      payload: { prompt: 'edited queued prompt' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    };

    applyMainEventToSnapshot(snapshot, event);
    applyMainEventToSnapshot(snapshot, event);

    expect(snapshot.messages.filter((message) => message.kind === 'steer')).toEqual([
      expect.objectContaining({
        id: 'steer-turn-1-20260605t000003000z',
        parts: [{ type: 'text', text: 'edited queued prompt' }],
      }),
    ]);
    expect(snapshot.messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
  });

  it('keeps agent selection and streamed chats isolated per agent', () => {
    const snapshot = createInitialSnapshot();

    selectAgent(snapshot, 'agent-jesse');
    appendUserPrompt(snapshot, 'agent-dina', 'Dina prompt', '2026-06-05T00:00:01.000Z');
    appendUserPrompt(snapshot, 'agent-jesse', 'Jesse prompt', '2026-06-05T00:00:02.000Z');
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-dina',
      type: 'message.delta',
      payload: { delta: 'Dina answer' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-jesse',
      threadId: 'thread-jesse',
      turnId: 'turn-jesse',
      type: 'message.delta',
      payload: { delta: 'Jesse answer' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.activeAgentId).toBe('agent-jesse');
    expect(snapshot.messages.filter((message) => message.agentId === 'agent-dina').map((message) => message.parts)).toStrictEqual([
      [{ type: 'text', text: 'Dina prompt' }],
      [{ type: 'text', text: 'Dina answer' }],
    ]);
    expect(snapshot.messages.filter((message) => message.agentId === 'agent-jesse').map((message) => message.parts)).toStrictEqual([
      [{ type: 'text', text: 'Jesse prompt' }],
      [{ type: 'text', text: 'Jesse answer' }],
    ]);
  });

  it('adds a submitted user message once when the authoritative snapshot already contains it', () => {
    const snapshot = createInitialSnapshot();
    const message = appendUserPrompt(snapshot, 'agent-dina', 'run next', '2026-06-05T00:00:03.000Z');
    const event = {
      seq: 1,
      agentId: 'agent-dina',
      type: 'message.userSubmitted' as const,
      payload: { message },
      occurredAt: message.createdAt,
    };

    applyMainEventToSnapshot(snapshot, event);
    expect(snapshot.messages).toStrictEqual([message]);

    const replica = createInitialSnapshot();
    applyMainEventToSnapshot(replica, event);
    expect(replica.messages).toStrictEqual([message]);
  });

  it('removes empty assistant placeholders when turns complete without visible output', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.started',
      payload: { status: 'inProgress', startedAt: '2026-06-05T00:00:00.000Z' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toStrictEqual([]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });
  });

  it('removes superseded empty assistant placeholders when later assistant output appears', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.started',
      payload: { status: 'inProgress', startedAt: '2026-06-05T00:00:00.000Z' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual(['assistant-turn-empty']);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'message.delta',
      payload: { itemId: 'review-result', delta: 'Found one issue.' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-review',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-review',
        createdAt: expect.any(String),
        parts: [{ type: 'text', text: 'Found one issue.', itemId: 'review-result' }],
      },
    ]);
  });

  it('does not resurrect completed review text as streaming when late text arrives', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'message.delta',
      payload: {
        itemId: 'review-1',
        delta: 'Found one issue.',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'message.delta',
      payload: {
        itemId: 'review-assistant',
        delta: 'Late assistant copy.',
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-review',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-review',
        createdAt: expect.any(String),
        parts: [
          { type: 'text', text: 'Found one issue.', itemId: 'review-1' },
          { type: 'text', text: 'Late assistant copy.', itemId: 'review-assistant' },
        ],
      },
    ]);
  });

  it('keeps separate assistant message items as separate text parts', () => {
    const snapshot = createInitialSnapshot();

    for (const event of [
      {
        seq: 1,
        itemId: 'msg-1',
        delta: 'First assistant item.',
      },
      {
        seq: 2,
        itemId: 'msg-1',
        delta: ' More.',
      },
      {
        seq: 3,
        itemId: 'msg-2',
        delta: 'Second assistant item.',
      },
    ]) {
      applyMainEventToSnapshot(snapshot, {
        seq: event.seq,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'message.delta',
        payload: {
          itemId: event.itemId,
          delta: event.delta,
        },
        occurredAt: '2026-06-05T00:00:01.000Z',
      });
    }

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      { type: 'text', text: 'First assistant item. More.', itemId: 'msg-1' },
      { type: 'text', text: 'Second assistant item.', itemId: 'msg-2' },
    ]);
  });
});
