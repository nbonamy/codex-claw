import { describe, expect, it } from 'vitest';
import {
  appendUserPrompt,
  applyMainEventToSnapshot,
  createInitialSnapshot,
  selectAgent,
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

  it('reduces structured Codex tool items into assistant tool parts', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: {
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'npm test',
          cwd: '/Users/nbonamy/src/codex-claw',
          status: 'inProgress',
          commandActions: [],
          aggregatedOutput: null,
          exitCode: null,
          durationMs: null,
        },
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'cmd-1',
        kind: 'commandExecution.outputDelta',
        delta: 'running vitest\n',
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: {
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'npm test',
          cwd: '/Users/nbonamy/src/codex-claw',
          status: 'completed',
          commandActions: [],
          aggregatedOutput: '1 test passed',
          exitCode: 0,
          durationMs: 123,
        },
      },
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
      payload: {
        item: {
          type: 'commandExecution',
          id: 'cmd-read',
          command: 'cat docs/architecture.md',
          cwd: '/Users/nbonamy/src/codex-claw',
          status: 'inProgress',
          aggregatedOutput: null,
        },
      },
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

  it('keeps tool output visible when Codex sends updates without a started item', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'cmd-missed-start',
        kind: 'commandExecution.outputDelta',
        delta: 'reading docs/architecture.md\n',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'mcp-missed-start',
        kind: 'mcpToolCall.progress',
        message: 'opening file',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'raw-output-only',
        kind: 'rawResponseItem.output',
        output: 'architecture contents',
        status: 'completed',
        title: 'read_file',
      },
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

  it('does not erase streamed command output when completion lacks aggregate output', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: {
        item: {
          type: 'commandExecution',
          id: 'cmd-streamed',
          command: 'cat docs/architecture.md',
          cwd: '/Users/nbonamy/src/codex-claw',
          status: 'inProgress',
          aggregatedOutput: null,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'cmd-streamed',
        kind: 'commandExecution.outputDelta',
        delta: 'streamed output',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: {
        item: {
          type: 'commandExecution',
          id: 'cmd-streamed',
          command: 'cat docs/architecture.md',
          cwd: '/Users/nbonamy/src/codex-claw',
          status: 'completed',
          aggregatedOutput: null,
          exitCode: 0,
        },
      },
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
      payload: {
        item: {
          type: 'dynamicToolCall',
          id: 'raw-call-1',
          namespace: null,
          tool: 'read_file',
          status: 'inProgress',
          arguments: { path: 'docs/architecture.md' },
          contentItems: null,
          success: null,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'raw-call-1',
        kind: 'rawResponseItem.output',
        output: [{ type: 'input_text', text: 'architecture contents' }],
        status: 'completed',
      },
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

    const rawOutputPayloads = [
      {
        itemId: 'undefined-output',
        kind: 'rawResponseItem.output',
        output: undefined,
        status: 'completed',
      },
      {
        itemId: 'number-output',
        kind: 'rawResponseItem.output',
        output: 42,
        status: 'completed',
      },
      {
        itemId: 'content-string',
        kind: 'rawResponseItem.output',
        output: { content: 'plain content' },
        status: 'completed',
      },
      {
        itemId: 'content-array',
        kind: 'rawResponseItem.output',
        output: { content: [{ text: 'nested content' }] },
        status: 'completed',
      },
      {
        itemId: 'json-object',
        kind: 'rawResponseItem.output',
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
        payload,
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

  it('maps MCP, dynamic, and file-change items without text tags', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: {
        item: {
          type: 'mcpToolCall',
          id: 'mcp-1',
          server: 'browser',
          tool: 'open',
          status: 'inProgress',
          arguments: { url: 'http://localhost:5173' },
          result: null,
          error: null,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: {
        item: {
          type: 'dynamicToolCall',
          id: 'dynamic-1',
          namespace: 'image',
          tool: 'generate',
          status: 'completed',
          arguments: { prompt: 'ship' },
          contentItems: [{ type: 'inputText', text: 'done' }],
          success: true,
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: {
        item: {
          type: 'fileChange',
          id: 'patch-1',
          changes: [{ kind: 'update', path: 'src/app.ts' }],
          status: 'completed',
        },
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'mcp-1',
        kind: 'mcp',
        title: 'browser.open',
        status: 'running',
        body: undefined,
        input: { url: 'http://localhost:5173' },
        output: null,
        metadata: {
          server: 'browser',
          tool: 'open',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
          durationMs: undefined,
        },
      },
      {
        type: 'tool',
        id: 'dynamic-1',
        kind: 'dynamic',
        title: 'image.generate',
        status: 'completed',
        body: 'done',
        input: { prompt: 'ship' },
        output: [{ type: 'inputText', text: 'done' }],
        metadata: {
          namespace: 'image',
          tool: 'generate',
          success: true,
          durationMs: undefined,
        },
      },
      {
        type: 'tool',
        id: 'patch-1',
        kind: 'fileChange',
        title: '1 file change',
        status: 'completed',
        body: 'update src/app.ts',
        input: { changes: [{ kind: 'update', path: 'src/app.ts' }] },
        metadata: {
          changes: [{ kind: 'update', path: 'src/app.ts' }],
        },
      },
    ]);
  });

  it('handles tool item fallbacks, progress updates, and malformed payloads', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: { item: { type: 'ignored' } },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: { itemId: 123 },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: {
        item: {
          type: 'commandExecution',
          id: 'cmd-defaults',
          status: 'failed',
          aggregatedOutput: null,
          exitCode: null,
          durationMs: null,
        },
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: {
        item: {
          type: 'mcpToolCall',
          id: 'mcp-error',
          status: 'failed',
          arguments: null,
          result: {
            content: [{ type: 'image', url: 'file.png' }, 'bad-shape'],
          },
          error: { message: 'tool failed' },
        },
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 5,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: {
        item: {
          type: 'dynamicToolCall',
          id: 'dynamic-defaults',
          arguments: null,
          status: 'failed',
          contentItems: [{ type: 'inputImage', imageUrl: 'file.png' }],
        },
      },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 6,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: {
        item: {
          type: 'fileChange',
          id: 'patch-empty',
          changes: ['unexpected'],
          status: 'completed',
        },
      },
      occurredAt: '2026-06-05T00:00:06.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 7,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'mcp-error',
        message: 'still failing',
      },
      occurredAt: '2026-06-05T00:00:07.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 8,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'patch-empty',
        changes: [{ path: 'src/next.ts' }, 'raw change'],
      },
      occurredAt: '2026-06-05T00:00:08.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toMatchObject([
      {
        type: 'tool',
        id: 'cmd-defaults',
        kind: 'command',
        title: 'command',
        status: 'failed',
      },
      {
        type: 'tool',
        id: 'mcp-error',
        kind: 'mcp',
        title: 'mcp.tool',
        status: 'failed',
        body: 'tool failed\nstill failing',
      },
      {
        type: 'tool',
        id: 'dynamic-defaults',
        kind: 'dynamic',
        title: 'tool',
        status: 'failed',
        body: '{"type":"inputImage","imageUrl":"file.png"}',
      },
      {
        type: 'tool',
        id: 'patch-empty',
        kind: 'fileChange',
        body: 'update src/next.ts\n"raw change"',
      },
    ]);
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
