import { describe, expect, it, vi } from 'vitest';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import {
  createTestSnapshot,
  readyRemoteConnection,
  createRemoteAgent,
  createRemoteTeamSnapshot,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

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
      method: 'team/delete',
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

  it('archives every attached session before deleting a local team', async () => {
    const snapshot = createTestSnapshot();
    const agent = {
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/repo',
      backend: 'codex' as const,
      backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      status: { type: 'idle' as const },
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    };
    snapshot.teams[0]!.agentIds = [agent.id];
    snapshot.agents = [agent];
    snapshot.activeAgentId = agent.id;
    snapshot.teams.push({
      id: 'team-keep',
      name: 'Keep',
      color: '#7158D4',
      agentIds: [],
    });
    const archiveAgentConversation = vi.fn().mockResolvedValue(undefined);
    const forgetAgentSession = vi.fn();
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: agent.backendSession }),
      interrupt: async () => ({ backendSession: agent.backendSession }),
      respondToRequest: async () => undefined,
      archiveAgentConversation,
      forgetAgentSession,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'delete-local-team',
      method: backendMethods.teamDelete,
      params: { teamId: 'team-test' },
    })).resolves.toMatchObject({
      result: {
        teams: [{ id: 'team-keep' }],
        agents: [],
      },
    });

    expect(archiveAgentConversation).toHaveBeenCalledWith(agent);
    expect(forgetAgentSession).toHaveBeenCalledWith(agent.id);
    await server.close();
  });

  it('rejects changing a team connection after agents exist', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'idle' },
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
      id: 'update-team-connection',
      method: 'team/update',
      params: {
        input: {
          id: 'team-test',
          name: 'Test Team',
          color: '#1B4FB2',
          remoteConnectionId: 'connection-devbox',
        },
      },
    })).resolves.toMatchObject({
      error: {
        code: -32603,
        message: 'Team connection cannot be changed while it has agents.',
      },
    });
  });

  it('creates a remote team pointer when updating an empty local team to a remote connection', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const remoteSnapshot = createRemoteTeamSnapshot();
    const remoteClients = {
      request: vi.fn().mockResolvedValue(remoteSnapshot),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'update-local-to-remote',
      method: 'team/update',
      params: {
        input: {
          id: 'team-test',
          name: 'Remote Core',
          color: '#46A857',
          remoteConnectionId: 'connection-devbox',
        },
      },
    })).resolves.toMatchObject({
      result: {
        teams: [expect.objectContaining({
          id: 'team-test',
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-remote',
        })],
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'team/create',
      {
        input: {
          name: 'Remote Core',
          color: '#46A857',
        },
      },
      expect.any(Function),
    );
    expect(snapshot.teams[0]).toMatchObject({
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
    });
  });

  it('connects an empty local team to an existing remote team when updating to a remote connection', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const remoteSnapshot = createRemoteTeamSnapshot();
    remoteSnapshot.teams[0]!.name = 'Remote Existing';
    remoteSnapshot.teams[0]!.color = '#46A857';
    const remoteClients = {
      request: vi.fn().mockResolvedValue({
        snapshot: remoteSnapshot,
        lastEventSeq: 0,
        clientState: {
          sourceFolderPath: '',
          shouldPreventDisplaySleep: false,
        },
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'update-local-to-existing-remote',
      method: 'team/update',
      params: {
        input: {
          id: 'team-test',
          name: 'Remote Existing',
          color: '#46A857',
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-remote',
        },
      },
    })).resolves.toMatchObject({
      result: {
        teams: [expect.objectContaining({
          id: 'team-test',
          name: 'Remote Existing',
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-remote',
        })],
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'snapshot/get',
      undefined,
      expect.any(Function),
    );
    expect(remoteClients.request).not.toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'team/create',
      expect.anything(),
      expect.any(Function),
    );
  });

  it('rejects changing a remote team connection when the remote team has agents', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    const remoteClients = {
      request: vi.fn().mockResolvedValue({
        snapshot: createRemoteTeamSnapshot([createRemoteAgent()]),
        lastEventSeq: 0,
        clientState: {
          sourceFolderPath: '',
          shouldPreventDisplaySleep: false,
        },
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'update-remote-to-local',
      method: 'team/update',
      params: {
        input: {
          id: 'team-test',
          name: 'Remote Core',
          color: '#46A857',
        },
      },
    })).resolves.toMatchObject({
      error: {
        code: -32603,
        message: 'Team connection cannot be changed while it has agents.',
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'snapshot/get',
      undefined,
      expect.any(Function),
    );
    expect(snapshot.teams[0]).toMatchObject({
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
    });
  });

  it('deletes an only remote team by creating a local fallback after remote delete', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    snapshot.activeTeamId = 'team-test';
    snapshot.activeAgentId = 'agent-remote';
    const remoteClients = {
      request: vi.fn().mockResolvedValue(createRemoteTeamSnapshot()),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'delete-only-remote-team',
      method: 'team/delete',
      params: { teamId: 'team-test' },
    })).resolves.toMatchObject({
      result: {
        teams: [expect.objectContaining({
          name: 'Local',
        })],
        activeAgentId: null,
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'team/delete',
      { teamId: 'team-remote' },
      expect.any(Function),
    );
    expect(snapshot.teams).toHaveLength(1);
    expect(snapshot.teams[0]).toMatchObject({ name: 'Local' });
    expect(snapshot.teams[0]?.remoteConnectionId).toBeUndefined();
    expect(snapshot.teams[0]?.remoteTeamId).toBeUndefined();
  });

  it('disconnects an only remote team by creating a local fallback without deleting the remote team', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    snapshot.activeTeamId = 'team-test';
    snapshot.activeAgentId = 'agent-remote';
    const remoteClients = {
      request: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'disconnect-only-remote-team',
      method: 'team/disconnect',
      params: { teamId: 'team-test' },
    })).resolves.toMatchObject({
      result: {
        teams: [expect.objectContaining({
          name: 'Local',
        })],
        activeAgentId: null,
      },
    });

    expect(remoteClients.request).not.toHaveBeenCalled();
    expect(snapshot.teams).toHaveLength(1);
    expect(snapshot.teams[0]).toMatchObject({ name: 'Local' });
    expect(snapshot.teams[0]?.remoteConnectionId).toBeUndefined();
    expect(snapshot.teams[0]?.remoteTeamId).toBeUndefined();
  });
});
