import { describe, expect, it, vi } from 'vitest';
import { ClaudeBackendDriver } from '../claude-driver';
import type { ClaudeSdkMessage } from '../protocol';
import type { ClaudeTurnHandle, ClaudeTurnParams, ClaudeTurnTransport } from '../cli-transport';
import type { Agent } from '../../../shared/contracts';

const agent: Agent = {
  id: 'agent-claude',
  name: 'Claude Pal',
  folder: '/Users/nbonamy/src/codex-claw',
  backend: 'claude',
  backendDefaults: { kind: 'claude' },
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('ClaudeBackendDriver', () => {
  it('starts Claude turns and adapts stream-json messages into backend events', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: unknown[] = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'hello claude', {
      model: 'claude-sonnet-4-5',
      backendOptions: { kind: 'claude', permissionMode: 'acceptEdits' },
    });
    expect(transport.startTurn).toHaveBeenCalledWith(expect.objectContaining({
      cwd: '/Users/nbonamy/src/codex-claw',
      prompt: 'hello claude',
      sessionId: undefined,
      model: 'claude-sonnet-4-5',
      permissionMode: 'acceptEdits',
      appendSystemPrompt: expect.stringContaining('Your Codex Claw agent ID is agent-claude.'),
    }), expect.any(Function));

    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-1' });
    await expect(sendResult).resolves.toStrictEqual({
      backendSession: { kind: 'claude', sessionId: 'claude-session-1', transport: 'stdio' },
      turnId: expect.stringMatching(/^claude-turn-/),
    });
    const turnId = (await sendResult).turnId;

    transport.emit({
      type: 'assistant',
      session_id: 'claude-session-1',
      message: {
        content: [
          { type: 'text', text: 'Working on it.' },
          { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'npm test' } },
        ],
      },
    });
    transport.emit({
      type: 'user',
      session_id: 'claude-session-1',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'pass' },
        ],
      },
    });
    transport.emit({ type: 'result', subtype: 'success', session_id: 'claude-session-1', is_error: false });

    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-claude',
      backend: 'claude',
      backendSessionId: 'claude-session-1',
      type: 'thread.started',
      payload: { sessionId: 'claude-session-1', transport: 'stdio' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-claude',
      backend: 'claude',
      backendSessionId: 'claude-session-1',
      turnId,
      type: 'message.delta',
      payload: { delta: 'Working on it.' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      turnId,
      type: 'item.started',
      payload: {
        toolPart: expect.objectContaining({
          id: 'tool-1',
          title: 'Bash',
          status: 'running',
          input: { command: 'npm test' },
        }),
      },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      turnId,
      type: 'item.updated',
      payload: expect.objectContaining({
        itemId: 'tool-1',
        status: 'completed',
        output: 'pass',
      }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      turnId,
      type: 'turn.completed',
    }));
  });

  it('resumes persisted Claude sessions and interrupts active turns', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: unknown[] = [];
    driver.onEvent((event) => events.push(event));
    const persistedAgent: Agent = {
      ...agent,
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transport: 'stdio' },
    };

    const sendResult = await driver.sendPrompt(persistedAgent, 'continue');
    expect(transport.startTurn.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'claude-session-existing',
    });
    expect(sendResult.backendSession).toStrictEqual({ kind: 'claude', sessionId: 'claude-session-existing', transport: 'stdio' });

    await expect(driver.interrupt(persistedAgent)).resolves.toStrictEqual({
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transport: 'stdio' },
      turnId: sendResult.turnId,
    });
    expect(transport.lastHandle.interrupt).toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({
      turnId: sendResult.turnId,
      type: 'turn.completed',
      payload: { turn: { id: sendResult.turnId, status: 'interrupted' } },
    }));
  });

  it('lists the Claude model aliases used by the CLI', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);

    await expect(driver.listModels(agent)).resolves.toStrictEqual([
      {
        id: 'opus',
        model: 'opus',
        displayName: 'Opus',
      },
      {
        id: 'sonnet',
        model: 'sonnet',
        displayName: 'Sonnet',
        isDefault: true,
      },
      {
        id: 'haiku',
        model: 'haiku',
        displayName: 'Haiku',
      },
    ]);
  });

  it('passes Claw MCP config and allows Claw MCP tools by default', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport, async () => null, {
      clawMcpServerUrl: 'http://127.0.0.1:4321/mcp',
    });

    const sendResult = driver.sendPrompt(agent, 'coordinate with the team');

    expect(transport.startTurn.mock.calls[0]?.[0]).toMatchObject({
      mcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-claude',
      allowedTools: ['mcp__codex_claw__*'],
      appendSystemPrompt: expect.stringContaining('Use the codex_claw MCP server for agent collaboration.'),
    });
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-mcp' });
    await expect(sendResult).resolves.toMatchObject({
      backendSession: { kind: 'claude', sessionId: 'claude-session-mcp', transport: 'stdio' },
    });
  });

  it('hydrates persisted Claude transcript history through the driver', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport, async () => ({
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transcriptSessionId: 'claude-session-existing', transport: 'stdio' },
      messages: [
        {
          id: 'user-claude-session-existing-user-1',
          agentId: 'agent-claude',
          role: 'user',
          status: 'complete',
          turnId: 'claude-prompt-1',
          createdAt: '2026-06-06T22:33:42.809Z',
          parts: [{ type: 'text', text: 'hello' }],
        },
      ],
    }));
    const events: unknown[] = [];
    driver.onEvent((event) => events.push(event));
    const persistedAgent: Agent = {
      ...agent,
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transport: 'stdio' },
    };

    await expect(driver.hydrateAgent(persistedAgent)).resolves.toStrictEqual({
      kind: 'claude',
      sessionId: 'claude-session-existing',
      transcriptSessionId: 'claude-session-existing',
      transport: 'stdio',
    });
    expect(events).toStrictEqual([
      expect.objectContaining({
        agentId: 'agent-claude',
        backend: 'claude',
        backendSessionId: 'claude-session-existing',
        type: 'thread.historyLoaded',
        payload: {
          messages: [
            expect.objectContaining({
              id: 'user-claude-session-existing-user-1',
              parts: [{ type: 'text', text: 'hello' }],
            }),
          ],
        },
      }),
    ]);
  });

  it('converts prompted plan mode into Claude instructions', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const sendResult = driver.sendPrompt(agent, 'build the thing', { planMode: true });

    expect(transport.startTurn.mock.calls[0]?.[0].prompt).toBe([
      'Work in plan mode for this request.',
      'First create a concise plan with the steps you intend to take. Then carry out the work unless the user explicitly asks only for the plan.',
      '',
      'User request:',
      'build the thing',
    ].join('\n'));

    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-plan' });
    await expect(sendResult).resolves.toMatchObject({
      backendSession: { kind: 'claude', sessionId: 'claude-session-plan', transport: 'stdio' },
    });
  });

  it('streams partial text deltas and suppresses the duplicate final assistant text', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'stream please');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-stream' });
    const turnId = (await sendResult).turnId;

    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-stream',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello' },
      },
    });
    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-stream',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: ' world' },
      },
    });
    transport.emit({
      type: 'assistant',
      session_id: 'claude-session-stream',
      message: {
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });

    expect(events.filter((event) => event.type === 'message.delta')).toStrictEqual([
      expect.objectContaining({
        turnId,
        payload: { delta: 'Hello' },
      }),
      expect.objectContaining({
        turnId,
        payload: { delta: ' world' },
      }),
    ]);
  });

  it('streams tool-use starts and input deltas before final assistant messages', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; turnId?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'run tests');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-tools' });
    const turnId = (await sendResult).turnId;

    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-tools',
      event: {
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'tool_use',
          id: 'tool-streamed',
          name: 'Bash',
          input: {},
        },
      },
    });
    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-tools',
      event: {
        type: 'content_block_delta',
        index: 2,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"command":"npm test"}',
        },
      },
    });
    transport.emit({
      type: 'assistant',
      session_id: 'claude-session-tools',
      message: {
        content: [
          { type: 'tool_use', id: 'tool-streamed', name: 'Bash', input: { command: 'npm test' } },
        ],
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      turnId,
      type: 'item.started',
      payload: {
        toolPart: expect.objectContaining({
          id: 'tool-streamed',
          title: 'Bash',
          status: 'running',
          input: {},
        }),
      },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      turnId,
      type: 'item.updated',
      payload: {
        itemId: 'tool-streamed',
        statusText: null,
        input: { command: 'npm test' },
      },
    }));
  });

  it('surfaces Claude result errors once when the process exits non-zero after result', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'hello claude');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-1' });
    await sendResult;
    transport.emit({
      type: 'assistant',
      session_id: 'claude-session-1',
      error: 'authentication_failed',
      message: {
        content: [{ type: 'text', text: 'Not logged in · Please run /login' }],
      },
    });
    transport.emit({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Not logged in · Please run /login',
      session_id: 'claude-session-1',
    });
    transport.rejectDone(new Error('Claude exited (1): Not logged in'));

    const errorEvents = events.filter((event) => event.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.payload).toStrictEqual({ message: 'Claude Code is not logged in. Open Claude Code and run /login, then try again.' });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'backend.statusChanged',
      payload: {
        backend: 'claude',
        status: 'error',
        detail: 'Claude Code is not logged in. Open Claude Code and run /login, then try again.',
      },
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'message.delta',
      payload: { delta: 'Not logged in · Please run /login' },
    }));
  });
});

function createFakeTransport(): ClaudeTurnTransport & {
  emit(message: ClaudeSdkMessage): void;
  rejectDone(error: Error): void;
  lastHandle: ClaudeTurnHandle & { interrupt: ReturnType<typeof vi.fn> };
  startTurn: ReturnType<typeof vi.fn<(params: ClaudeTurnParams, onMessage: (message: ClaudeSdkMessage) => void) => ClaudeTurnHandle>>;
} {
  let onMessage: (message: ClaudeSdkMessage) => void = () => undefined;
  let rejectDone: (error: Error) => void = () => undefined;
  const lastHandle = {
    done: new Promise<void>((_resolve, reject) => {
      rejectDone = reject;
    }),
    interrupt: vi.fn(),
  };
  return {
    lastHandle,
    startTurn: vi.fn((_: ClaudeTurnParams, listener: (message: ClaudeSdkMessage) => void) => {
      onMessage = listener;
      return lastHandle;
    }),
    emit: (message: ClaudeSdkMessage) => {
      onMessage(message);
    },
    rejectDone: (error: Error) => {
      rejectDone(error);
    },
    close: vi.fn().mockResolvedValue(undefined),
  };
}
