import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/core/backend-driver';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import {
  createTestSnapshot,
  createTextMessage,
  createThreadGoal,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('owns agent restart and conversation resume mutations', async () => {
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
    snapshot.messages = [
      createTextMessage('old-dina', 'agent-dina', 'old'),
      createTextMessage('old-jesse', 'agent-jesse', 'keep'),
    ];
    const resumedMessages = [createTextMessage('new-dina', 'agent-dina', 'resumed')];
    const forgetAgentSession = vi.fn();
    const resumeConversation = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-new' },
      messages: resumedMessages,
    });
    const setConversationTitle = vi.fn().mockResolvedValue(undefined);
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forgetAgentSession,
      resumeConversation,
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

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'restart-agent',
      method: 'agent/restart',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina' }],
      },
    });
    expect(snapshot.agents[0]?.backendSession).toBeUndefined();
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resume-agent',
      method: 'agent/conversation/resume',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-new' } },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-new' } }],
      },
    });

    expect(forgetAgentSession).toHaveBeenCalledWith('agent-dina');
    expect(resumeConversation).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), { backend: 'codex', threadId: 'thread-new' });
    expect(setConversationTitle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-new' } }),
      'Dina',
    );
    expect(snapshot.messages.map((message) => [message.id, message.agentId])).toStrictEqual([
      ['old-jesse', 'agent-jesse'],
      ['new-dina', 'agent-dina'],
    ]);
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('forks a conversation into a selected agent directly below its source', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina', 'agent-jesse'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }, {
      id: 'agent-jesse',
      teamId: 'team-test',
      name: 'Jesse',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const forkedMessages = [createTextMessage('forked-message', 'agent-dina', 'forked')];
    const forkConversation = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-forked' },
      messages: forkedMessages,
      activeTurnId: 'turn-forked',
    });
    const setConversationTitle = vi.fn().mockResolvedValue(undefined);
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forkConversation,
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

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'fork-agent',
      method: 'agent/fork',
      params: { agentId: 'agent-dina', messageIndex: 2 },
    })).resolves.toMatchObject({
      result: {
        activeAgentId: expect.stringContaining('agent-'),
        agents: [
          { id: 'agent-dina' },
          {
            name: 'Dina (fork)',
            backendSession: { kind: 'codex', threadId: 'thread-forked' },
            status: { type: 'working' },
          },
          { id: 'agent-jesse' },
        ],
      },
    });

    const forkedAgentId = snapshot.agents[1]?.id;
    expect(forkConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-dina' }),
      expect.objectContaining({ name: 'Dina (fork)' }),
      2,
    );
    expect(setConversationTitle).toHaveBeenCalledWith(
      expect.objectContaining({ id: forkedAgentId, backendSession: { kind: 'codex', threadId: 'thread-forked' } }),
      'Dina (fork)',
    );
    expect(snapshot.teams[0]?.agentIds).toStrictEqual(['agent-dina', forkedAgentId, 'agent-jesse']);
    expect(snapshot.messages).toContainEqual(expect.objectContaining({ id: 'forked-message', agentId: forkedAgentId }));
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    await server.close();
  });

  it('owns goal and approval preset session mutations', async () => {
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
    const goal = createThreadGoal('thread-goal', 'Ship the goal shelf');
    const setConversationTitle = vi.fn().mockResolvedValue(undefined);
    const setGoal = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      goal,
    });
    const clearGoal = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      cleared: true,
    });
    const setApprovalPreset = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-approval' },
      approvalPreset: 'approve-for-me',
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      clearGoal,
      setApprovalPreset,
      setConversationTitle,
      setGoal,
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

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'set-goal',
      method: 'agent/goal/update',
      params: { agentId: 'agent-dina', objective: ' Ship the goal shelf ' },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-goal' }, goal }],
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'clear-goal',
      method: 'agent/goal/clear',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-goal' } }],
      },
    });
    expect(snapshot.agents[0]?.goal).toBeUndefined();
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'set-preset',
      method: 'agent/approvalPreset/update',
      params: { agentId: 'agent-dina', preset: 'approve-for-me' },
    })).resolves.toMatchObject({
      result: {
        agents: [{
          id: 'agent-dina',
          backendSession: { kind: 'codex', threadId: 'thread-approval' },
          backendDefaults: {
            kind: 'codex',
            approvalPreset: 'approve-for-me',
            approvalPolicy: 'on-request',
            approvalsReviewer: 'auto_review',
            sandboxMode: 'workspace-write',
          },
        }],
      },
    });

    expect(setGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'Ship the goal shelf');
    expect(clearGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(setApprovalPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'approve-for-me');
    expect(setConversationTitle).toHaveBeenCalledOnce();
    expect(setConversationTitle).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), expect.stringContaining('Dina'));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'thread.goalUpdated', payload: { goal } }),
      expect.objectContaining({ type: 'thread.goalCleared' }),
      expect.objectContaining({ type: 'snapshot.updated' }),
    ]));
    expect(saveSnapshot).toHaveBeenCalledTimes(3);
    await server.close();
  });

  it('persists Claude permission modes independently of Codex approval presets', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-claude'];
    snapshot.agents = [{
      id: 'agent-claude',
      teamId: 'team-test',
      name: 'Claude',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'claude',
      backendDefaults: { kind: 'claude', model: 'sonnet' },
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const setPermissionMode = vi.fn().mockResolvedValue({
      backendDefaults: { kind: 'claude', model: 'sonnet', permissionMode: 'bypassPermissions' },
    });
    const driver: AgentBackendDriver = {
      backend: 'claude',
      getRuntimeStatus: () => ({ backend: 'claude', status: 'running' }),
      getCapabilities: () => claudeBackendCapabilities,
      setPermissionMode,
      sendPrompt: async () => ({ backendSession: { kind: 'claude', sessionId: 'session-test', transport: 'stdio' } }),
      interrupt: async () => ({ backendSession: { kind: 'claude', sessionId: 'session-test', transport: 'stdio' } }),
      respondToRequest: async () => undefined,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map([['claude', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'set-permission-mode',
      method: backendMethods.agentPermissionModeUpdate,
      params: { agentId: 'agent-claude', mode: 'bypassPermissions' },
    })).resolves.toMatchObject({
      result: {
        agents: [{
          id: 'agent-claude',
          backendDefaults: { kind: 'claude', model: 'sonnet', permissionMode: 'bypassPermissions' },
        }],
      },
    });

    expect(setPermissionMode).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-claude' }), 'bypassPermissions');
    expect(snapshot.agents[0]?.backendSession).toBeUndefined();
    expect(saveSnapshot).toHaveBeenCalledOnce();
    await server.close();
  });

  it('owns steer and interrupt session mutations', async () => {
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
    const steerPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-steer' },
      turnId: 'turn-steer',
    });
    const interrupt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-interrupt' },
      turnId: 'turn-interrupt',
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt,
      respondToRequest: async () => undefined,
      steerPrompt,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const events: unknown[] = [];
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      onEvent: (event) => events.push(event),
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'steer',
      method: 'agent/prompt/steer',
      params: {
        agentId: 'agent-dina',
        prompt: ' try smaller ',
        options: { attachments: [{ type: 'file', path: '/tmp/notes.txt', name: 'notes.txt' }] },
      },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-steer' } }],
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'interrupt',
      method: 'agent/interrupt',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-interrupt' } }],
      },
    });

    expect(steerPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'try smaller', {
      attachments: [{ type: 'file', path: '/tmp/notes.txt', name: 'notes.txt' }],
    });
    expect(interrupt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(snapshot.messages.some((message) => message.parts.some((part) => part.type === 'text' && part.text === 'try smaller'))).toBe(true);
    expect(snapshot.messages.some((message) => message.parts.some((part) => (
      part.type === 'attachment' && part.attachment.path === '/tmp/notes.txt'
    )))).toBe(true);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'message.steer',
        payload: {
          prompt: 'try smaller',
          attachments: [{ type: 'file', path: '/tmp/notes.txt', name: 'notes.txt' }],
        },
      }),
    ]));
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    await server.close();
  });

  it('emits an app error event when interrupt fails', async () => {
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
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: vi.fn().mockRejectedValue(new Error('no active turn')),
      respondToRequest: async () => undefined,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const events: unknown[] = [];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      onEvent: (event) => events.push(event),
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'interrupt',
      method: 'agent/interrupt',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', status: { type: 'error', message: 'Failed to interrupt Codex: no active turn' } }],
      },
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'error', payload: { message: 'Failed to interrupt Codex: no active turn' } }),
    ]));
    await server.close();
  });

  it('owns rollback history replacement mutations', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-old' },
      status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.messages = [
      createTextMessage('old-dina', 'agent-dina', 'old'),
      createTextMessage('old-jesse', 'agent-jesse', 'keep'),
    ];
    const rollbackMessages = [createTextMessage('rollback-dina', 'agent-dina', 'rolled back')];
    const rollbackToTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-rollback' },
      messages: rollbackMessages,
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      rollbackToTurn,
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

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'rollback',
      method: 'agent/turn/rollback',
      params: { agentId: 'agent-dina', turnId: 'turn-1' },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-rollback' }, status: { type: 'idle' } }],
      },
    });

    expect(rollbackToTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'turn-1');
    expect(snapshot.messages.map((message) => [message.id, message.agentId])).toStrictEqual([
      ['old-jesse', 'agent-jesse'],
      ['rollback-dina', 'agent-dina'],
    ]);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'thread.historyLoaded', payload: { messages: rollbackMessages, replace: true } }),
      expect.objectContaining({ type: 'agent.statusChanged', payload: { type: 'idle' } }),
    ]));
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    await server.close();
  });
});
