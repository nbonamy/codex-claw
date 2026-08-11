import { describe, expect, it, vi } from 'vitest';
import { ClaudeBackendDriver } from '../claude-driver';
import type { ClaudeSdkMessage } from '../protocol';
import type { ClaudeTurnHandle, ClaudeTurnParams, ClaudeTurnTransport } from '../cli-transport';
import type { Agent } from '@codex-claw/core/contracts';

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
  it('exposes and persists Claude permission modes without creating a session', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const configuredAgent: Agent = {
      ...agent,
      backendDefaults: { kind: 'claude', model: 'sonnet', reasoningEffort: 'high' },
    };

    expect(driver.getCapabilities(configuredAgent).permissionModes).toStrictEqual([
      expect.objectContaining({ id: 'default', label: 'Default' }),
      expect.objectContaining({ id: 'acceptEdits', label: 'Accept edits' }),
      expect.objectContaining({ id: 'dontAsk', label: "Don't ask" }),
      expect.objectContaining({ id: 'auto', label: 'Auto (experimental)' }),
      expect.objectContaining({ id: 'bypassPermissions', dangerous: true }),
    ]);
    await expect(driver.setPermissionMode(configuredAgent, 'acceptEdits')).resolves.toStrictEqual({
      backendDefaults: {
        kind: 'claude',
        model: 'sonnet',
        reasoningEffort: 'high',
        permissionMode: 'acceptEdits',
      },
    });
    expect(transport.startTurn).not.toHaveBeenCalled();
  });

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
    }), expect.any(Function), expect.any(Function));

    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-1' });
    await expect(sendResult).resolves.toStrictEqual({
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-1',
        transport: 'stdio',
        model: 'claude-sonnet-4-5',
      },
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
      payload: {
        sessionId: 'claude-session-1',
        transport: 'stdio',
        model: 'claude-sonnet-4-5',
      },
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
          kind: 'command',
          title: 'npm test',
          status: 'running',
          input: { command: 'npm test', cwd: '/Users/nbonamy/src/codex-claw' },
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

  it('routes Claude compact commands and publishes context usage and compaction lifecycle', async () => {
    const transport = createFakeTransport();
    transport.getContextUsage.mockResolvedValue({
      totalTokens: 44_000,
      maxTokens: 200_000,
      percentage: 22,
    });
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; turnId?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const compactResult = driver.tryHandlePromptCommand(agent, '/compact keep the decisions');
    expect(compactResult).not.toBeNull();
    expect(transport.startTurn).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '/compact keep the decisions',
    }), expect.any(Function), expect.any(Function));
    expect(driver.tryHandlePromptCommand(agent, '/review')).toBeNull();

    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-context-session' });
    await compactResult;
    transport.emit({
      type: 'system',
      subtype: 'status',
      status: 'compacting',
      session_id: 'claude-context-session',
    });
    transport.emit({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'manual', pre_tokens: 180_000, post_tokens: 44_000 },
      session_id: 'claude-context-session',
    });
    transport.emit({
      type: 'system',
      subtype: 'status',
      status: null,
      compact_result: 'success',
      session_id: 'claude-context-session',
    });
    transport.emit({ type: 'result', subtype: 'success', session_id: 'claude-context-session', is_error: false });

    await vi.waitFor(() => expect(transport.getContextUsage).toHaveBeenCalled());
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: 'thread.tokenUsageUpdated',
      payload: {
        contextUsage: {
          totalTokens: 44_000,
          inputTokens: 44_000,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          lastTotalTokens: 44_000,
          modelContextWindow: 200_000,
          usedPercent: 22,
        },
      },
    })));
    expect(events.filter((event) => event.type === 'context.compactionStarted')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'context.compactionCompleted')).toHaveLength(1);
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
    transport.emitPermissionRequest({
      kind: 'confirm_tool',
      id: 'request-interrupted',
      toolName: 'Bash',
      input: { command: 'npm test' },
      allowConversation: false,
      allowAlways: false,
    });

    await expect(driver.interrupt(persistedAgent)).resolves.toStrictEqual({
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transport: 'stdio' },
      turnId: sendResult.turnId,
    });
    expect(transport.lastHandle.interrupt).toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({
      agentId: persistedAgent.id,
      turnId: sendResult.turnId,
      type: 'clientRequest.resolved',
      payload: { id: 'request-interrupted' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      turnId: sendResult.turnId,
      type: 'turn.completed',
      payload: { turn: { id: sendResult.turnId, status: 'interrupted' } },
    }));
  });

  it('uses persisted Claude model and effort defaults and keeps them on the session', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const configuredAgent: Agent = {
      ...agent,
      backendDefaults: {
        kind: 'claude',
        model: 'haiku',
        reasoningEffort: 'low',
      },
    };

    const sendResult = driver.sendPrompt(configuredAgent, 'use my defaults');
    expect(transport.startTurn).toHaveBeenCalledWith(expect.objectContaining({
      model: 'haiku',
      effort: 'low',
    }), expect.any(Function), expect.any(Function));

    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-defaults' });
    await expect(sendResult).resolves.toStrictEqual({
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-defaults',
        transport: 'stdio',
        model: 'haiku',
        reasoningEffort: 'low',
      },
      turnId: expect.stringMatching(/^claude-turn-/),
    });
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

  it('discovers the available Claude models before the first prompt', async () => {
    const transport = createFakeTransport();
    transport.discoverModels.mockResolvedValue([{
      value: 'claude-fable-1',
      resolvedModel: 'claude-fable-1-20260810',
      displayName: 'Fable',
      description: 'Experimental coding model',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium'],
    }]);
    const driver = new ClaudeBackendDriver(transport);

    await expect(driver.listModels(agent)).resolves.toEqual([expect.objectContaining({
      id: 'claude-fable-1',
      displayName: 'Fable',
      providerMetadata: { resolvedModel: 'claude-fable-1-20260810' },
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: expect.any(String) },
        { reasoningEffort: 'medium', description: expect.any(String) },
      ],
    })]);
    expect(transport.discoverModels).toHaveBeenCalledWith({ cwd: agent.folder });
    expect(driver.getCapabilities(agent)).toMatchObject({ reasoningEffort: true });
  });

  it('publishes the live Agent SDK model catalog and supported reasoning efforts after initialization', async () => {
    const transport = createFakeTransport();
    transport.listModels.mockResolvedValue([{
      value: 'claude-sonnet-4-5',
      displayName: 'Sonnet 4.5',
      description: 'Balanced for coding',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'high'],
    }]);
    const driver = new ClaudeBackendDriver(transport);
    const events: unknown[] = [];
    driver.onEvent((event) => events.push(event));

    const started = driver.sendPrompt(agent, 'hello', { reasoningEffort: 'high' });
    expect(transport.startTurn).toHaveBeenCalledWith(expect.objectContaining({ effort: 'high' }), expect.any(Function), expect.any(Function));
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-catalog' });
    await started;
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: 'models.changed',
      payload: {
        models: [expect.objectContaining({
          id: 'claude-sonnet-4-5',
          supportedReasoningEfforts: [
            { reasoningEffort: 'low', description: expect.any(String) },
            { reasoningEffort: 'high', description: expect.any(String) },
          ],
          defaultReasoningEffort: 'high',
        })],
      },
    })));
    expect(driver.getCapabilities(agent)).toMatchObject({ reasoningEffort: true });
    await expect(driver.listModels(agent)).resolves.toEqual([expect.objectContaining({ id: 'claude-sonnet-4-5' })]);
  });

  it('releases an idle live query when the agent starts a different conversation', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);

    const first = driver.sendPrompt(agent, 'first conversation');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-first' });
    await first;
    transport.emit({ type: 'result', subtype: 'success', session_id: 'claude-session-first', is_error: false });

    const second = driver.sendPrompt(agent, 'new conversation');
    expect(transport.closeSession).toHaveBeenCalledWith('claude-session-first');
    await vi.waitFor(() => expect(transport.startTurn).toHaveBeenCalledTimes(2));
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-second' });
    await second;
    transport.emit({ type: 'result', subtype: 'success', session_id: 'claude-session-second', is_error: false });
    driver.forgetAgentSession(agent.id);
    expect(transport.closeSession).toHaveBeenLastCalledWith('claude-session-second');
  });

  it('exposes capabilities and rejects operations that have no valid Claude session context', async () => {
    const transport = createFakeTransport();
    const historyLoader = vi.fn().mockResolvedValue(null);
    const driver = new ClaudeBackendDriver(transport, historyLoader);

    expect(driver.getRuntimeStatus()).toStrictEqual({
      backend: 'claude',
      status: 'notConfigured',
      detail: 'Claude backend has not been started yet.',
    });
    expect(driver.getCapabilities(agent)).toMatchObject({ attachments: true, approvals: true });
    await expect(driver.interrupt(agent)).rejects.toThrow('No active Claude turn');
    await expect(driver.respondToRequest({ id: 'request-1', payload: {} })).rejects.toThrow('no longer pending');
    await expect(driver.hydrateAgent(agent)).resolves.toBeNull();
    await expect(driver.resumeConversation(agent, { backend: 'codex', threadId: 'thread-1' })).rejects.toThrow('non-Claude');
    await expect(driver.readConversationMessages({ backend: 'codex', threadId: 'thread-1' }, agent.id)).rejects.toThrow('non-Claude');

    const first = driver.sendPrompt(agent, 'first');
    await expect(driver.sendPrompt(agent, 'second')).rejects.toThrow('already has an active turn');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-first' });
    await first;
    await driver.interrupt(agent);
  });

  it('normalizes startup failures and an early clean exit before Claude reports a session', async () => {
    const missingTransport = createFakeTransport();
    const missingDriver = new ClaudeBackendDriver(missingTransport);
    const missing = missingDriver.sendPrompt(agent, 'missing executable');
    missingTransport.rejectDone(new Error('spawn claude ENOENT'));
    await expect(missing).rejects.toThrow('Claude Code CLI was not found');

    const earlyTransport = createFakeTransport();
    const earlyDriver = new ClaudeBackendDriver(earlyTransport);
    const early = earlyDriver.sendPrompt(agent, 'exit early');
    earlyTransport.resolveDone();
    await expect(early).rejects.toThrow('exited before reporting a session id');
  });

  it('unsubscribes listeners and closes active persisted turns', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const listener = vi.fn();
    const unsubscribe = driver.onEvent(listener);
    unsubscribe();
    const persistedAgent: Agent = {
      ...agent,
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transport: 'stdio' },
    };

    await driver.sendPrompt(persistedAgent, 'keep working');
    await driver.close();

    expect(transport.lastHandle.interrupt).toHaveBeenCalledOnce();
    expect(transport.close).toHaveBeenCalledOnce();
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

  it('maps Agent SDK permission requests through the app-owned approval contract', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; turnId?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'edit the file');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-approval' });
    const turnId = (await sendResult).turnId;
    transport.emitPermissionRequest({
      kind: 'confirm_tool',
      id: 'tool-edit-1',
      toolName: 'Edit',
      input: { file_path: '/tmp/project/a.ts' },
      title: 'Claude wants to edit a.ts',
      displayName: 'Edit file',
      description: 'Claude will modify a.ts.',
      allowConversation: true,
      allowAlways: false,
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'approval.requested',
      turnId,
      payload: {
        id: 'tool-edit-1',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: '{\n  "file_path": "/tmp/project/a.ts"\n}',
            integrationId: 'claude',
            integrationName: 'Claude',
            summary: 'Claude wants to edit a.ts',
            toolName: 'Edit',
            allowConversation: true,
            allowAlways: false,
          },
        },
      },
    }));

    transport.respondToPermissionRequest.mockResolvedValueOnce(undefined);
    await driver.respondToRequest({
      id: 'tool-edit-1',
      payload: { decision: 'allow_conversation' },
    });
    expect(transport.respondToPermissionRequest).toHaveBeenCalledWith('tool-edit-1', { decision: 'allow_conversation' });
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-claude',
      backendSessionId: 'claude-session-approval',
      type: 'clientRequest.resolved',
      turnId,
      payload: { id: 'tool-edit-1' },
    }));
  });

  it('maps Claude AskUserQuestion through the app-owned question contract', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; turnId?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'clarify first');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-question' });
    const turnId = (await sendResult).turnId;
    transport.emitPermissionRequest({
      kind: 'ask_user',
      id: 'request-question-1',
      toolName: 'AskUserQuestion',
      input: { questions: [] },
      allowConversation: false,
      allowAlways: false,
      questions: [{
        id: 'Which approach?',
        header: 'Approach',
        question: 'Which approach?',
        isOther: true,
        isSecret: false,
        options: [{ label: 'Simple', description: 'Small change.' }],
      }],
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'toolInput.requested',
      turnId,
      payload: {
        id: 'request-question-1',
        kind: 'ask_user',
        payload: {
          request: {
            itemId: 'request-question-1',
            questions: [{
              id: 'Which approach?',
              header: 'Approach',
              question: 'Which approach?',
              isOther: true,
              isSecret: false,
              options: [{ label: 'Simple', description: 'Small change.' }],
            }],
          },
        },
      },
    }));

    transport.respondToPermissionRequest.mockResolvedValueOnce(undefined);
    const answers = { 'Which approach?': { answers: ['Simple'] } };
    await driver.respondToRequest({ id: 'request-question-1', payload: { answers } });
    expect(transport.respondToPermissionRequest).toHaveBeenCalledWith('request-question-1', { answers });
  });

  it('hydrates persisted Claude transcript history through the driver', async () => {
    const transport = createFakeTransport();
    transport.readContextUsage.mockResolvedValueOnce({
      totalTokens: 33_120,
      maxTokens: 200_000,
      percentage: 16.56,
    });
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
    await vi.waitFor(() => expect(transport.readContextUsage).toHaveBeenCalledOnce());
    expect(transport.readContextUsage).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'agent-claude',
      cwd: '/Users/nbonamy/src/codex-claw',
      sessionId: 'claude-session-existing',
    }));
    expect(transport.readContextUsage.mock.calls[0]?.[0]).not.toHaveProperty('prompt');
    await vi.waitFor(() => expect(events).toHaveLength(2));
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
      expect.objectContaining({
        agentId: 'agent-claude',
        backend: 'claude',
        backendSessionId: 'claude-session-existing',
        threadId: 'claude-session-existing',
        type: 'thread.tokenUsageUpdated',
        payload: {
          contextUsage: {
            totalTokens: 33_120,
            inputTokens: 33_120,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            lastTotalTokens: 33_120,
            modelContextWindow: 200_000,
            usedPercent: 16.56,
          },
        },
      }),
    ]);
  });

  it('reads historical conversation messages from Claude transcript refs', async () => {
    const transport = createFakeTransport();
    const messages = [{
      id: 'user-claude-session-existing-user-1',
      agentId: 'agent-claude',
      role: 'user' as const,
      status: 'complete' as const,
      turnId: 'claude-prompt-1',
      createdAt: '2026-06-06T22:33:42.809Z',
      parts: [{ type: 'text' as const, text: 'hello' }],
    }];
    const historyLoader = vi.fn().mockResolvedValue({
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transcriptSessionId: 'claude-session-existing', transport: 'stdio' },
      messages,
    });
    const driver = new ClaudeBackendDriver(transport, historyLoader);

    await expect(driver.readConversationMessages({
      backend: 'claude',
      folder: '/Users/nbonamy/src/id8',
      sessionId: 'claude-session-existing',
    }, 'agent-claude')).resolves.toStrictEqual(messages);
    expect(historyLoader).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-claude',
      folder: '/Users/nbonamy/src/id8',
      backend: 'claude',
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-existing',
        transport: 'stdio',
      },
    }));
  });

  it('resumes Claude conversations from transcript refs', async () => {
    const transport = createFakeTransport();
    transport.readContextUsage.mockResolvedValueOnce({
      totalTokens: 12_000,
      maxTokens: 200_000,
      percentage: 6,
    });
    const messages = [{
      id: 'user-claude-session-existing-user-1',
      agentId: 'agent-claude',
      role: 'user' as const,
      status: 'complete' as const,
      turnId: 'claude-prompt-1',
      createdAt: '2026-06-06T22:33:42.809Z',
      parts: [{ type: 'text' as const, text: 'hello' }],
    }];
    const historyLoader = vi.fn().mockResolvedValue({
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transcriptSessionId: 'claude-session-existing', transport: 'stdio' },
      messages,
    });
    const driver = new ClaudeBackendDriver(transport, historyLoader);
    const events: unknown[] = [];
    driver.onEvent((event) => events.push(event));

    await expect(driver.resumeConversation(agent, {
      backend: 'claude',
      folder: '/Users/nbonamy/src/codex-claw',
      sessionId: 'claude-session-existing',
    })).resolves.toStrictEqual({
      backendSession: { kind: 'claude', sessionId: 'claude-session-existing', transcriptSessionId: 'claude-session-existing', transport: 'stdio' },
      messages,
    });
    expect(historyLoader).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-claude',
      folder: '/Users/nbonamy/src/codex-claw',
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-existing',
        transport: 'stdio',
      },
    }));
    await vi.waitFor(() => expect(transport.readContextUsage).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'claude-session-existing',
    })));
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: 'thread.tokenUsageUpdated',
      threadId: 'claude-session-existing',
      payload: { contextUsage: expect.objectContaining({ totalTokens: 12_000, usedPercent: 6 }) },
    })));
  });

  it('rejects Claude conversation refs from another folder', async () => {
    const transport = createFakeTransport();
    const historyLoader = vi.fn();
    const driver = new ClaudeBackendDriver(transport, historyLoader);

    await expect(driver.resumeConversation(agent, {
      backend: 'claude',
      folder: '/Users/nbonamy/src/id8',
      sessionId: 'claude-session-existing',
    })).rejects.toThrow('Claude conversation folder does not match the agent folder.');
    expect(historyLoader).not.toHaveBeenCalled();
  });

  it('maps plan mode to the Agent SDK plan permission mode without changing the prompt text', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const sendResult = driver.sendPrompt(agent, 'build the thing', { planMode: true });

    expect(transport.startTurn.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'build the thing',
      permissionMode: 'plan',
    });

    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-plan' });
    await expect(sendResult).resolves.toMatchObject({
      backendSession: { kind: 'claude', sessionId: 'claude-session-plan', transport: 'stdio' },
    });
  });

  it('passes provider-neutral attachment descriptors to the Claude transport', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const attachments = [{ type: 'file' as const, path: '/tmp/report.txt', name: 'report.txt' }];

    const sendResult = driver.sendPrompt(agent, 'review this', { attachments });

    expect(transport.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'review this', attachments }),
      expect.any(Function),
      expect.any(Function),
    );
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-attachments' });
    await expect(sendResult).resolves.toMatchObject({
      backendSession: { kind: 'claude', sessionId: 'claude-session-attachments' },
    });
  });

  it('maps Claude plan-mode tool flow into app-owned proposed plan events', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; turnId?: string; threadId?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'draft the plan', { planMode: true });
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-plan' });
    const turnId = (await sendResult).turnId;

    transport.emit({
      type: 'system',
      subtype: 'status',
      session_id: 'claude-session-plan',
      permissionMode: 'plan',
    });
    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-plan',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tool-search-plan', name: 'ToolSearch', input: {} },
      },
    });
    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-plan',
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'write-plan', name: 'Write', input: {} },
      },
    });
    const writeInput = JSON.stringify({
      file_path: '/Users/nbonamy/.claude/plans/test-plan.md',
      content: '# Draft Plan\n\n- inspect\n',
    });
    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-plan',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: writeInput.slice(0, 30) },
      },
    });
    transport.emit({
      type: 'stream_event',
      session_id: 'claude-session-plan',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: writeInput.slice(30) },
      },
    });
    transport.emit({
      type: 'assistant',
      session_id: 'claude-session-plan',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'exit-plan',
            name: 'ExitPlanMode',
            input: {
              plan: '# Final Plan\n\n- inspect\n- implement\n',
              planFilePath: '/Users/nbonamy/.claude/plans/test-plan.md',
            },
          },
        ],
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'thread.modeUpdated',
      turnId,
      threadId: 'claude-session-plan',
      payload: {
        mode: 'plan',
        provider: 'claude',
        permissionMode: 'plan',
      },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.proposedPlanDelta',
      turnId,
      threadId: 'claude-session-plan',
      payload: {
        itemId: 'write-plan',
        delta: '# Draft Plan\n\n- inspect\n',
      },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'turn.proposedPlanCompleted',
      turnId,
      threadId: 'claude-session-plan',
      payload: {
        itemId: 'exit-plan',
        markdown: '# Final Plan\n\n- inspect\n- implement',
      },
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'item.started',
      payload: expect.objectContaining({
        toolPart: expect.objectContaining({
          title: expect.stringMatching(/EnterPlanMode|ExitPlanMode|ToolSearch|Write/),
        }),
      }),
    }));
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
          kind: 'command',
          title: 'Bash',
          status: 'running',
          input: { cwd: '/Users/nbonamy/src/codex-claw' },
        }),
      },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      turnId,
      type: 'item.updated',
      payload: expect.objectContaining({
        itemId: 'tool-streamed',
        title: 'npm test',
        statusText: JSON.stringify({
          source: 'claude',
          action: 'run',
          phase: 'running',
          params: { target: 'npm test' },
        }),
        input: { command: 'npm test', cwd: '/Users/nbonamy/src/codex-claw' },
      }),
    }));
  });

  it('emits semantic file activity and completes file tool status', async () => {
    const transport = createFakeTransport();
    const driver = new ClaudeBackendDriver(transport);
    const events: Array<{ type?: string; turnId?: string; payload?: unknown }> = [];
    driver.onEvent((event) => events.push(event));

    const sendResult = driver.sendPrompt(agent, 'edit the readme');
    transport.emit({ type: 'system', subtype: 'init', session_id: 'claude-session-files' });
    const turnId = (await sendResult).turnId;

    transport.emit({
      type: 'assistant',
      session_id: 'claude-session-files',
      message: {
        content: [{
          type: 'tool_use',
          id: 'tool-edit',
          name: 'Edit',
          input: {
            file_path: '/workspace/project/README.md',
            old_string: 'Old title',
            new_string: 'New title\nNew subtitle',
          },
        }],
      },
    });
    transport.emit({
      type: 'user',
      session_id: 'claude-session-files',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-edit',
          content: 'Updated README.md',
        }],
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'item.started',
      turnId,
      payload: {
        toolPart: expect.objectContaining({
          id: 'tool-edit',
          kind: 'fileChange',
          title: '1 file change',
          statusText: JSON.stringify({
            source: 'claude',
            action: 'edit',
            phase: 'running',
            params: { target: 'README.md', addedLines: 2, removedLines: 1 },
          }),
        }),
      },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'item.updated',
      turnId,
      payload: expect.objectContaining({
        itemId: 'tool-edit',
        status: 'completed',
        statusText: JSON.stringify({
          source: 'claude',
          action: 'edit',
          phase: 'completed',
          params: { target: 'README.md', addedLines: 2, removedLines: 1 },
        }),
      }),
    }));
    expect(events.filter((event) => event.type === 'file.activity')).toStrictEqual([
      expect.objectContaining({
        turnId,
        payload: {
          messageId: `assistant-${turnId}`,
          itemId: 'tool-edit',
          path: '/workspace/project/README.md',
          action: 'edit',
          status: 'running',
        },
      }),
      expect.objectContaining({
        turnId,
        payload: {
          messageId: `assistant-${turnId}`,
          itemId: 'tool-edit',
          path: '/workspace/project/README.md',
          action: 'edit',
          status: 'completed',
        },
      }),
    ]);
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
  emitPermissionRequest(request: import('../cli-transport').ClaudePermissionRequest): void;
  rejectDone(error: Error): void;
  resolveDone(): void;
  lastHandle: ClaudeTurnHandle & { interrupt: ReturnType<typeof vi.fn> };
  startTurn: ReturnType<typeof vi.fn<(params: ClaudeTurnParams, onMessage: (message: ClaudeSdkMessage) => void) => ClaudeTurnHandle>>;
  respondToPermissionRequest: ReturnType<typeof vi.fn>;
  closeSession: ReturnType<typeof vi.fn>;
  discoverModels: ReturnType<typeof vi.fn>;
  listModels: ReturnType<typeof vi.fn>;
  getContextUsage: ReturnType<typeof vi.fn>;
  readContextUsage: ReturnType<typeof vi.fn>;
} {
  let onMessage: (message: ClaudeSdkMessage) => void = () => undefined;
  let onPermissionRequest: (request: import('../cli-transport').ClaudePermissionRequest) => void = () => undefined;
  let rejectDone: (error: Error) => void = () => undefined;
  let resolveDone: () => void = () => undefined;
  const lastHandle = {
    done: new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    }),
    interrupt: vi.fn().mockResolvedValue(undefined),
  };
  return {
    lastHandle,
    startTurn: vi.fn((
      _: ClaudeTurnParams,
      listener: (message: ClaudeSdkMessage) => void,
      permissionListener?: (request: import('../cli-transport').ClaudePermissionRequest) => void,
    ) => {
      onMessage = listener;
      onPermissionRequest = permissionListener ?? (() => undefined);
      return lastHandle;
    }),
    emit: (message: ClaudeSdkMessage) => {
      onMessage(message);
    },
    emitPermissionRequest: (request) => {
      onPermissionRequest(request);
    },
    rejectDone: (error: Error) => {
      rejectDone(error);
    },
    resolveDone: () => {
      resolveDone();
    },
    respondToPermissionRequest: vi.fn().mockRejectedValue(new Error("Claude permission request 'request-1' is no longer pending.")),
    closeSession: vi.fn().mockResolvedValue(undefined),
    discoverModels: vi.fn().mockResolvedValue(null),
    listModels: vi.fn().mockResolvedValue(null),
    getContextUsage: vi.fn().mockResolvedValue(null),
    readContextUsage: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
