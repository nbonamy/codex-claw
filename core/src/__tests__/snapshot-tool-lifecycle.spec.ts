import { describe, expect, it } from 'vitest';
import {
  createInitialSnapshot,
} from '../snapshot';
import { applyConversationEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-conversation-reducer';
import type { RendererToolPart, RendererToolPartUpdate } from '../contracts';
import {
  commandOutputDeltaToToolPartUpdate,
  commandToolPart,
  dynamicToolPart,
  fileChangePatchToToolPartUpdate,
  fileChangeToolPart,
  mcpProgressToToolPartUpdate,
  mcpToolPart,
  rawOutputToToolPartUpdate,
  toolPartPayload,
} from './snapshot-test-fixtures';

describe('snapshot reducer', () => {

  it('reduces app-owned tool items into assistant tool parts', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-1',
        title: 'npm test',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
        commandActions: [],
        exitCode: undefined,
        durationMs: undefined,
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-1', 'running vitest\n'),
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-1',
        title: 'npm test',
        status: 'completed',
        body: '1 test passed',
        cwd: '/Users/nbonamy/src/codex-claw',
        commandActions: [],
        exitCode: 0,
        durationMs: 123,
      })),
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-1',
      parts: [
        {
          type: 'tool',
          id: 'cmd-1',
          kind: 'command',
          title: 'npm test',
          status: 'completed',
          body: '1 test passed',
          input: {
            command: 'npm test',
            cwd: '/Users/nbonamy/src/codex-claw',
            commandActions: [],
          },
          output: {
            exitCode: 0,
            durationMs: 123,
          },
        },
      ],
    });
  });

  it('clears tool status text when an update explicitly sends null', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(dynamicToolPart({
        id: 'tool-1',
        title: 'Bash',
        status: 'running',
        statusText: 'Preparing tool input...',
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'tool-1',
        statusText: null,
        input: { command: 'npm test' },
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    const part = snapshot.messages.at(-1)?.parts[0];
    expect(part).toMatchObject({
      type: 'tool',
      id: 'tool-1',
      kind: 'dynamic',
      title: 'Bash',
      status: 'running',
      input: { command: 'npm test' },
    });
    expect(part && 'statusText' in part).toBe(false);
  });

  it('preserves assistant stream order across tool calls', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-commentary', delta: 'I will read it now.' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-read',
        title: 'cat docs/architecture.md',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
      })),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-final', delta: 'Read docs/architecture.md.' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      { type: 'text', text: 'I will read it now.', itemId: 'msg-commentary' },
      {
        type: 'tool',
        id: 'cmd-read',
        kind: 'command',
        title: 'cat docs/architecture.md',
        status: 'running',
        body: undefined,
        input: {
          command: 'cat docs/architecture.md',
          cwd: '/Users/nbonamy/src/codex-claw',
          commandActions: undefined,
        },
        output: {
          exitCode: undefined,
          durationMs: undefined,
        },
        metadata: {
          source: undefined,
          processId: undefined,
        },
      },
      { type: 'text', text: 'Read docs/architecture.md.', itemId: 'msg-final' },
    ]);
  });

  it('keeps tool updates attached to the segment where the tool originally appeared after steering', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-read',
        title: 'cat docs/architecture.md',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.steer',
      payload: { prompt: 'also read testing.md' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-read', 'architecture contents'),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages[0].parts.at(0)).toMatchObject({
      type: 'tool',
      id: 'cmd-read',
      body: 'architecture contents',
    });
    expect(snapshot.messages[2]).toMatchObject({
      id: 'assistant-turn-1-segment-20260605t000002000z',
      parts: [],
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'assistant-turn-1',
      'steer-turn-1-20260605t000002000z',
    ]);
  });

  it('keeps tool output visible when Codex sends updates without a started item', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-missed-start', 'reading docs/architecture.md\n'),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: mcpProgressToToolPartUpdate('mcp-missed-start', 'opening file'),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: rawOutputToToolPartUpdate('raw-output-only', 'architecture contents', 'read_file'),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'cmd-missed-start',
        kind: 'command',
        title: 'Command',
        status: 'running',
        body: 'reading docs/architecture.md\n',
      },
      {
        type: 'tool',
        id: 'mcp-missed-start',
        kind: 'mcp',
        title: 'MCP tool',
        status: 'running',
        body: 'opening file',
      },
      {
        type: 'tool',
        id: 'raw-output-only',
        kind: 'generic',
        title: 'read_file',
        status: 'completed',
        body: 'architecture contents',
        output: 'architecture contents',
      },
    ]);
  });

  it('preserves arbitrary tool kinds in renderer state', () => {
    const snapshot = createInitialSnapshot();
    const toolPart: RendererToolPart = {
      type: 'tool',
      id: 'future-tool',
      kind: 'futureSdkTool',
      title: 'Future tool',
      status: 'completed',
    };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-future',
      type: 'item.completed',
      payload: toolPartPayload(toolPart),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([toolPart]);
  });

  it('does not erase streamed command output when completion lacks aggregate output', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-streamed',
        title: 'cat docs/architecture.md',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-streamed', 'streamed output'),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-streamed',
        title: 'cat docs/architecture.md',
        status: 'completed',
        cwd: '/Users/nbonamy/src/codex-claw',
        exitCode: 0,
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts.at(-1)).toMatchObject({
      type: 'tool',
      id: 'cmd-streamed',
      title: 'cat docs/architecture.md',
      status: 'completed',
      body: 'streamed output',
      output: {
        exitCode: 0,
      },
    });
  });

  it('updates raw response tool output without erasing the original tool title', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(dynamicToolPart({
        id: 'raw-call-1',
        title: 'read_file',
        status: 'running',
        input: { path: 'docs/architecture.md' },
        metadata: {
          namespace: null,
          tool: 'read_file',
          success: null,
          durationMs: undefined,
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: rawOutputToToolPartUpdate('raw-call-1', [{ type: 'input_text', text: 'architecture contents' }]),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'raw-call-1',
        kind: 'dynamic',
        title: 'read_file',
        status: 'completed',
        body: 'architecture contents',
        input: { path: 'docs/architecture.md' },
        output: [{ type: 'input_text', text: 'architecture contents' }],
        metadata: {
          namespace: null,
          tool: 'read_file',
          success: null,
          durationMs: undefined,
        },
      },
    ]);
  });

  it('normalizes raw response output shapes and ignores unsupported orphan updates', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'unknown-update',
        kind: 'unknown',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages).toHaveLength(0);

    const rawOutputPayloads: Array<{
      itemId: string;
      output: unknown;
      status: RendererToolPartUpdate['status'];
    }> = [
      {
        itemId: 'undefined-output',
        output: undefined,
        status: 'completed',
      },
      {
        itemId: 'number-output',
        output: 42,
        status: 'completed',
      },
      {
        itemId: 'content-string',
        output: { content: 'plain content' },
        status: 'completed',
      },
      {
        itemId: 'content-array',
        output: { content: [{ text: 'nested content' }] },
        status: 'completed',
      },
      {
        itemId: 'json-object',
        output: { other: 'value' },
        status: 'completed',
      },
    ];

    for (const [index, payload] of rawOutputPayloads.entries()) {
      applyMainEventToSnapshot(snapshot, {
        seq: index + 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'item.updated',
        payload: rawOutputToToolPartUpdate(payload.itemId, payload.output, undefined, payload.status),
        occurredAt: '2026-06-05T00:00:02.000Z',
      });
    }

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'undefined-output',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: undefined,
        output: undefined,
      },
      {
        type: 'tool',
        id: 'number-output',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: '42',
        output: 42,
      },
      {
        type: 'tool',
        id: 'content-string',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: 'plain content',
        output: { content: 'plain content' },
      },
      {
        type: 'tool',
        id: 'content-array',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: 'nested content',
        output: { content: [{ text: 'nested content' }] },
      },
      {
        type: 'tool',
        id: 'json-object',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: '{"other":"value"}',
        output: { other: 'value' },
      },
    ]);
  });
});
