import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/core/backend-driver';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { snapshotMetadata } from '@codex-claw/core/snapshot';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import { CodexBackendDriver } from '../codex/codex-driver';
import type { CodexSurfaceAgentAdapter } from '../codex/codex-surface-adapter';
import {
  createTestSnapshot,
  createTextMessage,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('refreshes git status only when the active agent turn completes', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina', 'agent-jesse'];
    snapshot.activeAgentId = 'agent-dina';
    snapshot.agents = [
      {
        id: 'agent-dina',
        teamId: 'team-test',
        name: 'Dina',
        folder: '/Users/nbonamy/src/codex-claw',
        backend: 'codex',
        status: { type: 'working' },
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      {
        id: 'agent-jesse',
        teamId: 'team-test',
        name: 'Jesse',
        folder: '/Users/nbonamy/src/multi-llm-ts',
        backend: 'codex',
        status: { type: 'working' },
        backendSession: { kind: 'codex', threadId: 'thread-jesse' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
    ];
    let emitEvent: (event: BackendEvent) => void = () => undefined;
    const getGitStatus = vi.fn().mockResolvedValue({
      folder: '/Users/nbonamy/src/codex-claw',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 1,
      addedLines: 3,
      removedLines: 1,
      hasUntracked: false,
      state: 'dirty',
      updatedAt: '2026-06-13T00:00:01.000Z',
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      getGitStatus,
      onEvent: (listener) => {
        emitEvent = listener;
        return () => undefined;
      },
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    emitEvent({
      backend: 'codex',
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-test',
      type: 'file.activity',
      payload: {
        messageId: 'assistant-turn-test',
        itemId: 'edit-file',
        path: '/Users/nbonamy/src/codex-claw/README.md',
        action: 'edit',
        status: 'completed',
      },
    });
    emitEvent({
      backend: 'codex',
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-test',
      type: 'diff.updated',
      payload: { addedLines: 3, removedLines: 1, diff: 'diff --git a/README.md b/README.md\n' },
    });
    emitEvent({
      backend: 'codex',
      agentId: 'agent-jesse',
      threadId: 'thread-jesse',
      turnId: 'turn-jesse',
      type: 'turn.completed',
      payload: { status: 'completed' },
    });
    await Promise.resolve();
    expect(getGitStatus).not.toHaveBeenCalled();

    emitEvent({
      backend: 'codex',
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      type: 'codex.conversationEventReceived',
      payload: {
        revision: 4,
        event: {
          seq: 4,
          occurredAt: '2026-06-13T00:00:02.000Z',
          origin: 'notification',
          conversationId: 'thread-dina',
          turnId: 'turn-test',
          type: 'turn.completed',
          payload: {
            status: 'completed', error: null, willRetry: false,
            startedAt: null, completedAt: '2026-06-13T00:00:02.000Z', durationMs: null,
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(getGitStatus).toHaveBeenCalledOnce();
      expect(snapshot.agentGitStatuses['agent-dina']).toMatchObject({
        addedLines: 3,
        removedLines: 1,
        state: 'dirty',
      });
    });
    await server.close();
  });

  it('owns client request response routing', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    let emitEvent: (event: BackendEvent) => void = () => undefined;
    const respondToRequest = vi.fn().mockResolvedValue(undefined);
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest,
      onEvent: (listener) => {
        emitEvent = listener;
        return () => undefined;
      },
      close: async () => undefined,
    };
    const events: unknown[] = [];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      onEvent: (event) => events.push(event),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'unknown-response',
      method: 'client/request/respond',
      params: { response: { id: 'approval-missing', payload: { decision: 'allow' } } },
    })).resolves.toMatchObject({
      error: {
        message: "No backend owns client request 'approval-missing'.",
      },
    });

    emitEvent({
      agentId: 'agent-dina',
      type: 'approval.requested',
      payload: {
        id: 'approval-1',
        kind: 'confirm_tool',
        payload: { confirmation: { id: 'tool-1', title: 'Run tool', command: 'npm test' } },
      },
    } as unknown as BackendEvent);

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'known-response',
      method: 'client/request/respond',
      params: { response: { id: 'approval-1', payload: { decision: 'allow' } } },
    })).resolves.toMatchObject({
      result: snapshot,
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'approval.requested', agentId: 'agent-dina' }),
    ]));
    expect(respondToRequest).toHaveBeenCalledWith({ id: 'approval-1', payload: { decision: 'allow' } });
    await server.close();
  });

  it('routes native SDK approval responses through the Codex driver into its surface adapter', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    let emitAdapterEvent: (event: BackendEvent) => void = () => undefined;
    const respondToClientRequest = vi.fn().mockResolvedValue(undefined);
    const adapter = {
      onEvent: (listener: (event: BackendEvent) => void) => {
        emitAdapterEvent = listener;
        return () => undefined;
      },
      respondToClientRequest,
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as CodexSurfaceAgentAdapter;
    const driver = new CodexBackendDriver(adapter);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    emitAdapterEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-test',
      turnId: 'turn-test',
      type: 'backendApproval.requested',
      payload: {
        approval: {
          id: 'approval-native-1',
          kind: 'command',
          conversationId: 'thread-test',
          turnId: 'turn-test',
          itemId: 'item-test',
          title: 'Run command',
          command: 'npm test',
          allowedScopes: ['once', 'session'],
          canDeny: true,
        },
      },
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'native-approval-response',
      method: 'client/request/respond',
      params: {
        response: {
          id: 'approval-native-1',
          payload: { decision: 'allow_conversation' },
        },
      },
    })).resolves.toMatchObject({ result: snapshot });

    expect(respondToClientRequest).toHaveBeenCalledOnce();
    expect(respondToClientRequest).toHaveBeenCalledWith({
      id: 'approval-native-1',
      payload: { decision: 'allow_conversation' },
    });
    await server.close();
  });

  it('persists backend-owned snapshot changes for stateful events', async () => {
    const snapshot = createTestSnapshot();
    snapshot.messages.push(createTextMessage('message-large-transcript', 'agent-dina', 'large transcript'));
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const onEvent = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      onEvent,
    });

    server.emitEvent({
      agentId: 'agent-dina',
      type: 'snapshot.updated',
      payload: snapshot,
    });
    server.emitEvent({
      agentId: 'agent-dina',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        title: 'Readme',
        content: '# Readme',
      },
    });
    await Promise.resolve();

    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'snapshot.updated',
      payload: snapshotMetadata(snapshot),
    }));
  });

  it('defers high-frequency turn metadata persistence until completion', async () => {
    const snapshot = createTestSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
    });

    server.emitEvent({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-dina',
      type: 'thread.tokenUsageUpdated',
      payload: { contextUsage: { totalTokens: 100 } },
    } as unknown as BackendEvent);
    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-dina',
      type: 'turn.planUpdated',
      payload: { explanation: 'working', plan: [] },
    });
    expect(saveSnapshot).not.toHaveBeenCalled();

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-dina',
      type: 'turn.completed',
      payload: { status: 'completed' },
    });
    await Promise.resolve();
    expect(saveSnapshot).toHaveBeenCalledOnce();
  });

  it('persists subagent state as soon as semantic activity arrives', async () => {
    const snapshot = createTestSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({ version: 'test-version', pid: 123, snapshot, saveSnapshot });

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-root',
      turnId: 'turn-1',
      type: 'subagent.operationChanged',
      payload: {
        rootConversationId: 'thread-root',
        operation: {
          id: 'spawn-1',
          lifecycle: 'started',
          kind: 'spawnAgent',
          status: 'inProgress',
          senderConversationId: 'thread-root',
          receiverConversationIds: ['thread-child'],
          occurredAt: '2026-06-05T00:00:00.000Z',
        },
        agentStates: { 'thread-child': { status: 'running' } },
      },
    });
    await Promise.resolve();

    expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-child']?.status).toBe('running');
    expect(saveSnapshot).toHaveBeenCalledOnce();

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-root',
      type: 'subagent.identityChanged',
      payload: {
        rootConversationId: 'thread-root',
        conversationId: 'thread-child',
        agentNickname: 'Harvey',
        agentRole: 'worker',
      },
    });
    await Promise.resolve();

    expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-child']).toMatchObject({
      agentNickname: 'Harvey',
      agentRole: 'worker',
    });
    expect(saveSnapshot).toHaveBeenCalledTimes(2);

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-root',
      type: 'subagent.statusChanged',
      payload: {
        rootConversationId: 'thread-root',
        conversationId: 'thread-child',
        status: 'completed',
      },
    });
    await Promise.resolve();

    expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-child']?.status).toBe('completed');
    expect(saveSnapshot).toHaveBeenCalledTimes(3);
  });

  it('keeps execution plans passive and previews only proposed plans', () => {
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
    const events: unknown[] = [];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      onEvent: (event) => events.push(event),
    });

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: 'Current plan',
        plan: [
          { step: 'Inspect backend event', status: 'completed' },
          { step: 'Preview markdown', status: 'inProgress' },
        ],
      },
      occurredAt: '2026-06-13T00:00:00.000Z',
    });

    expect(snapshot.agents[0]?.plan?.markdown).toBe('Current plan\n- [x] Inspect backend event\n- [ ] Preview markdown');
    expect(events.some((event) => (
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      event.type === 'sidePanel.markdownRequested'
    ))).toBe(false);

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-13T00:00:01.000Z',
    });

    expect(events.some((event) => (
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      event.type === 'sidePanel.markdownRequested'
    ))).toBe(false);

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-proposed-plan',
      type: 'turn.proposedPlanCompleted',
      payload: { itemId: 'turn-proposed-plan-plan', markdown: '# Proposed plan\n\n- Build it' },
      occurredAt: '2026-06-13T00:00:02.000Z',
    });

    expect(events.filter((event) => (
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      event.type === 'sidePanel.markdownRequested'
    ))).toStrictEqual([expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-proposed-plan',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Proposed plan',
        content: '- Build it',
      },
    })]);
  });

  it('derives current-turn git diff side-panel preview events in clawd', () => {
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
    const events: unknown[] = [];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      onEvent: (event) => events.push(event),
    });
    const diff = 'diff --git a/a.ts b/a.ts\n';

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-diff',
      type: 'diff.updated',
      payload: {
        addedLines: 1,
        diff,
        removedLines: 0,
      },
    });

    expect(snapshot.turnGitDiffs['turn-diff']).toMatchObject({ diff });
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-diff',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        scope: 'turn',
        title: { key: 'panels.gitDiff' },
        subtitle: { key: 'panels.currentTurn' },
        diff,
      },
    }));
  });
});
