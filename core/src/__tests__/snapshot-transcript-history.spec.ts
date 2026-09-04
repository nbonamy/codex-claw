import { describe, expect, it } from 'vitest';
import {
  appendUserPrompt,
  applyMainEventToSnapshot,
  createInitialSnapshot,
  selectAgent,
} from '../snapshot';
import type { RendererMessage } from '../contracts';
import {
  commandToolPart,
  toolPartPayload,
} from './snapshot-test-fixtures';

describe('snapshot reducer', () => {

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
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });
    expect(snapshot.messages.at(-1)?.status).toBe('complete');
  });

  it('updates one message without replacing the progressively hydrated transcript', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages.push(
      {
        id: 'history-older', agentId: 'agent-dina', role: 'assistant', status: 'complete',
        createdAt: '2026-06-05T00:00:00.000Z', parts: [{ type: 'text', text: 'Older history' }],
      },
      {
        id: 'assistant-turn-1', agentId: 'agent-dina', role: 'assistant', status: 'streaming',
        turnId: 'turn-1', createdAt: '2026-06-05T00:00:01.000Z', parts: [{ type: 'text', text: 'Draft' }],
      },
    );
    const transcript = snapshot.messages;
    const olderMessage = snapshot.messages[0];

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.updated',
      payload: {
        message: {
          id: 'assistant-turn-1', agentId: 'agent-dina', role: 'assistant', status: 'streaming',
          turnId: 'turn-1', createdAt: '2026-06-05T00:00:01.000Z',
          parts: [
            {
              type: 'reasoning', summary: 'Checked the relevant state',
              itemId: 'reasoning-1', summaryIndex: 0,
            },
            {
              type: 'text', text: 'Rewritten response',
              itemId: 'answer-1', phase: 'final_answer',
            },
          ],
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.messages).toBe(transcript);
    expect(snapshot.messages[0]).toBe(olderMessage);
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[1]).toMatchObject({
      id: 'assistant-turn-1',
      parts: [
        {
          type: 'reasoning', summary: 'Checked the relevant state',
          itemId: 'reasoning-1', summaryIndex: 0,
        },
        {
          type: 'text', text: 'Rewritten response',
          itemId: 'answer-1', phase: 'final_answer',
        },
      ],
    });
  });

  it('retains every message when progressive batches split one turn', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages.push({
      id: 'current', agentId: 'agent-dina', role: 'assistant', status: 'complete',
      turnId: 'turn-current', createdAt: '2026-06-05T00:00:05.000Z',
      parts: [{ type: 'text', text: 'Current history' }],
    });
    const transcript = snapshot.messages;
    const historyMessage = (id: string, createdAt: string): RendererMessage => ({
      id, agentId: 'agent-dina', role: 'assistant', status: 'complete',
      turnId: 'turn-split', createdAt, parts: [{ type: 'text', text: id }],
    });

    for (const [seq, messages] of [
      [1, [historyMessage('split-3', '2026-06-05T00:00:03.000Z'), historyMessage('split-4', '2026-06-05T00:00:04.000Z')]],
      [2, [historyMessage('split-1', '2026-06-05T00:00:01.000Z'), historyMessage('split-2', '2026-06-05T00:00:02.000Z')]],
    ] as const) {
      applyMainEventToSnapshot(snapshot, {
        seq,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'thread.historyLoaded',
        payload: { messages, preserveKnownMessages: true, replace: false },
        occurredAt: '2026-06-05T00:00:06.000Z',
      });
    }

    expect(snapshot.messages).toBe(transcript);
    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'split-1', 'split-2', 'split-3', 'split-4', 'current',
    ]);
  });

  it('never lets an older history page evict the genuine conversation tail', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages.push({
      id: 'genuine-tail', agentId: 'agent-dina', role: 'assistant', status: 'complete',
      turnId: 'turn-tail', createdAt: '2026-06-05T00:00:05.000Z',
      parts: [{ type: 'text', text: 'Actual latest response' }],
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        direction: 'older',
        evictedTurnIds: ['turn-tail'],
        preserveKnownMessages: true,
        replace: false,
        messages: [{
          id: 'older-page', agentId: 'agent-dina', role: 'assistant', status: 'complete',
          turnId: 'turn-older', createdAt: '2026-06-05T00:00:01.000Z',
          parts: [{ type: 'text', text: 'Older response' }],
        }],
      },
      occurredAt: '2026-06-05T00:00:06.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual(['older-page', 'genuine-tail']);
  });

  it('repositions an updated historical message when its canonical page arrives', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages.push({
      id: 'current', agentId: 'agent-dina', role: 'assistant', status: 'complete',
      turnId: 'turn-current', createdAt: '2026-06-05T00:00:05.000Z',
      parts: [{ type: 'text', text: 'Current history' }],
    });
    const transcript = snapshot.messages;

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        preserveKnownMessages: true,
        replace: false,
        messages: [
          {
            id: 'page-one-user', agentId: 'agent-dina', role: 'user', status: 'complete',
            turnId: 'turn-page-one', createdAt: '2026-06-05T00:00:03.000Z',
            parts: [{ type: 'text', text: 'Later historical prompt' }],
          },
          {
            id: 'page-one-assistant', agentId: 'agent-dina', role: 'assistant', status: 'complete',
            turnId: 'turn-page-one', createdAt: '2026-06-05T00:00:03.000Z',
            parts: [{ type: 'text', text: 'Later historical response' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:06.000Z',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-page-two',
      type: 'message.updated',
      payload: {
        message: {
          id: 'page-two-assistant', agentId: 'agent-dina', role: 'assistant', status: 'complete',
          turnId: 'turn-page-two', createdAt: '2026-06-05T00:00:01.000Z',
          parts: [{ type: 'text', text: 'Hydrated historical response' }],
        },
      },
      occurredAt: '2026-06-05T00:00:06.500Z',
    });
    const hydratedAssistant = snapshot.messages.at(-1);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        preserveKnownMessages: true,
        replace: false,
        messages: [
          {
            id: 'page-two-user', agentId: 'agent-dina', role: 'user', status: 'complete',
            turnId: 'turn-page-two', createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'Earlier historical prompt' }],
          },
          {
            id: 'page-two-assistant', agentId: 'agent-dina', role: 'assistant', status: 'complete',
            turnId: 'turn-page-two', createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'Unhydrated historical response' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:07.000Z',
    });

    expect(snapshot.messages).toBe(transcript);
    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'page-two-user', 'page-two-assistant', 'page-one-user', 'page-one-assistant', 'current',
    ]);
    expect(snapshot.messages[1]).toBe(hydratedAssistant);
    expect(snapshot.messages[1]?.parts).toStrictEqual([
      { type: 'text', text: 'Hydrated historical response' },
    ]);
  });

  it('inserts steer prompts at the streaming point and resumes assistant output in a new segment', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.started',
      payload: { status: 'running' },
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

  it('hydrates resumed thread history before current local prompts', () => {
    const snapshot = createInitialSnapshot();

    appendUserPrompt(snapshot, 'agent-dina', 'continue please', '2026-06-05T00:00:03.000Z');
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        messages: [
          {
            id: 'user-thread-1-turn-old-user-old',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [
              { type: 'text', text: 'older prompt' },
              {
                type: 'attachment',
                attachment: {
                  kind: 'image',
                  name: 'screenshot.png',
                  path: '/tmp/screenshot.png',
                  url: 'file:///tmp/screenshot.png',
                  mimeType: 'image/png',
                },
              },
              {
                type: 'attachment',
                attachment: {
                  kind: 'file', name: 'report.txt', path: '/tmp/report.txt', mimeType: 'text/plain',
                },
              },
            ],
          },
          {
            id: 'assistant-turn-old',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [
              { type: 'text', text: 'older answer' },
              {
                type: 'media',
                itemId: 'generated-image',
                media: {
                  url: 'file:///tmp/generated-image.png',
                  alt: 'Generated image',
                  mimeType: 'image/png',
                  prompt: 'Draw a route map',
                  title: 'Generated image',
                },
              },
            ],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'user-thread-1-turn-old-user-old',
      'assistant-turn-old',
      'message-20260605t000003000z',
    ]);
    expect(snapshot.messages[0]?.parts).toStrictEqual([
      { type: 'text', text: 'older prompt' },
      {
        type: 'attachment',
        attachment: {
          kind: 'image',
          name: 'screenshot.png',
          path: '/tmp/screenshot.png',
          url: 'file:///tmp/screenshot.png',
          mimeType: 'image/png',
        },
      },
      {
        type: 'attachment',
        attachment: { kind: 'file', name: 'report.txt', path: '/tmp/report.txt', mimeType: 'text/plain' },
      },
    ]);
    expect(snapshot.messages[1]?.parts).toStrictEqual([
      { type: 'text', text: 'older answer' },
      {
        type: 'media',
        itemId: 'generated-image',
        media: {
          url: 'file:///tmp/generated-image.png',
          alt: 'Generated image',
          mimeType: 'image/png',
          prompt: 'Draw a route map',
          title: 'Generated image',
        },
      },
    ]);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        messages: [
          {
            id: 'user-thread-1-turn-old-user-old',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'older prompt' }],
          },
          {
            id: 'assistant-turn-old',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text', text: 'older answer refreshed' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages).toHaveLength(3);
    expect(snapshot.messages[0].id).toBe('user-thread-1-turn-old-user-old');
    expect(snapshot.messages[1].parts).toStrictEqual([{ type: 'text', text: 'older answer refreshed' }]);
    expect(snapshot.messages[2].id).toBe('message-20260605t000003000z');
  });

  it('replaces an agent transcript when rollback history is loaded', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages = [
      {
        id: 'user-turn-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: 'keep this prompt' }],
      },
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [{ type: 'text', text: 'keep this answer' }],
      },
      {
        id: 'assistant-turn-2',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-2',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [{ type: 'text', text: 'remove this answer' }],
      },
    ];

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        replace: true,
        messages: [
          {
            id: 'user-turn-1',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            turnId: 'turn-1',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'keep this prompt' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual(['user-turn-1']);
  });

  it('merges older and newer hydrated turns without replacing known tool calls or steering', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-live',
      type: 'item.completed',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-live',
        title: 'npm test',
        status: 'completed',
        body: 'tests passed',
        cwd: '/workspace',
        commandActions: [],
        exitCode: 0,
        durationMs: 20,
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-live',
      type: 'message.steer',
      payload: { prompt: 'Keep going with the focused test.' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    const messages = snapshot.messages;

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        replace: false,
        preserveKnownTurns: true,
        messages: [
          {
            id: 'assistant-turn-old',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            turnId: 'turn-old',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'Older history.' }],
          },
          {
            id: 'assistant-turn-live',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            turnId: 'turn-live',
            createdAt: '2026-06-05T00:00:03.000Z',
            parts: [{ type: 'text', text: 'Incomplete app-server history.' }],
          },
          {
            id: 'assistant-turn-new',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            turnId: 'turn-new',
            createdAt: '2026-06-05T00:00:05.000Z',
            parts: [{ type: 'text', text: 'Newer history.' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages).toBe(messages);
    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'assistant-turn-old',
      'assistant-turn-live',
      'steer-turn-live-20260605t000004000z',
      'assistant-turn-new',
    ]);
    expect(snapshot.messages[1]).toMatchObject({
      id: 'assistant-turn-live',
      parts: [expect.objectContaining({ type: 'tool', id: 'cmd-live', body: 'tests passed' })],
    });
    expect(snapshot.messages[2]).toMatchObject({
      kind: 'steer',
      parts: [{ type: 'text', text: 'Keep going with the focused test.' }],
    });
  });

  it('repairs previously misordered known turns when history is refreshed', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages.push(
      {
        id: 'assistant-turn-new',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-new',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [{ type: 'text', text: 'Newer history.' }],
      },
      {
        id: 'assistant-turn-old',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-old',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: 'Older history.' }],
      },
    );
    const messages = snapshot.messages;

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        replace: false,
        preserveKnownTurns: true,
        messages: [...snapshot.messages].reverse(),
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages).toBe(messages);
    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'assistant-turn-old',
      'assistant-turn-new',
    ]);
  });

  it('ignores malformed resumed history payloads', () => {
    const snapshot = createInitialSnapshot();
    appendUserPrompt(snapshot, 'agent-dina', 'keep me', '2026-06-05T00:00:03.000Z');

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        messages: [
          {
            id: 'wrong-agent-message',
            agentId: 'agent-jesse',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text', text: 'wrong agent' }],
          },
          {
            id: 'bad-role-message',
            agentId: 'agent-dina',
            role: 'bot',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text', text: 'bad role' }],
          },
          {
            id: 'bad-part-message',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text' }],
          },
          {
            id: 'bad-attachment-message',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'attachment', attachment: { kind: 'image', name: 42 } }],
          },
          {
            id: 'bad-media-message',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'media', media: { url: 42 } }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'message-20260605t000003000z',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [{ type: 'text', text: 'keep me' }],
      },
    ]);
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

  it('inserts running compaction markers without showing empty assistant thinking after the boundary', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'Before compaction.' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'context.compactionStarted',
      payload: { itemId: 'compact-1' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
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
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'context.compactionStarted',
      payload: { itemId: 'compact-1' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
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
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
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
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.started',
      payload: { status: 'running' },
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
