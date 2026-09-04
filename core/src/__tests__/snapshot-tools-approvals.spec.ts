import { describe, expect, it } from 'vitest';
import {
  applyMainEventToSnapshot,
  createInitialSnapshot,
} from '../snapshot';
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

  it('keeps queued prompts in the authoritative snapshot until confirmed dequeue', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'run next', options: { planMode: true } },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'run next' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'prompt-1',
      agentId: 'agent-dina',
      text: 'run next',
      createdAt: '2026-06-05T00:00:01.000Z',
      options: { planMode: true },
    }]);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'agent.promptDequeued',
      payload: { ids: ['prompt-1'] },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    expect(snapshot.queuedPrompts).toStrictEqual([]);
  });

  it('keeps queued prompts in snapshot state and scopes dequeue to the owning agent', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1, agentId: 'agent-dina', type: 'agent.promptQueued',
      payload: { id: 'shared-id', text: 'Dina next' }, occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2, agentId: 'agent-jesse', type: 'agent.promptQueued',
      payload: { id: 'shared-id', text: 'Jesse next' }, occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3, agentId: 'agent-dina', type: 'agent.promptDequeued',
      payload: { ids: ['shared-id'] }, occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'shared-id', agentId: 'agent-jesse', text: 'Jesse next', createdAt: '2026-06-05T00:00:02.000Z',
    }]);
  });

  it('records queue retry failures without removing or reordering the prompt', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'retry me' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'agent.promptRetryScheduled',
      payload: {
        id: 'prompt-1',
        attempts: 2,
        lastError: 'transport disconnected',
        retryAt: '2026-06-05T00:00:03.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'prompt-1',
      agentId: 'agent-dina',
      text: 'retry me',
      createdAt: '2026-06-05T00:00:01.000Z',
      attempts: 2,
      lastError: 'transport disconnected',
      retryAt: '2026-06-05T00:00:03.000Z',
      submitted: true,
    }]);
  });

  it('keeps backend approvals in canonical snapshot state until resolution', () => {
    const snapshot = createInitialSnapshot();
    const approval = {
      id: 'approval-1',
      kind: 'command' as const,
      conversationId: 'thread-dina',
      itemId: 'command-1',
      title: 'Run tests',
      command: 'npm test',
    };
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'backendApproval.requested',
      payload: { approval },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([approval]);
    expect(snapshot.agents[0]?.status).toStrictEqual({ type: 'awaitingInput', detail: 'Run tests' });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'backendApproval.resolved',
      payload: { approval, decision: 'allow' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([]);
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

  it('maps MCP, dynamic, and file-change items without text tags', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'mcp-1',
        title: 'browser.open',
        status: 'running',
        input: { url: 'http://localhost:5173' },
        output: null,
        metadata: {
          server: 'browser',
          tool: 'open',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
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
      type: 'item.completed',
      payload: toolPartPayload(dynamicToolPart({
        id: 'dynamic-1',
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
      })),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(fileChangeToolPart('patch-1', [{ kind: 'update', path: 'src/app.ts' }], 'completed')),
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

  it('applies turn diff stats to the running file-change tool', () => {
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
      type: 'item.started',
      payload: toolPartPayload(fileChangeToolPart('patch-1', [{ kind: 'update', path: 'src/app.ts' }], 'running')),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'diff.updated',
      payload: {
        addedLines: 4,
        diff: '--- a/src/app.ts\n+++ b/src/app.ts',
        removedLines: 2,
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    const fileChange = snapshot.messages.at(-1)?.parts.find((part): part is RendererToolPart => {
      return part.type === 'tool' && part.kind === 'fileChange';
    });
    expect(fileChange?.statusText ? JSON.parse(fileChange.statusText) : null).toStrictEqual({
      action: 'edit',
      phase: 'running',
      params: {
        addedLines: 4,
        removedLines: 2,
        target: '1 file change',
      },
      source: 'codex',
    });
    expect(snapshot.turnGitDiffs['turn-1']).toStrictEqual({
      turnId: 'turn-1',
      addedLines: 4,
      removedLines: 2,
      diff: '--- a/src/app.ts\n+++ b/src/app.ts',
      updatedAt: '2026-06-05T00:00:03.000Z',
    });
  });

  it('uses MCP structuredContent instead of the model-facing placeholder text', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-set-status',
        title: 'codex_claw.set-status',
        status: 'completed',
        body: '{"agentId":"agent-dina","status":"Registered and idle"}',
        input: {
          agentId: 'agent-dina',
          status: 'Registered and idle',
        },
        output: {
          content: [{ type: 'text', text: 'Result returned in structuredContent.' }],
          structuredContent: {
            agentId: 'agent-dina',
            status: 'Registered and idle',
          },
          isError: false,
        },
        metadata: {
          server: 'codex_claw',
          tool: 'set-status',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
          durationMs: undefined,
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'call-set-status',
        kind: 'mcp',
        title: 'codex_claw.set-status',
        status: 'completed',
        body: '{"agentId":"agent-dina","status":"Registered and idle"}',
        input: {
          agentId: 'agent-dina',
          status: 'Registered and idle',
        },
        output: {
          content: [{ type: 'text', text: 'Result returned in structuredContent.' }],
          structuredContent: {
            agentId: 'agent-dina',
            status: 'Registered and idle',
          },
          isError: false,
        },
        metadata: {
          server: 'codex_claw',
          tool: 'set-status',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
          durationMs: undefined,
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
      payload: { toolPart: { type: 'ignored' } },
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
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-defaults',
        title: 'command',
        status: 'failed',
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'mcp-error',
        title: 'mcp.tool',
        status: 'failed',
        body: 'tool failed',
        input: null,
        output: {
          content: [{ type: 'image', url: 'file.png' }, 'bad-shape'],
        },
      })),
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 5,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(dynamicToolPart({
        id: 'dynamic-defaults',
        title: 'tool',
        status: 'failed',
        body: '{"type":"inputImage","imageUrl":"file.png"}',
        input: null,
      })),
      occurredAt: '2026-06-05T00:00:05.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 6,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(fileChangeToolPart('patch-empty', ['unexpected'], 'completed')),
      occurredAt: '2026-06-05T00:00:06.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 7,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: mcpProgressToToolPartUpdate('mcp-error', 'still failing'),
      occurredAt: '2026-06-05T00:00:07.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 8,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: fileChangePatchToToolPartUpdate('patch-empty', [{ path: 'src/next.ts' }, 'raw change']),
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

  it('attaches approval requests to the matching running MCP tool part', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-register-agent',
        title: 'codex_claw.register-agent',
        status: 'running',
        input: { agentId: 'agent-dina' },
        metadata: {
          server: 'codex_claw',
          tool: 'register-agent',
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-1',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            allowAlways: true,
            allowConversation: true,
            argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to run register-agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    const tool = snapshot.messages.at(-1)?.parts[0];
    expect(tool).toMatchObject({
      type: 'tool',
      id: 'call-register-agent',
      kind: 'mcp',
      title: 'codex_claw.register-agent',
      status: 'running',
      input: { agentId: 'agent-dina' },
      metadata: {
        confirmationRequestId: 'approval-1',
        server: 'codex_claw',
        tool: 'register-agent',
      },
    });
    expect(tool?.type === 'tool' ? JSON.parse(tool.statusText ?? '') : null).toStrictEqual({
      source: 'mcp',
      action: 'run',
      phase: 'running',
      params: {
        requestId: 'approval-1',
        tool: 'codex_claw.register-agent',
        confirmationSummary: 'Allow codex_claw to run register-agent?',
        argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
        allowConversation: true,
        allowAlways: true,
      },
    });
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'awaitingInput',
      detail: 'Allow codex_claw to run register-agent?',
    });
  });

  it('creates an inline approval placeholder if the MCP tool item has not arrived yet', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-early',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: 'agentId: agent-dina',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to register this agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'approval-approval-early',
        kind: 'mcp',
        title: 'codex_claw.register-agent',
        status: 'running',
        statusText: JSON.stringify({
          source: 'mcp',
          action: 'run',
          phase: 'running',
          params: {
            requestId: 'approval-early',
            tool: 'codex_claw.register-agent',
            confirmationSummary: 'Allow codex_claw to register this agent?',
            argumentsPreview: 'agentId: agent-dina',
            allowConversation: false,
            allowAlways: false,
          },
        }),
        input: 'agentId: agent-dina',
        metadata: {
          confirmationRequestId: 'approval-early',
          server: 'codex_claw',
          tool: 'register-agent',
        },
      },
    ]);
  });

  it('creates an inline user-input prompt from app-server tool input requests', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'toolInput.requested',
      payload: {
        id: 'ask-1',
        kind: 'ask_user',
        payload: {
          request: {
            itemId: 'ask-user-item',
            questions: [
              {
                id: 'target_file',
                header: 'Target',
                question: 'Which file should I inspect?',
                isOther: true,
                isSecret: false,
                options: null,
              },
            ],
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'ask-user-item',
        kind: 'generic',
        title: 'ask_user_question',
        status: 'running',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'ask_user_question',
          phase: 'running',
          params: {
            requestId: 'ask-1',
            questions: [
              {
                id: 'target_file',
                header: 'Target',
                question: 'Which file should I inspect?',
                isOther: true,
                isSecret: false,
                options: null,
              },
            ],
          },
        }),
        input: [
          {
            id: 'target_file',
            header: 'Target',
            question: 'Which file should I inspect?',
            isOther: true,
            isSecret: false,
            options: null,
          },
        ],
        metadata: {
          requestId: 'ask-1',
          question: 'Which file should I inspect?',
        },
      },
    ]);
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'awaitingInput',
      detail: 'Which file should I inspect?',
    });
  });

  it('tracks app-owned work-routing requests outside the transcript', () => {
    const snapshot = createInitialSnapshot();
    const request = {
      id: 'work-routing-1',
      kind: 'work_routing' as const,
      payload: {
        request: {
          agentId: 'agent-dina',
          task: 'Add queue retries',
          suggestedBranchName: 'feat/queue-retries',
          sharedFolderAgentNames: [],
        },
      },
    };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'workRouting.requested',
      payload: request,
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.workRoutingRequests).toStrictEqual([request]);
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'workRouting.resolved',
      payload: { id: 'work-routing-1' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.workRoutingRequests).toStrictEqual([]);
  });

  it('attaches approval requests to the only running MCP tool when metadata is incomplete', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-without-metadata',
        title: 'unknown_server.unknown-tool',
        status: 'running',
        metadata: {
          server: 'unknown_server',
          tool: 'unknown-tool',
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-sole-tool',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to register this agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toHaveLength(1);
    expect(snapshot.messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool',
      id: 'call-without-metadata',
      title: 'codex_claw.register-agent',
      metadata: {
        confirmationRequestId: 'approval-sole-tool',
        server: 'codex_claw',
        tool: 'register-agent',
      },
    });
  });
});
