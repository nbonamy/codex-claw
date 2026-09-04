import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { Agent, AgentGitStatus, AppSnapshot, BackendConversationRef, RendererMessage, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem, WorkRoutingRequest } from '@codex-claw/core/contracts';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import { snapshotMetadata } from '@codex-claw/core/snapshot';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import {
  createTestSnapshot,
  readyRemoteConnection,
  createRemoteAgent,
  createRemoteTeamSnapshot,
  createWorkItem,
  createTextMessage,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {

  it('routes SSH connection discovery and persistence through clawd', async () => {
    const snapshot = createTestSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const sshConnections = {
      listHostCandidates: vi.fn().mockResolvedValue([{
        host: 'devbox',
        hostName: 'devbox.internal',
        user: 'nicolas',
      }]),
      createConnection: vi.fn().mockResolvedValue({
        id: 'connection-devbox',
        kind: 'ssh',
        name: 'devbox',
        host: 'devbox',
        status: 'ready',
        transport: {
          type: 'ssh-stdio',
          command: 'ssh',
          args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
        },
        createdAt: '2026-06-14T10:00:00.000Z',
        updatedAt: '2026-06-14T10:00:00.000Z',
      }),
      checkConnection: vi.fn(),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      sshConnections: sshConnections as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'list-connections',
      method: 'connections/sshHosts/list',
    })).resolves.toMatchObject({
      result: [{
        host: 'devbox',
        hostName: 'devbox.internal',
        user: 'nicolas',
      }],
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'add-connection',
      method: 'connections/ssh/create',
      params: {
        input: {
          host: 'devbox',
          hostName: 'devbox.internal',
          user: 'nicolas',
        },
      },
    })).resolves.toMatchObject({
      result: {
        remoteConnections: {
          connections: [{
            id: 'connection-devbox',
            host: 'devbox',
            status: 'ready',
          }],
        },
      },
    });

    expect(sshConnections.createConnection).toHaveBeenCalledWith({
      host: 'devbox',
      hostName: 'devbox.internal',
      user: 'nicolas',
    });
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('checks and removes remote connections through clawd', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [{
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      status: 'saved',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
    const sshConnections = {
      listHostCandidates: vi.fn(),
      createConnection: vi.fn(),
      checkConnection: vi.fn().mockResolvedValue({
        ...snapshot.remoteConnections.connections[0],
        status: 'ready',
        detail: 'Ready (clawd 0.1.0)',
        transport: {
          type: 'ssh-stdio',
          command: 'ssh',
          args: ['devbox', 'node ~/.codex-claw/clawd.mjs connect || exec node ~/.codex-claw/clawd.mjs --stdio'],
        },
        updatedAt: '2026-06-14T10:01:00.000Z',
      }),
    };
    const remoteClients = {
      request: vi.fn().mockResolvedValue(createTestSnapshot()),
      close: vi.fn(),
      closeConnection: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      sshConnections: sshConnections as never,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'check-connection',
      method: 'connections/sync',
      params: { connectionId: 'connection-devbox' },
    })).resolves.toMatchObject({
      result: {
        remoteConnections: {
          connections: [{
            id: 'connection-devbox',
            status: 'ready',
            detail: 'Ready (clawd 0.1.0)',
          }],
        },
      },
    });
    expect(remoteClients.closeConnection).toHaveBeenCalledWith('connection-devbox');
    expect(remoteClients.request).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'connection-devbox',
        status: 'ready',
      }),
      'workProvider/connections/reload',
      undefined,
      expect.any(Function),
    );

    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
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
    remoteClients.closeConnection.mockClear();

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remove-connection',
      method: 'connections/delete',
      params: { connectionId: 'connection-devbox' },
    })).resolves.toMatchObject({
      result: {
        remoteConnections: {
          connections: [],
        },
        teams: [{
          name: 'Local',
          agentIds: [],
        }],
        agents: [],
      },
    });
    expect(remoteClients.closeConnection).toHaveBeenCalledWith('connection-devbox');
  });

  it('updates remote connection source folder settings on the remote clawd', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const connection = snapshot.remoteConnections.connections[0]!;
    const remoteClients = {
      request: vi.fn().mockResolvedValue(createTestSnapshot()),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
      saveSnapshot,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'update-connection',
      method: 'connections/update',
      params: {
        connectionId: 'connection-devbox',
        input: {
          sourceFolderPath: '  ~/code  ',
        },
      },
    })).resolves.toMatchObject({
      result: {
        remoteConnections: {
          connections: [{
            id: 'connection-devbox',
            sourceFolderPath: '~/code',
          }],
        },
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      connection,
      'settings/update',
      {
        input: {
          sourceFolder: {
            path: '~/code',
          },
        },
      },
    );
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('creates remote teams as local pointers only', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const remoteSnapshot = createRemoteTeamSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const remoteClients = {
      request: vi.fn().mockResolvedValue(remoteSnapshot),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'create-remote-team',
      method: 'team/create',
      params: {
        input: {
          name: 'Remote Core',
          color: '#46A857',
          remoteConnectionId: 'connection-devbox',
        },
      },
    })).resolves.toMatchObject({
      result: {
        teams: expect.arrayContaining([expect.objectContaining({
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-remote',
          agentIds: [],
        })]),
        agents: [],
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
    expect(snapshot.teams[1]).toMatchObject({
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    });
    expect(snapshot.agents).toStrictEqual([]);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('creates agents in the remote team without saving local proxy agents', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      color: '#46A857',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    snapshot.activeTeamId = 'team-pointer';
    const remoteSnapshot = createRemoteTeamSnapshot([createRemoteAgent()]);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const remoteClients = {
      request: vi.fn().mockResolvedValue(remoteSnapshot),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'create-remote-agent',
      method: 'agent/create',
      params: {
        input: {
          name: 'Dina',
          folder: '/home/mnmt/src/codex-claw',
          teamId: 'team-pointer',
        },
      },
    })).resolves.toMatchObject({
      result: {
        activeTeamId: 'team-pointer',
        activeAgentId: 'agent-remote',
        teams: [{
          id: 'team-pointer',
          agentIds: ['agent-remote'],
        }],
        agents: [{
          id: 'agent-remote',
          teamId: 'team-pointer',
        }],
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'agent/create',
      {
        input: {
          name: 'Dina',
          folder: '/home/mnmt/src/codex-claw',
          teamId: 'team-remote',
        },
      },
      expect.any(Function),
    );
    expect(snapshot.agents).toStrictEqual([]);
    expect(snapshot.teams[0]?.agentIds).toStrictEqual([]);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('creates team-scoped quick chats without a workspace', async () => {
    const snapshot = createTestSnapshot();
    const driverRpc = new BackendDriverRpc(new Map());
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      driverRpc,
      saveSnapshot,
    });

    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'create-quick-chat',
      method: 'agent/quickChat/create',
      params: { input: { teamId: 'team-test' } },
    });

    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
    expect(response).toMatchObject({
      result: {
        activeTeamId: 'team-test',
        agents: [expect.objectContaining({
          teamId: 'team-test',
          sessionKind: 'quickChat',
          name: null,
          folder: null,
          backend: 'codex',
        })],
      },
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'list-quick-chat-files',
      method: 'agent/files/list',
      params: { agentId: snapshot.activeAgentId },
    })).rejects.toThrow('This session does not have a project workspace.');
  });

  it('routes remote agent prompts to the owning remote clawd', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    snapshot.activeTeamId = 'team-pointer';
    snapshot.activeAgentId = 'agent-remote';
    const remoteAgent = createRemoteAgent();
    const remoteSnapshot = createRemoteTeamSnapshot([remoteAgent]);
    const remoteSnapshotWithMessage = {
      ...remoteSnapshot,
      messages: [createTextMessage('message-user', 'agent-remote', 'hello')],
    };
    const remoteClients = {
      request: vi.fn()
        .mockResolvedValueOnce({
          snapshot: remoteSnapshot,
          lastEventSeq: 0,
          clientState: {
            sourceFolderPath: '',
            shouldPreventDisplaySleep: false,
          },
        })
        .mockResolvedValueOnce(remoteSnapshotWithMessage),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'prompt',
      method: 'agent/prompt/send',
      params: {
        agentId: 'agent-remote',
        prompt: 'hello',
      },
    });
    expect(response).toMatchObject({
      result: {
        activeAgentId: 'agent-remote',
        agents: [{
          id: 'agent-remote',
          teamId: 'team-pointer',
        }],
      },
    });
    expect((response as { result: Record<string, unknown> }).result).not.toHaveProperty('messages');

    expect(remoteClients.request).toHaveBeenNthCalledWith(
      1,
      snapshot.remoteConnections.connections[0],
      'snapshot/get',
      undefined,
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      2,
      snapshot.remoteConnections.connections[0],
      'agent/prompt/send',
      {
        agentId: 'agent-remote',
        prompt: 'hello',
        options: undefined,
      },
      expect.any(Function),
    );
    expect(snapshot.agents).toStrictEqual([]);
  });

  it('rejects malformed remote full and metadata snapshots without adopting them', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    snapshot.activeTeamId = 'team-pointer';
    const remoteAgent = createRemoteAgent();
    const remoteSnapshot = createRemoteTeamSnapshot([remoteAgent]);
    const malformedFullSnapshot = structuredClone(remoteSnapshot);
    malformedFullSnapshot.agents[0]!.name = 'Malformed full snapshot';
    (malformedFullSnapshot.general.appshots as unknown as Record<string, unknown>).hotkey = 42;
    const malformedMetadata = snapshotMetadata(structuredClone(remoteSnapshot));
    malformedMetadata.agents[0]!.name = 'Malformed metadata snapshot';
    (malformedMetadata.general.plugins as unknown as Record<string, unknown>).computerUseEnabled = 'yes';
    const validMetadata = snapshotMetadata(structuredClone(remoteSnapshot));
    validMetadata.agents[0]!.name = 'Metadata event update';
    const validFullSnapshot = structuredClone(remoteSnapshot);
    validFullSnapshot.messages = [createTextMessage('message-remote-event', remoteAgent.id, 'Remote event')];
    const remoteClients = {
      request: vi.fn(async (_connection, method: string, _params, onEvent?: (event: unknown) => void) => {
        if (method === 'snapshot/get') {
          return {
            snapshot: remoteSnapshot,
            lastEventSeq: 0,
            clientState: {
              sourceFolderPath: '',
              shouldPreventDisplaySleep: false,
            },
          };
        }
        if (method === 'agent/select') return malformedFullSnapshot;
        if (method === 'agent/prompt/send') {
          onEvent?.({
            seq: 1,
            type: 'snapshot.updated',
            payload: validFullSnapshot,
            occurredAt: '2026-06-13T00:00:00.000Z',
          });
          onEvent?.({
            seq: 2,
            type: 'snapshot.updated',
            payload: validMetadata,
            occurredAt: '2026-06-13T00:00:01.000Z',
          });
          onEvent?.({
            seq: 3,
            type: 'snapshot.updated',
            payload: malformedFullSnapshot,
            occurredAt: '2026-06-13T00:00:02.000Z',
          });
          return malformedMetadata;
        }
        throw new Error(`Unexpected remote method: ${method}`);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
    });

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'snapshot',
      method: 'snapshot/get',
    });
    const selection = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'select',
      method: 'agent/select',
      params: { agentId: remoteAgent.id },
    });
    const prompt = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'prompt',
      method: 'agent/prompt/send',
      params: { agentId: remoteAgent.id, prompt: 'hello' },
    });

    expect(selection).toMatchObject({ result: { agents: [{ name: 'Dina' }] } });
    expect(prompt).toMatchObject({ result: { agents: [{ name: 'Metadata event update' }] } });
    await server.close();
  });

  it('projects and removes remote work item assignments through the owning remote clawd', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    snapshot.activeTeamId = 'team-pointer';
    snapshot.activeAgentId = 'agent-remote';
    const item = createWorkItem();
    const sanitizedItem = {
      provider: item.provider,
      id: item.id,
      repositoryId: item.repositoryId,
      repositoryFullName: item.repositoryFullName,
      number: item.number,
      title: item.title,
      url: item.url,
    };
    const assignmentKey = workItemAssignmentKey(item);
    const remoteAgent = createRemoteAgent();
    const remoteSnapshot = createRemoteTeamSnapshot([remoteAgent]);
    const assignedRemoteSnapshot = {
      ...remoteSnapshot,
      workBacklog: {
        ...remoteSnapshot.workBacklog,
        assignments: {
          [assignmentKey]: {
            provider: 'github',
            itemId: item.id,
            agentId: remoteAgent.id,
            assignedAt: '2026-06-14T10:00:00.000Z',
            policy: 'review' as const,
            status: 'inProgress' as const,
          },
        },
      },
    };
    const unassignedRemoteSnapshot = {
      ...remoteSnapshot,
      workBacklog: {
        ...remoteSnapshot.workBacklog,
        assignments: {},
      },
    };
    const remoteClients = {
      request: vi.fn(async (_connection, method: string) => {
        if (method === 'snapshot/get') {
          return {
            snapshot: remoteSnapshot,
            lastEventSeq: 0,
            clientState: {
              sourceFolderPath: '',
              shouldPreventDisplaySleep: false,
            },
          };
        }
        if (method === 'agent/workItem/assign') {
          return assignedRemoteSnapshot;
        }
        if (method === 'agent/workItem/assignment/delete') {
          return unassignedRemoteSnapshot;
        }
        return remoteSnapshot;
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
      id: 'assign-remote-item',
      method: 'agent/workItem/assign',
      params: { agentId: remoteAgent.id, item },
    })).resolves.toMatchObject({
      result: {
        workBacklog: {
          assignments: {
            [assignmentKey]: {
              agentId: remoteAgent.id,
              policy: 'review',
              status: 'inProgress',
            },
          },
        },
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remove-remote-item',
      method: 'agent/workItem/assignment/delete',
      params: { item },
    })).resolves.toMatchObject({
      result: {
        workBacklog: { assignments: {} },
      },
    });

    expect(remoteClients.request).toHaveBeenNthCalledWith(
      1,
      snapshot.remoteConnections.connections[0],
      'snapshot/get',
      undefined,
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      2,
      snapshot.remoteConnections.connections[0],
      'agent/workItem/assign',
      { agentId: remoteAgent.id, item: sanitizedItem },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      3,
      snapshot.remoteConnections.connections[0],
      'agent/workItem/assignment/delete',
      { item: sanitizedItem },
      expect.any(Function),
    );
    expect(snapshot.workBacklog.assignments).toStrictEqual({});
  });

  it('routes remote message actions to the owning remote clawd', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    snapshot.activeTeamId = 'team-pointer';
    snapshot.activeAgentId = 'agent-remote';
    const remoteAgent = createRemoteAgent();
    const remoteSnapshot = createRemoteTeamSnapshot([remoteAgent]);
    remoteSnapshot.messages = [
      createTextMessage('user-turn-1', remoteAgent.id, 'first prompt', 'turn-1'),
      createTextMessage('assistant-turn-1', remoteAgent.id, 'first answer', 'turn-1', 'assistant'),
    ];
    const remoteSnapshotAfterAction = {
      ...remoteSnapshot,
      messages: [createTextMessage('message-after-action', remoteAgent.id, 'after action')],
    };
    const remoteClients = {
      request: vi.fn(async (_connection, method: string) => {
        if (method === 'snapshot/get') {
          return {
            snapshot: remoteSnapshot,
            lastEventSeq: 0,
            clientState: {
              sourceFolderPath: '',
              shouldPreventDisplaySleep: false,
            },
          };
        }
        return remoteSnapshotAfterAction;
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
      id: 'rollback',
      method: 'agent/turn/rollback',
      params: { agentId: 'agent-remote', turnId: 'turn-1' },
    })).resolves.toMatchObject({
      result: {
        messages: [{ id: 'message-after-action', agentId: 'agent-remote' }],
      },
    });
    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'delete',
      method: 'agent/message/delete',
      params: { agentId: 'agent-remote', messageId: 'user-turn-1' },
    });
    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'edit',
      method: 'agent/message/update',
      params: { agentId: 'agent-remote', messageId: 'user-turn-1', prompt: 'edited prompt' },
    });
    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'retry',
      method: 'agent/message/retry',
      params: { agentId: 'agent-remote', messageId: 'assistant-turn-1' },
    });

    expect(remoteClients.request).toHaveBeenNthCalledWith(
      1,
      snapshot.remoteConnections.connections[0],
      'snapshot/get',
      undefined,
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      2,
      snapshot.remoteConnections.connections[0],
      'agent/turn/rollback',
      { agentId: 'agent-remote', turnId: 'turn-1' },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      3,
      snapshot.remoteConnections.connections[0],
      'agent/message/delete',
      { agentId: 'agent-remote', messageId: 'user-turn-1' },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      4,
      snapshot.remoteConnections.connections[0],
      'agent/message/update',
      { agentId: 'agent-remote', messageId: 'user-turn-1', prompt: 'edited prompt' },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      5,
      snapshot.remoteConnections.connections[0],
      'agent/message/retry',
      { agentId: 'agent-remote', messageId: 'assistant-turn-1' },
      expect.any(Function),
    );
    expect(snapshot.messages).toStrictEqual([]);
  });

  it('rejects moving a local agent into a remote team pointer', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [
      {
        id: 'team-local',
        name: 'Local',
        agentIds: ['agent-local'],
      },
      {
        id: 'team-pointer',
        name: 'Remote Core',
        remoteConnectionId: 'connection-devbox',
        remoteTeamId: 'team-remote',
        agentIds: [],
      },
    ];
    snapshot.activeTeamId = 'team-local';
    snapshot.activeAgentId = 'agent-local';
    snapshot.agents = [{
      id: 'agent-local',
      teamId: 'team-local',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
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
      id: 'move-local-to-remote',
      method: 'agent/team/move',
      params: { input: { agentId: 'agent-local', teamId: 'team-pointer' } },
    })).resolves.toMatchObject({
      error: {
        code: -32603,
        message: 'Agents cannot be moved between backend locations.',
      },
    });

    expect(snapshot.agents[0]).toMatchObject({ id: 'agent-local', teamId: 'team-local' });
    expect(snapshot.teams.find((team) => team.id === 'team-local')?.agentIds).toStrictEqual(['agent-local']);
    expect(snapshot.teams.find((team) => team.id === 'team-pointer')?.agentIds).toStrictEqual([]);
    expect(remoteClients.request).not.toHaveBeenCalled();
  });

  it('projects only the selected remote team state into local snapshots', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    snapshot.activeTeamId = 'team-pointer';
    const remoteAgent = createRemoteAgent();
    const otherRemoteAgent = {
      ...createRemoteAgent(),
      id: 'agent-other-remote',
      teamId: 'team-other-remote',
      name: 'Other Remote',
    };
    const remoteSnapshot = createRemoteTeamSnapshot([remoteAgent]);
    remoteSnapshot.teams.push({
      id: 'team-other-remote',
      name: 'Other Remote Team',
      agentIds: [otherRemoteAgent.id],
      activeAgentId: otherRemoteAgent.id,
    });
    remoteSnapshot.agents.push(otherRemoteAgent);
    remoteSnapshot.messages = [
      createTextMessage('message-remote', remoteAgent.id, 'hello from selected team', 'turn-selected'),
      createTextMessage('message-other-remote', otherRemoteAgent.id, 'hello from other team', 'turn-other'),
    ];
    remoteSnapshot.agentGitStatuses = {
      [remoteAgent.id]: {
        folder: remoteAgent.folder!,
        branch: 'main',
        ahead: 0,
        behind: 0,
        changedFiles: 1,
        addedLines: 3,
        removedLines: 0,
        hasUntracked: false,
        state: 'dirty',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      [otherRemoteAgent.id]: {
        folder: otherRemoteAgent.folder!,
        branch: 'other',
        ahead: 0,
        behind: 0,
        changedFiles: 4,
        addedLines: 10,
        removedLines: 1,
        hasUntracked: false,
        state: 'dirty',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
    };
    remoteSnapshot.turnGitDiffs = {
      'turn-selected': {
        turnId: 'turn-selected',
        addedLines: 3,
        removedLines: 0,
        diff: 'selected diff',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      'turn-other': {
        turnId: 'turn-other',
        addedLines: 10,
        removedLines: 1,
        diff: 'other diff',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
    };
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
      id: 'snapshot',
      method: 'snapshot/get',
    })).resolves.toMatchObject({
      result: {
        snapshot: {
          agents: [expect.objectContaining({ id: remoteAgent.id, teamId: 'team-pointer' })],
          messages: [],
          agentGitStatuses: {
            [remoteAgent.id]: expect.objectContaining({ branch: 'main' }),
          },
          turnGitDiffs: {
            'turn-selected': expect.objectContaining({ diff: 'selected diff' }),
          },
        },
      },
    });
    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'snapshot-assertions',
      method: 'snapshot/get',
    });
    expect(response).toHaveProperty('result');
    const projectedSnapshot = (response as { result: { snapshot: AppSnapshot } }).result.snapshot;
    expect(projectedSnapshot.agents.some((agent) => agent.id === otherRemoteAgent.id)).toBe(false);
    expect(projectedSnapshot.messages.some((message) => message.id === 'message-other-remote')).toBe(false);
    expect(projectedSnapshot.agentGitStatuses[otherRemoteAgent.id]).toBeUndefined();
    expect(projectedSnapshot.turnGitDiffs['turn-other']).toBeUndefined();
  });

  it('forwards remote events only for agents in connected remote team pointers', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    const remoteAgent = createRemoteAgent();
    const otherRemoteAgent = {
      ...createRemoteAgent(),
      id: 'agent-other-remote',
      teamId: 'team-other-remote',
      name: 'Other Remote',
    };
    const remoteSnapshot = createRemoteTeamSnapshot([remoteAgent]);
    remoteSnapshot.teams.push({
      id: 'team-other-remote',
      name: 'Other Remote Team',
      agentIds: [otherRemoteAgent.id],
      activeAgentId: otherRemoteAgent.id,
    });
    remoteSnapshot.agents.push(otherRemoteAgent);
    const events: unknown[] = [];
    const remoteClients = {
      request: vi.fn(async (_connection, _method: string, _params, onEvent?: (event: unknown) => void) => {
        onEvent?.({
          seq: 1,
          type: 'agent.statusChanged',
          agentId: otherRemoteAgent.id,
          payload: { type: 'working' },
          occurredAt: '2026-06-13T00:00:00.000Z',
          snapshot: remoteSnapshot,
        });
        onEvent?.({
          seq: 2,
          type: 'agent.statusChanged',
          agentId: remoteAgent.id,
          payload: { type: 'working' },
          occurredAt: '2026-06-13T00:00:01.000Z',
          snapshot: remoteSnapshot,
          clientState: {
            sourceFolderPath: '/remote/source',
            shouldPreventDisplaySleep: true,
            shouldPreventDisplaySleepForRemoteAccess: true,
          },
        });
        return {
          snapshot: remoteSnapshot,
          lastEventSeq: 0,
          clientState: {
            sourceFolderPath: '',
            shouldPreventDisplaySleep: false,
          },
        };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      remoteClients: remoteClients as never,
      onEvent: (event) => events.push(event),
    });

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'snapshot',
      method: 'snapshot/get',
    });

    expect(events).toHaveLength(1);
    expect(events).toStrictEqual([
      expect.objectContaining({
        type: 'agent.statusChanged',
        agentId: remoteAgent.id,
        payload: { type: 'working' },
        clientState: {
          sourceFolderPath: '',
          shouldPreventDisplaySleep: false,
          shouldPreventDisplaySleepForRemoteAccess: false,
        },
      }),
    ]);
  });
});
