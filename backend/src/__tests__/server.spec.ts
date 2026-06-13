import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppSnapshot, RendererMessage, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem } from '@codex-claw/shared/contracts';
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

  it('routes system permission requests through the backend system port', async () => {
    const status: SystemPermissionsStatus = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: false,
      },
    };
    const openedStatus: SystemPermissionsStatus = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: true,
      },
    };
    const systemPermissions = {
      getStatus: vi.fn().mockResolvedValue(status),
      openAccessibilitySettings: vi.fn().mockResolvedValue(openedStatus),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      systemPermissions,
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'permissions', method: 'system/getPermissions' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'permissions',
      result: status,
    });
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'open-permissions', method: 'system/openAccessibilitySettings' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'open-permissions',
      result: openedStatus,
    });
    expect(systemPermissions.getStatus).toHaveBeenCalledOnce();
    expect(systemPermissions.openAccessibilitySettings).toHaveBeenCalledOnce();
  });

  it('returns a non-desktop system permission status when no host port is configured', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'permissions', method: 'system/getPermissions' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'permissions',
      result: {
        platform: 'unsupported',
        accessibility: {
          required: false,
          trusted: true,
        },
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
        desktopState: {
          sourceFolderPath: '',
          shouldPreventDisplaySleep: false,
        },
        snapshot: {
          activeTeamId: 'team-test',
          activeAgentId: null,
          teams: [{ id: 'team-test' }],
          agents: [],
        },
      },
    });
  });

  it('derives desktop state from backend-owned snapshot state', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    snapshot.general.preventSleepWhenAgentsRun = true;
    snapshot.agents = [{
      id: 'agent-dina',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'working' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    }];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'desktop-state',
      method: 'desktop/getState',
    })).resolves.toMatchObject({
      result: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: true,
      },
    });

    snapshot.general.preventSleepWhenAgentsRun = false;
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'desktop-state-disabled',
      method: 'desktop/getState',
    })).resolves.toMatchObject({
      result: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: false,
      },
    });
  });

  it('initializes source folder state from the backend when snapshots are requested', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = { path: '', initialized: false, recentRepoNames: [] };
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const handle = vi.fn().mockResolvedValue('/Users/nbonamy/src');
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      driverRpc: {
        handle,
        onEvent: vi.fn(() => () => undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as BackendDriverRpc,
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'snapshot', method: 'snapshot/get' })).resolves.toMatchObject({
      result: {
        snapshot: {
          sourceFolder: {
            path: '/Users/nbonamy/src',
            initialized: true,
            recentRepoNames: [],
          },
        },
      },
    });

    expect(handle).toHaveBeenCalledWith('source/detectFolder', undefined);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    await server.close();
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
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'idle' },
      backendSession: { kind: 'codex', threadId: 'thread-test' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.activeAgentId = 'agent-dina';
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
      snapshot,
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
      desktopState: {
        shouldPreventDisplaySleep: true,
      },
      snapshot: {
        agents: [
          expect.objectContaining({
            id: 'agent-dina',
            status: { type: 'working' },
          }),
        ],
      },
    }]);
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get' })).resolves.toMatchObject({
      result: {
        lastEventSeq: 1,
      },
    });
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
      method: 'clientRequest/respond',
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
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'known-response',
      method: 'clientRequest/respond',
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

  it('derives plan side-panel preview events in clawd', () => {
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
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Plan',
        content: 'Current plan\n- [x] Inspect backend event\n- [ ] Preview markdown',
      },
    }));

    server.emitEvent({
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-13T00:00:01.000Z',
    });

    expect(events.filter((event) => (
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      event.type === 'sidePanel.markdownRequested'
    ))).toHaveLength(2);
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
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff,
      },
    }));
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

  it('owns agent selection hydration and git status refresh', async () => {
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
    const hydrateAgent = vi.fn().mockResolvedValue({ kind: 'codex', threadId: 'thread-hydrated' });
    const getGitStatus = vi.fn().mockResolvedValue({
      folder: '/Users/nbonamy/src/codex-claw',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 2,
      addedLines: 12,
      removedLines: 4,
      hasUntracked: false,
      state: 'dirty',
      updatedAt: '2026-06-13T00:00:00.000Z',
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      getGitStatus,
      hydrateAgent,
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
      id: 'select',
      method: 'agent/select',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({
      result: {
        activeAgentId: 'agent-dina',
        agents: [{ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-hydrated' } }],
        agentGitStatuses: {
          'agent-dina': expect.objectContaining({ branch: 'main', state: 'dirty' }),
        },
      },
    });

    expect(hydrateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(getGitStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-hydrated' } }));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'snapshot.updated' }),
      expect.objectContaining({ type: 'git.statusUpdated', agentId: 'agent-dina' }),
    ]));
    expect(saveSnapshot).toHaveBeenCalled();
    await server.close();
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
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: ['id8'],
    };
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
        params: { input: { name: 'Dina', folder: tempDir, backend: 'codex', sourceRepositoryName: 'codex-claw', teamId: 'team-test' } },
      })).resolves.toMatchObject({
        result: {
          activeAgentId: expect.stringContaining('agent-'),
          agents: [{ name: 'Dina', folder: tempDir }],
          sourceFolder: {
            recentRepoNames: ['codex-claw', 'id8'],
          },
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
        id: 'preview-file',
        method: 'agent/previewFile',
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
        method: 'agent/previewFile',
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

  it('owns provider metadata and conversation-history reads by resolving agents internally', async () => {
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
    snapshot.loops = [{
      id: 'loop-bugs',
      name: 'GitHub bugs',
      enabled: true,
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
      source: { provider: 'github', repositoryId: 'nbonamy/codex-claw' },
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
        teamTarget: { mode: 'existing', teamId: 'team-test' },
      },
      instructions: {},
      executionLog: [{
        id: 'loop-exec-1',
        loopId: 'loop-bugs',
        startedAt: '2026-06-13T00:00:00.000Z',
        status: 'completed',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-dina',
          agentName: 'Dina',
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
          conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        }],
      }],
    }];
    const conversations = [{
      id: 'thread-dina',
      title: 'Read docs',
      updatedAt: '2026-06-09T10:00:00.000Z',
      messageCount: 3,
      ref: { backend: 'codex' as const, threadId: 'thread-dina' },
    }];
    const messages = [createTextMessage('user-thread-dina-user-1', 'agent-dina', 'hello')];
    const listModels = vi.fn().mockResolvedValue([{ id: 'gpt-test', name: 'GPT Test' }]);
    const listSkills = vi.fn().mockResolvedValue([{ name: 'frontend-design', path: '/skills/frontend-design/SKILL.md' }]);
    const listConversations = vi.fn().mockResolvedValue(conversations);
    const readConversationMessages = vi.fn().mockResolvedValue(messages);
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      listConversations,
      listModels,
      listSkills,
      readConversationMessages,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'models',
      method: 'agent/listModels',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: [{ id: 'gpt-test', name: 'GPT Test' }] });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'skills',
      method: 'agent/listSkills',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: [{ name: 'frontend-design' }] });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'conversations',
      method: 'agent/listConversations',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: conversations });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'messages',
      method: 'agent/readConversationMessages',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-dina' } },
    })).resolves.toMatchObject({ result: messages });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'unknown-ref',
      method: 'agent/readConversationMessages',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-unknown' } },
    })).resolves.toMatchObject({ error: { message: 'Conversation reference is not available.' } });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'invalid-ref',
      method: 'agent/readConversationMessages',
      params: { agentId: 'agent-dina', ref: { backend: 'codex' } },
    })).resolves.toMatchObject({ error: { message: 'Invalid conversation reference.' } });

    expect(listModels).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(listSkills).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(listConversations).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
    await server.close();
  });

  it('owns git diff preview side-panel events', async () => {
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
    const getGitDiff = vi.fn().mockResolvedValue('diff --git a/a.ts b/a.ts\n');
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      getGitDiff,
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
      id: 'open-diff',
      method: 'agent/openGitDiff',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: true });

    expect(getGitDiff).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-dina',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        title: 'Git Diff',
        subtitle: '/Users/nbonamy/src/codex-claw',
        diff: 'diff --git a/a.ts b/a.ts\n',
      },
    }));
    await server.close();
  });

  it('emits git diff preview errors from clawd', async () => {
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
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      getGitDiff: vi.fn().mockResolvedValue(null),
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

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'open-diff',
      method: 'agent/openGitDiff',
      params: { agentId: 'agent-dina' },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'sidePanel.gitDiffRequested',
      payload: expect.objectContaining({
        state: 'error',
        error: 'Codex does not support git diff preview.',
      }),
    }));
    await server.close();
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
      method: 'agent/rollbackToTurn',
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

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'send',
        method: 'agent/sendPrompt',
        params: { agentId: 'agent-dina', prompt: ' hello codex ' },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: 'agent-dina', status: { type: 'starting' } }],
          messages: [{ agentId: 'agent-dina', role: 'user', parts: [{ type: 'text', text: 'hello codex' }] }],
        },
      });
      await flushMicrotasks();

      expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'hello codex', undefined);
      expect(snapshot.agents[0]?.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-dina' });
      expect(snapshot.agents[0]?.status).toStrictEqual({ type: 'working' });
      expect(setConversationTitle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-dina', backendSession: { kind: 'codex', threadId: 'thread-dina' } }),
        'Dina - Jun 10, 2026 3:42 PM',
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
      method: 'agent/sendPrompt',
      params: { agentId: 'agent-dina', prompt: '/compact' },
    });
    await flushMicrotasks();

    expect(tryHandlePromptCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), '/compact');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.messages).toHaveLength(0);
    expect(snapshot.agents[0]?.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-command' });
    await server.close();
  });

  it('owns message retry and edit rollback orchestration', async () => {
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
      createTextMessage('user-turn-1', 'agent-dina', 'first prompt', 'turn-1'),
      createTextMessage('assistant-turn-1', 'agent-dina', 'first answer', 'turn-1', 'assistant'),
    ];
    const rollbackToTurn = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex' as const, threadId: 'thread-rollback' },
      messages: [],
    });
    const sendPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      turnId: 'turn-new',
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt,
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      rollbackToTurn,
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
      method: 'agent/retryMessage',
      params: { agentId: 'agent-dina', messageId: 'assistant-turn-1' },
    });

    expect(rollbackToTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'turn-1');
    expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'first prompt', undefined);

    snapshot.agents[0]!.status = { type: 'idle' };
    snapshot.messages = [
      createTextMessage('user-turn-1', 'agent-dina', 'first prompt', 'turn-1'),
      createTextMessage('assistant-turn-1', 'agent-dina', 'first answer', 'turn-1', 'assistant'),
    ];

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'edit',
      method: 'agent/editMessage',
      params: { agentId: 'agent-dina', messageId: 'user-turn-1', prompt: ' edited prompt ' },
    });

    expect(sendPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'edited prompt', undefined);
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

  it('owns source repository discovery path resolution', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const repositories = [{
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
    }];
    const driverRpc = {
      handle: vi.fn().mockResolvedValue(repositories),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-repositories',
      method: 'source/listRepositories',
    })).resolves.toMatchObject({
      result: repositories,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/listRepositories', {
      sourceFolderPath: '/Users/nbonamy/src',
    });
  });

  it('returns no source repositories when no source folder is configured', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '',
      initialized: true,
      recentRepoNames: [],
    };
    const driverRpc = {
      handle: vi.fn(),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-repositories',
      method: 'source/listRepositories',
    })).resolves.toMatchObject({
      result: [],
    });

    expect(driverRpc.handle).not.toHaveBeenCalled();
  });

  it('owns source worktree path suggestions', async () => {
    const snapshot = createTestSnapshot();
    const driverRpc = {
      handle: vi.fn().mockResolvedValue('/Users/nbonamy/src/codex-claw-backend-split'),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });
    const input = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-worktree-suggestion',
      method: 'source/suggestWorktreePath',
      params: { input },
    })).resolves.toMatchObject({
      result: '/Users/nbonamy/src/codex-claw-backend-split',
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/suggestWorktreePath', { input });
  });

  it('owns git worktree listing', async () => {
    const snapshot = createTestSnapshot();
    const worktrees: SourceWorktree[] = [
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'backend-split', path: '/Users/nbonamy/src/codex-claw-backend-split' },
    ];
    const driverRpc = {
      handle: vi.fn().mockResolvedValue(worktrees),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BackendDriverRpc;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'source-worktrees',
      method: 'source/listWorktrees',
      params: { repoPath: '/Users/nbonamy/src/codex-claw' },
    })).resolves.toMatchObject({
      result: worktrees,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/listWorktrees', {
      repoPath: '/Users/nbonamy/src/codex-claw',
    });
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

function createTextMessage(
  id: string,
  agentId: string,
  text: string,
  turnId?: string,
  role: RendererMessage['role'] = 'user',
): RendererMessage {
  return {
    id,
    agentId,
    role,
    ...(turnId ? { turnId } : {}),
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
