import { describe, expect, it } from 'vitest';
import {
  codexThreadItemToToolPart,
  commandOutputDeltaToToolPartUpdate,
  fileChangePatchToToolPartUpdate,
  mcpProgressToToolPartUpdate,
  rawOutputToToolPartUpdate,
} from '../tool-part-adapter';

describe('tool-part-adapter', () => {
  it('maps Codex command executions into renderer tool parts', () => {
    expect(codexThreadItemToToolPart({
      type: 'commandExecution',
      id: 'cmd-1',
      command: 'npm test',
      cwd: '/Users/nbonamy/src/codex-claw',
      status: 'completed',
      commandActions: [],
      aggregatedOutput: 'passed',
      exitCode: 0,
      durationMs: 123,
      source: 'agent',
      processId: 42,
    })).toStrictEqual({
      type: 'tool',
      id: 'cmd-1',
      kind: 'command',
      title: 'npm test',
      status: 'completed',
      body: 'passed',
      input: {
        command: 'npm test',
        cwd: '/Users/nbonamy/src/codex-claw',
        commandActions: [],
      },
      output: {
        exitCode: 0,
        durationMs: 123,
      },
      metadata: {
        source: 'agent',
        processId: 42,
      },
    });
  });

  it('maps MCP structuredContent over the model-facing placeholder', () => {
    expect(codexThreadItemToToolPart({
      type: 'mcpToolCall',
      id: 'call-set-status',
      server: 'codex_claw',
      tool: 'set-status',
      status: 'completed',
      arguments: {
        agentId: 'agent-dina',
        status: 'Registered and idle',
      },
      result: {
        content: [{ type: 'text', text: 'Result returned in structuredContent.' }],
        structuredContent: {
          agentId: 'agent-dina',
          status: 'Registered and idle',
        },
        isError: false,
      },
    })).toMatchObject({
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
      metadata: {
        server: 'codex_claw',
        tool: 'set-status',
      },
    });
  });

  it('maps dynamic, file-change, web-search, and image-generation items', () => {
    expect(codexThreadItemToToolPart({
      type: 'dynamicToolCall',
      id: 'dynamic-1',
      namespace: 'image',
      tool: 'generate',
      status: 'success',
      arguments: { prompt: 'ship' },
      contentItems: [{ type: 'inputText', text: 'done' }],
      success: true,
      durationMs: 12,
    })).toStrictEqual({
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
        durationMs: 12,
      },
    });

    expect(codexThreadItemToToolPart({
      type: 'fileChange',
      id: 'patch-1',
      changes: [{ kind: 'update', path: 'src/app.ts' }],
      status: 'completed',
    })).toMatchObject({
      id: 'patch-1',
      kind: 'fileChange',
      title: '1 file change',
      status: 'completed',
      body: 'update src/app.ts',
    });

    expect(codexThreadItemToToolPart({
      type: 'webSearch',
      id: 'search-1',
      query: 'codex app server',
    })).toMatchObject({
      id: 'search-1',
      kind: 'generic',
      title: 'Web search',
      status: 'completed',
      body: 'codex app server',
    });

    expect(codexThreadItemToToolPart({
      type: 'imageGeneration',
      id: 'image-1',
      status: 'failed',
      revisedPrompt: 'draw a UI',
      savedPath: '/tmp/ui.png',
    })).toMatchObject({
      id: 'image-1',
      kind: 'dynamic',
      title: 'image_generation',
      status: 'failed',
      body: 'draw a UI',
      output: '/tmp/ui.png',
    });
  });

  it('creates app-owned update payloads with fallback tool parts', () => {
    expect(commandOutputDeltaToToolPartUpdate('cmd-1', 'running\n')).toStrictEqual({
      itemId: 'cmd-1',
      bodyDelta: 'running\n',
      fallbackToolPart: {
        type: 'tool',
        id: 'cmd-1',
        kind: 'command',
        title: 'Command',
        status: 'running',
      },
    });

    expect(mcpProgressToToolPartUpdate('mcp-1', 'opening')).toStrictEqual({
      itemId: 'mcp-1',
      bodyAppend: 'opening',
      fallbackToolPart: {
        type: 'tool',
        id: 'mcp-1',
        kind: 'mcp',
        title: 'MCP tool',
        status: 'running',
      },
    });

    expect(fileChangePatchToToolPartUpdate('patch-1', [{ path: 'src/next.ts' }])).toMatchObject({
      itemId: 'patch-1',
      body: 'update src/next.ts',
      input: {
        changes: [{ path: 'src/next.ts' }],
      },
      fallbackToolPart: {
        type: 'tool',
        id: 'patch-1',
        kind: 'fileChange',
        title: '1 file change',
        status: 'running',
      },
    });

    expect(rawOutputToToolPartUpdate('raw-1', { content: [{ text: 'nested' }] }, 'read_file')).toMatchObject({
      itemId: 'raw-1',
      title: 'read_file',
      status: 'completed',
      body: 'nested',
      output: { content: [{ text: 'nested' }] },
      fallbackToolPart: {
        type: 'tool',
        id: 'raw-1',
        kind: 'generic',
        title: 'read_file',
        status: 'completed',
        body: 'nested',
      },
    });
  });

  it('ignores unsupported item shapes', () => {
    expect(codexThreadItemToToolPart(null)).toBeNull();
    expect(codexThreadItemToToolPart({ type: 'unknown', id: 'unknown-1' })).toBeNull();
  });
});
