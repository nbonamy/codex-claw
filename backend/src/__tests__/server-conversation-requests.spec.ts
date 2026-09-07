import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { Agent, AgentGitStatus, AppSnapshot, BackendConversationRef, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem } from '@codex-claw/core/contracts';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/core/backend-driver';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import {
  createTestSnapshot,
  flushMicrotasks,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('owns prompt dispatch and conversation title assignment', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 15, 42));
    try {
      const snapshot = createTestSnapshot();
      snapshot.teams[0]!.agentIds = ['agent-dina'];
      snapshot.agents = [{
        id: 'agent-dina',
        teamId: 'team-test',
        name: 'Dina',
        folder: '/Users/nbonamy/src/codex-claw',
        backend: 'codex',
        status: { type: 'idle' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      }];
      const sendPrompt = vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
        turnId: 'turn-1',
      });
      const setConversationTitle = vi.fn().mockResolvedValue(undefined);
      const driver: AgentBackendDriver = {
        backend: 'codex',
        getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
        getCapabilities: () => codexBackendCapabilities,
        sendPrompt,
        interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
        respondToRequest: async () => undefined,
        setConversationTitle,
        onEvent: () => () => undefined,
        close: async () => undefined,
      };
      const events: unknown[] = [];
      const saveSnapshot = vi.fn().mockResolvedValue(undefined);
      const server = new ClawBackendServer({
        version: 'test-version',
        pid: 123,
        snapshot,
        saveSnapshot,
        onEvent: (event) => events.push(event),
        driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      });

      const response = await server.handleMessage({
        jsonrpc: '2.0',
        id: 'send',
        method: 'agent/prompt/send',
        params: { agentId: 'agent-dina', prompt: ' hello codex ' },
      });
      expect(response).toMatchObject({
        result: {
          agents: [{ id: 'agent-dina', status: { type: 'starting' } }],
        },
      });
      expect((response as { result: Record<string, unknown> }).result).not.toHaveProperty('messages');
      await flushMicrotasks();

      expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'hello codex', undefined);
      expect(snapshot.agents[0]?.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-dina' });
      expect(snapshot.agents[0]?.conversationTitle).toBe('Dina');
      expect(snapshot.agents[0]?.status).toStrictEqual({ type: 'working' });
      expect(setConversationTitle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-dina' } }),
        'Dina',
      );
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'agent.statusChanged', payload: { type: 'starting' } }),
        expect.objectContaining({ type: 'backend.statusChanged', payload: expect.objectContaining({ backend: 'codex', status: 'starting' }) }),
        expect.objectContaining({ type: 'agent.statusChanged', payload: { type: 'working' } }),
      ]));
      await server.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renames the active conversation when the Claw agent name changes', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      workspace: {
        kind: 'git',
        folder: '/Users/nbonamy/src/codex-claw-work-routing',
        repositoryName: 'codex-claw',
        repositoryRoot: '/Users/nbonamy/src/codex-claw-work-routing',
        branch: 'codex-claw-work-routing',
        isLinkedWorktree: true,
        primaryWorktreeRoot: '/Users/nbonamy/src/codex-claw',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
      status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const titleSyncResolves: Array<() => void> = [];
    const setConversationTitle = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      titleSyncResolves.push(resolve);
    }));
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-dina' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-dina' } }),
      respondToRequest: async () => undefined,
      setConversationTitle,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    const renameResponse = server.handleMessage({
      jsonrpc: '2.0',
      id: 'rename-agent',
      method: 'agent/update',
      params: {
        input: {
          id: 'agent-dina',
          name: 'Dina Renamed',
        },
      },
    });
    await flushMicrotasks();
    expect(saveSnapshot).toHaveBeenCalledOnce();
    await expect(renameResponse).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', name: 'Dina Renamed', conversationTitle: 'Dina Renamed' }],
      },
    });

    const clearResponse = server.handleMessage({
      jsonrpc: '2.0',
      id: 'clear-agent-name',
      method: 'agent/update',
      params: { input: { id: 'agent-dina', name: null } },
    });
    await flushMicrotasks();
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    await expect(clearResponse).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', name: null, conversationTitle: 'work-routing' }],
      },
    });

    expect(setConversationTitle).toHaveBeenCalledTimes(2);
    expect(setConversationTitle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'agent-dina' }),
      'Dina Renamed',
    );
    expect(setConversationTitle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'agent-dina', name: null }),
      'work-routing',
    );
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    for (const resolveTitleSync of titleSyncResolves) resolveTitleSync();
    await flushMicrotasks();
    await server.close();
  });

  it('keeps slash command prompts hidden while starting the backend turn', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const commandResult = Promise.resolve({
      backendSession: { kind: 'codex' as const, threadId: 'thread-command' },
      turnId: 'turn-command',
    });
    const tryHandlePromptCommand = vi.fn().mockReturnValue(commandResult);
    const sendPrompt = vi.fn();
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt,
      tryHandlePromptCommand,
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'send',
      method: 'agent/prompt/send',
      params: { agentId: 'agent-dina', prompt: '/compact' },
    });
    await flushMicrotasks();

    expect(tryHandlePromptCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), '/compact');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.agents[0]?.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-command' });
    await server.close();
  });

  it('owns queued prompt draining and dequeues only after backend acceptance', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina', teamId: 'team-test', name: 'Dina', folder: '/workspace/dina', backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-dina' }, status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z', updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    let acceptPrompt!: (value: { backendSession: { kind: 'codex'; threadId: string }; turnId: string }) => void;
    const sendPrompt = vi.fn().mockReturnValue(new Promise((resolve) => { acceptPrompt = resolve; }));
    const onPromptStarting = vi.fn();
    const events: Array<{ type: string; snapshot?: AppSnapshot; payload: unknown }> = [];
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt,
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-dina' } }),
      respondToRequest: async () => undefined,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version', pid: 123, snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      onEvent: (event) => events.push(event),
      onPromptStarting,
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'queue', method: 'agent/prompt/send',
      params: {
        agentId: 'agent-dina',
        prompt: 'run next',
        options: {
          attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }],
          inputMethod: 'dictated',
        },
      },
    });
    expect(snapshot.queuedPrompts).toEqual([expect.objectContaining({
      agentId: 'agent-dina',
      text: 'run next',
      options: {
        attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }],
        inputMethod: 'dictated',
      },
    })]);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(onPromptStarting).not.toHaveBeenCalled();

    server.emitEvent({
      agentId: 'agent-dina', backend: 'codex', threadId: 'thread-dina',
      type: 'codex.conversationEventReceived',
      payload: {
        revision: 2,
        event: {
          seq: 2,
          occurredAt: '2026-06-13T00:00:01.000Z',
          origin: 'notification',
          conversationId: 'thread-dina',
          turnId: 'turn-old',
          type: 'turn.completed',
          payload: {
            status: 'completed', error: null, willRetry: false,
            startedAt: null, completedAt: '2026-06-13T00:00:01.000Z', durationMs: null,
          },
        },
      },
    });
    server.emitEvent({
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    });
    expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'run next', {
      attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }],
      inputMethod: 'dictated',
    });
    expect(onPromptStarting).toHaveBeenCalledWith('agent-dina', {
      attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }],
      inputMethod: 'dictated',
    });
    expect(snapshot.queuedPrompts).toHaveLength(1);

    acceptPrompt({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-next' });
    await vi.waitFor(() => expect(snapshot.queuedPrompts).toStrictEqual([]));
    await server.close();
  });

  it('updates queued prompt text in place and steers edited text atomically', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina', teamId: 'team-test', name: 'Dina', folder: '/workspace/dina', backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-dina' }, status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z', updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.queuedPrompts = [
      { id: 'queued-1', agentId: 'agent-dina', text: 'first', createdAt: '2026-06-13T00:00:01.000Z' },
      {
        id: 'queued-2',
        agentId: 'agent-dina',
        text: 'second',
        createdAt: '2026-06-13T00:00:02.000Z',
        options: { attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }] },
      },
    ];
    const steerPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      turnId: 'turn-steered',
    });
    const events: Array<{ type: string; payload: unknown }> = [];
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: vi.fn(),
      steerPrompt,
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-dina' } }),
      respondToRequest: async () => undefined,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version', pid: 123, snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      onEvent: (event) => events.push(event),
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'update', method: 'agent/queuedPrompt/update',
      params: { agentId: 'agent-dina', promptId: 'queued-2', prompt: 'edited second' },
    });

    expect(snapshot.queuedPrompts).toStrictEqual([
      expect.objectContaining({ id: 'queued-1', text: 'first' }),
      expect.objectContaining({
        id: 'queued-2',
        text: 'edited second',
        options: { attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }] },
      }),
    ]);

    await server.handleMessage({
      jsonrpc: '2.0', id: 'steer', method: 'agent/queuedPrompt/steer',
      params: { agentId: 'agent-dina', promptId: 'queued-2', prompt: 'edited steer' },
    });

    expect(steerPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      'edited steer',
      { attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }] },
    );
    expect(snapshot.queuedPrompts).toEqual([
      expect.objectContaining({ id: 'queued-1', text: 'first' }),
    ]);
    await server.close();
  });

  it('retries failed queue drains without losing the item', async () => {
    vi.useFakeTimers();
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina', teamId: 'team-test', name: 'Dina', folder: '/workspace/dina', backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-dina' }, status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z', updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const sendPrompt = vi.fn()
      .mockRejectedValueOnce(new Error('transport disconnected'))
      .mockResolvedValueOnce({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-retry' });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt,
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-dina' } }),
      respondToRequest: async () => undefined,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version', pid: 123, snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'queue', method: 'agent/prompt/send',
      params: { agentId: 'agent-dina', prompt: 'retry safely' },
    });
    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(snapshot.queuedPrompts).toHaveLength(1);
    expect(snapshot.queuedPrompts?.[0]).toMatchObject({
      text: 'retry safely',
      attempts: 1,
      lastError: 'transport disconnected',
    });
    expect(snapshot.agents[0]?.status).toStrictEqual({ type: 'error', message: 'transport disconnected' });
    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();
    expect(sendPrompt).toHaveBeenCalledTimes(2);
    expect(snapshot.queuedPrompts).toStrictEqual([]);
    await server.close();
    vi.useRealTimers();
  });

  it('routes turn retry and edit through the backend driver', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-old' },
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const retryTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      activeTurnId: 'turn-new',
    });
    const editTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      activeTurnId: 'turn-edited',
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      editTurn,
      retryTurn,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'retry',
      method: 'agent/turn/retry',
      params: { agentId: 'agent-dina', turnId: 'turn-1' },
    });

    expect(retryTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'turn-1');

    snapshot.agents[0]!.status = { type: 'idle' };
    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'edit',
      method: 'agent/turn/edit',
      params: { agentId: 'agent-dina', turnId: 'turn-1', content: ' edited prompt ' },
    });

    expect(editTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'turn-1', 'edited prompt');
    await server.close();
  });
});
