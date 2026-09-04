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
});
