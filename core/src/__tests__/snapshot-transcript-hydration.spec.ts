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
      backend: 'codex',
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
        payload: { messages: [...messages], preserveKnownMessages: true, replace: false },
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
    } as unknown as MainToRendererEvent);

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
      backend: 'codex',
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
    } as unknown as MainToRendererEvent);

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
});
