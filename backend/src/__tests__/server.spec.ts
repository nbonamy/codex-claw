import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppSnapshot, RendererMessage, ThreadGoal, WorkItem } from '@codex-claw/shared/contracts';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/shared/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import type { WorkIntegrationManager } from '../work-integrations/manager';

describe('ClawBackendServer', () => {
  it('responds to backend health requests', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'health-1', method: 'backend/health' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'health-1',
      result: {
        ok: true,
        name: 'clawd',
        version: 'test-version',
        pid: 123,
      },
    });
  });

  it('returns an app snapshot with the backend event sequence', async () => {
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot: {
        ...createTestSnapshot(),
        activeTeamId: 'team-test',
      },
    });
    const response = await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get' });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: {
        lastEventSeq: 0,
        snapshot: {
          activeTeamId: 'team-test',
          activeAgentId: null,
          teams: [{ id: 'team-test' }],
          agents: [],
        },
      },
    });
  });

  it('returns method-not-found errors for unknown methods', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'missing', method: 'nope' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'missing',
      error: {
        code: -32601,
        message: 'Unknown backend method: nope',
      },
    });
  });

  it('assigns backend event sequence numbers', async () => {
    const events: unknown[] = [];
    let emitEvent: (event: BackendEvent) => void = () => undefined;
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      onEvent: (listener) => {
        emitEvent = listener;
        return () => undefined;
      },
      close: async () => undefined,
    };
    const driverRpc = new BackendDriverRpc(new Map([['codex', driver]]));
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      driverRpc,
      onEvent: (event) => events.push(event),
    });

    emitEvent({
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    });

    expect(events).toMatchObject([{
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }]);
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get' })).resolves.toMatchObject({
      result: {
        lastEventSeq: 1,
      },
    });
  });

  it('persists backend-owned snapshot changes for stateful events', async () => {
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
  });

  it('routes work provider requests through backend-owned work integrations', async () => {
    const snapshot = createTestSnapshot();
    const workIntegrations = {
      connect: vi.fn().mockResolvedValue({
        snapshot,
        authorization: {
          provider: 'github',
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
          expiresAt: '2026-06-13T00:00:00.000Z',
        },
      }),
      configureBacklog: vi.fn().mockResolvedValue(snapshot),
      listItems: vi.fn().mockResolvedValue([{
        provider: 'github',
        id: 'github:nbonamy/codex-claw#12',
        title: 'Fix bug',
        url: 'https://github.com/nbonamy/codex-claw/issues/12',
      }]),
    } as unknown as WorkIntegrationManager;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      workIntegrations,
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'connect', method: 'workProvider/connect', params: { provider: 'github' } })).resolves.toMatchObject({
      result: {
        snapshot,
        authorization: { provider: 'github', userCode: 'ABCD-1234' },
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'configure',
      method: 'workProvider/configureBacklog',
      params: { input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } } },
    })).resolves.toMatchObject({ result: snapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'items',
      method: 'workProvider/listItems',
      params: { provider: 'github', repositoryId: 'nbonamy/codex-claw' },
    })).resolves.toMatchObject({
      result: [{ id: 'github:nbonamy/codex-claw#12' }],
    });

    expect(workIntegrations.connect).toHaveBeenCalledWith('github');
    expect(workIntegrations.configureBacklog).toHaveBeenCalledWith({ provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } });
    expect(workIntegrations.listItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw');
  });

  it('owns team mutations', async () => {
    const snapshot = createTestSnapshot();
    const events: unknown[] = [];
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      onEvent: (event) => events.push(event),
    });
    const createInput = { name: 'Backend Team', color: '#7158D4' };

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'create-team',
      method: 'team/create',
      params: { input: createInput },
    })).resolves.toMatchObject({
      result: {
        activeTeamId: expect.stringContaining('team-backend-team'),
        teams: [{ id: 'team-test' }, { name: 'Backend Team', color: '#7158D4' }],
      },
    });
    const teamId = snapshot.teams[1]?.id ?? '';

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'update-team',
      method: 'team/update',
      params: { input: { id: teamId, name: 'Backend Runtime', color: '#AA4AB8' } },
    })).resolves.toMatchObject({
      result: {
        teams: [{ id: 'team-test' }, { id: teamId, name: 'Backend Runtime', color: '#AA4AB8' }],
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'reorder-team',
      method: 'team/reorder',
      params: { input: { teamId, beforeTeamId: 'team-test' } },
    })).resolves.toMatchObject({
      result: {
        teams: [{ id: teamId }, { id: 'team-test' }],
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'select-team',
      method: 'team/select',
      params: { teamId: 'team-test' },
    })).resolves.toMatchObject({
      result: {
        activeTeamId: 'team-test',
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'close-team',
      method: 'team/close',
      params: { teamId },
    })).resolves.toMatchObject({
      result: {
        teams: [{ id: 'team-test' }],
      },
    });

    expect(saveSnapshot).toHaveBeenCalledTimes(5);
    expect(events).toHaveLength(5);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'snapshot.updated' }),
    ]));
  });

  it('owns agent CRUD and layout mutations', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-agent-'));
    const nextTempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-agent-next-'));
    const snapshot = createTestSnapshot();
    snapshot.teams.push({ id: 'team-other', name: 'Other Team', agentIds: [] });
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map()),
    });

    try {
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'create-agent',
        method: 'agent/create',
        params: { input: { name: 'Dina', folder: tempDir, backend: 'codex', teamId: 'team-test' } },
      })).resolves.toMatchObject({
        result: {
          activeAgentId: expect.stringContaining('agent-'),
          agents: [{ name: 'Dina', folder: tempDir }],
        },
      });
      const agentId = snapshot.agents[0]?.id ?? '';
      expect(snapshot.teams.find((team) => team.id === 'team-test')?.agentIds).toStrictEqual([agentId]);

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'update-agent',
        method: 'agent/update',
        params: { input: { id: agentId, name: 'Dina Backend', folder: nextTempDir, backend: 'codex' } },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId, name: 'Dina Backend', folder: nextTempDir }],
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'duplicate-agent',
        method: 'agent/duplicate',
        params: { agentId },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId }, { name: 'Dina Backend (copy)' }],
        },
      });
      const duplicateId = snapshot.agents[1]?.id ?? '';

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'move-agent',
        method: 'agent/moveToTeam',
        params: { input: { agentId: duplicateId, teamId: 'team-other' } },
      })).resolves.toMatchObject({
        result: {
          activeTeamId: 'team-other',
          activeAgentId: duplicateId,
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'reorder-agent',
        method: 'agent/reorder',
        params: { input: { teamId: 'team-test', agentId, beforeAgentId: null } },
      })).resolves.toMatchObject({ result: { activeAgentId: expect.any(String) } });
      expect(snapshot.teams.find((team) => team.id === 'team-test')?.agentIds).toStrictEqual([agentId]);
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'update-folder',
        method: 'agent/updateFolder',
        params: { agentId, folder: tempDir },
      })).resolves.toMatchObject({ result: { activeAgentId: expect.any(String) } });
      expect(snapshot.agents.find((agent) => agent.id === agentId)?.folder).toBe(tempDir);
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'close-agent',
        method: 'agent/close',
        params: { agentId: duplicateId },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId }],
        },
      });

      expect(saveSnapshot).toHaveBeenCalled();
    } finally {
      await server.close();
      await rm(tempDir, { recursive: true, force: true });
      await rm(nextTempDir, { recursive: true, force: true });
    }
  });

  it('owns agent file listing and reads by resolving agent folders internally', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-agent-files-'));
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: tempDir,
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map()),
    });

    try {
      await mkdir(path.join(tempDir, 'docs'), { recursive: true });
      await writeFile(path.join(tempDir, 'README.md'), '# Read me\n');
      await writeFile(path.join(tempDir, 'docs', 'architecture.md'), '# Architecture\n');

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'list-files',
        method: 'agent/listFiles',
        params: { agentId: 'agent-dina' },
      })).resolves.toMatchObject({
        result: expect.arrayContaining([
          { name: 'README.md', path: 'README.md' },
          { name: 'architecture.md', path: 'docs/architecture.md' },
        ]),
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'read-file',
        method: 'agent/readFile',
        params: { agentId: 'agent-dina', filePath: 'README.md' },
      })).resolves.toMatchObject({
        result: {
          path: 'README.md',
          content: '# Read me\n',
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'missing-agent',
        method: 'agent/readFile',
        params: { agentId: 'agent-missing', filePath: 'README.md' },
      })).resolves.toMatchObject({
        error: {
          message: 'Agent not found: agent-missing',
        },
      });
    } finally {
      await server.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('owns work item assignment mutations', async () => {
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
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
    });
    const item = createWorkItem();

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'assign-item',
      method: 'agent/assignWorkItem',
      params: { agentId: 'agent-dina', item },
    })).resolves.toMatchObject({
      result: {
        workBacklog: {
          assignments: {
            'github:github:nbonamy/codex-claw#12': {
              agentId: 'agent-dina',
              status: 'working',
            },
          },
        },
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remove-item',
      method: 'agent/removeWorkItemAssignment',
      params: { item },
    })).resolves.toMatchObject({
      result: {
        workBacklog: { assignments: {} },
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'invalid-item',
      method: 'agent/assignWorkItem',
      params: { agentId: 'agent-dina', item: { id: 'missing-fields' } },
    })).resolves.toMatchObject({
      error: {
        message: 'Invalid work item assignment.',
      },
    });

    expect(saveSnapshot).toHaveBeenCalledTimes(2);
  });

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
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forgetAgentSession,
      resumeConversation,
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
      method: 'agent/resumeConversation',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-new' } },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-new' } }],
      },
    });

    expect(forgetAgentSession).toHaveBeenCalledWith('agent-dina');
    expect(resumeConversation).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), { backend: 'codex', threadId: 'thread-new' });
    expect(snapshot.messages.map((message) => [message.id, message.agentId])).toStrictEqual([
      ['old-jesse', 'agent-jesse'],
      ['new-dina', 'agent-dina'],
    ]);
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
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
      method: 'agent/setGoal',
      params: { agentId: 'agent-dina', objective: ' Ship the goal shelf ' },
    })).resolves.toMatchObject({
      result: {
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-goal' }, goal }],
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'clear-goal',
      method: 'agent/clearGoal',
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
      method: 'agent/setApprovalPreset',
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
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      onEvent: (event) => events.push(event),
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'steer',
      method: 'agent/steer',
      params: { agentId: 'agent-dina', prompt: ' try smaller ' },
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

    expect(steerPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'try smaller');
    expect(interrupt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(snapshot.messages.some((message) => message.parts.some((part) => part.type === 'text' && part.text === 'try smaller'))).toBe(true);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'message.steer', payload: { prompt: 'try smaller' } }),
    ]));
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

  it('owns bench mutations and validates deployed template folders', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-bench-'));
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: tempDir,
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.activeAgentId = 'agent-dina';
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc: new BackendDriverRpc(new Map()),
    });

    try {
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'save-bench',
        method: 'bench/saveAgent',
        params: { agentId: 'agent-dina' },
      })).resolves.toMatchObject({
        result: {
          bench: [{ name: 'Dina', folder: tempDir }],
        },
      });
      const templateId = snapshot.bench[0]?.id ?? '';

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'deploy-bench',
        method: 'bench/deployTemplate',
        params: { templateId, teamId: 'team-test' },
      })).resolves.toMatchObject({
        result: {
          agents: [
            { id: 'agent-dina' },
            { name: 'Dina', folder: tempDir, teamId: 'team-test' },
          ],
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'remove-bench',
        method: 'bench/removeTemplate',
        params: { templateId },
      })).resolves.toMatchObject({
        result: {
          bench: [],
        },
      });

      expect(saveSnapshot).toHaveBeenCalledTimes(3);
    } finally {
      await server.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('owns settings updates', async () => {
    const snapshot = createTestSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'settings-update',
      method: 'settings/update',
      params: {
        input: {
          general: { preventSleepWhenAgentsRun: false },
          sourceFolder: { path: '/Users/nbonamy/src', recentRepoNames: ['codex-claw', 'id8'] },
          theme: { id: 'codex-claw-dark', mode: 'dark', uiFontSize: 18 },
        },
      },
    })).resolves.toMatchObject({
      result: {
        general: { preventSleepWhenAgentsRun: false },
        sourceFolder: {
          path: '/Users/nbonamy/src',
          initialized: true,
          recentRepoNames: ['codex-claw', 'id8'],
        },
        theme: {
          id: 'codex-claw-dark',
          mode: 'dark',
          uiFontSize: 18,
        },
      },
    });

    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('records recent repositories when creating source worktrees', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: ['id8'],
    };
    const worktree = {
      name: 'backend-split',
      path: '/Users/nbonamy/src/codex-claw-backend-split',
    };
    const driverRpc = {
      handle: vi.fn().mockResolvedValue(worktree),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc,
    });
    const input = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-worktree',
      method: 'source/createWorktree',
      params: { input },
    })).resolves.toMatchObject({
      result: worktree,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/createWorktree', { input });
    expect(snapshot.sourceFolder.recentRepoNames).toStrictEqual(['codex-claw', 'id8']);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('owns loop mutations and loop runner dispatch', async () => {
    const snapshot = createTestSnapshot();
    const events: unknown[] = [];
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const loopRunner = {
      runAll: vi.fn().mockResolvedValue(undefined),
      runLoop: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      loopRunner,
      onEvent: (event) => events.push(event),
    });
    const input = {
      name: 'GitHub bugs',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-test',
        },
      },
      instructions: {},
    };

    const created = await server.handleMessage({ jsonrpc: '2.0', id: 'create', method: 'loop/create', params: { input } });
    const loopId = snapshot.loops[0]?.id ?? '';
    expect(created).toMatchObject({ result: { loops: [{ name: 'GitHub bugs' }] } });
    expect(loopId).toBeTruthy();

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'update',
      method: 'loop/update',
      params: { input: { ...input, id: loopId, name: 'GitHub regressions' } },
    })).resolves.toMatchObject({ result: { loops: [{ name: 'GitHub regressions' }] } });

    snapshot.loops[0]?.executionLog.push({
      id: 'loop-exec-1',
      loopId,
      startedAt: '2026-06-13T00:00:00.000Z',
      status: 'working',
      createdCount: 0,
      createdAgents: [],
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'delete-execution',
      method: 'loop/execution/delete',
      params: { loopId, executionId: 'loop-exec-1' },
    })).resolves.toMatchObject({ result: { loops: [{ executionLog: [] }] } });

    snapshot.loops[0]?.executionLog.push({
      id: 'loop-exec-2',
      loopId,
      startedAt: '2026-06-13T00:01:00.000Z',
      status: 'working',
      createdCount: 0,
      createdAgents: [],
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'clear-history',
      method: 'loop/history/clear',
      params: { loopId },
    })).resolves.toMatchObject({ result: { loops: [{ executionLog: [] }] } });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'run',
      method: 'loop/run',
      params: { loopId },
    })).resolves.toMatchObject({ result: { loops: [{ id: loopId }] } });
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'run-due', method: 'loop/runDue' })).resolves.toMatchObject({ result: { loops: [{ id: loopId }] } });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'delete',
      method: 'loop/delete',
      params: { loopId },
    })).resolves.toMatchObject({ result: { loops: [] } });

    expect(loopRunner.runLoop).toHaveBeenCalledWith(loopId);
    expect(loopRunner.runAll).toHaveBeenCalledOnce();
    expect(saveSnapshot).toHaveBeenCalled();
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'snapshot.updated' }),
    ]));
  });
});

