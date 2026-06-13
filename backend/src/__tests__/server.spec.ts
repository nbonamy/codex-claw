import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppSnapshot } from '@codex-claw/shared/contracts';
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