function createTestSnapshot(): AppSnapshot {
  return {
    teams: [{
      id: 'team-test',
      name: 'Test Team',
      agentIds: [],
    }],
    agents: [],
    bench: [],
    loops: [],
    activeTeamId: 'team-test',
    activeAgentId: null,
    messages: [],
    agentGitStatuses: {},
    turnGitDiffs: {},
    backendRuntimes: [],
    workBacklog: {
      connections: [],
      providerConfigurations: {},
      providerSettings: {},
      assignments: {},
    },
    general: {
      preventSleepWhenAgentsRun: true,
    },
    sourceFolder: {
      path: '',
      initialized: false,
      recentRepoNames: [],
    },
    theme: {
      id: 'codex-claw-light',
      mode: 'system',
      uiFontSize: 14,
      chatFontSize: 15,
      codeFontSize: 13,
    },
  };
}

function createWorkItem(): WorkItem {
  return {
    provider: 'github',
    id: 'github:nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix bug',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    labels: [],
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z',
  };
}

function createTextMessage(id: string, agentId: string, text: string): RendererMessage {
  return {
    id,
    agentId,
    role: 'user',
    status: 'complete',
    createdAt: '2026-06-13T00:00:00.000Z',
    parts: [{ type: 'text', text }],
  };
}

function createThreadGoal(threadId: string, objective: string): ThreadGoal {
  return {
    threadId,
    objective,
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
