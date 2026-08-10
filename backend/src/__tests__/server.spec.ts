import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppSnapshot, BackendConversationRef, RendererMessage, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem } from '@codex-claw/core/contracts';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/core/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import { CodexBackendDriver } from '../codex/codex-driver';
import type { CodexSurfaceAgentAdapter } from '../codex/codex-surface-adapter';
import type { WorkIntegrationManager } from '../work-integrations/manager';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import type { AgentGitService } from '../git/agent-git-service';

describe('ClawBackendServer', () => {
  it('rejects unconfirmed git mutations before invoking git', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{ id: 'agent-dina', teamId: snapshot.teams[0]!.id, name: 'Dina', folder: '/repo', backend: 'codex', status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }];
    const stage = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version', snapshot,
      agentGitService: { stage } as unknown as AgentGitService,
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'stage', method: backendMethods.agentGitStage, params: { agentId: 'agent-dina', input: { paths: ['a.ts'], confirmed: false } } })).rejects.toThrow('Staging files requires explicit confirmation.');
    expect(stage).not.toHaveBeenCalled();
  });

  it('responds to backend health requests', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'health-1', method: 'backend/health/get' })).resolves.toStrictEqual({
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

  it('reads plugin status through the runtime-owned inspector', async () => {
    const inspectPluginStatus = vi.fn().mockResolvedValue({ chromeEnabled: true });
    const server = new ClawBackendServer({
      version: 'test-version',
      inspectPluginStatus,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'plugin-status',
      method: backendMethods.settingsPluginStatusGet,
    })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'plugin-status',
      result: { chromeEnabled: true },
    });
    expect(inspectPluginStatus).toHaveBeenCalledOnce();
  });

  it('rejects malformed mutation payloads at the backend protocol boundary', async () => {
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot: createTestSnapshot(),
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', method: 'ignored/notification' })).resolves.toBeUndefined();
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'response', result: {} })).resolves.toMatchObject({
      error: { code: -32600 },
    });

    const invalidRequests: Array<[string, unknown, string]> = [
      [backendMethods.agentCreate, { input: { name: '', folder: '' } }, 'name'],
      [backendMethods.agentFork, { agentId: 'agent-1', messageIndex: -1 }, 'fork message index'],
      [backendMethods.agentOpenInApplicationUpdate, { agentId: 'agent-1', application: 'emacs' }, 'application'],
      [backendMethods.teamCreate, { input: { name: '', color: '#123456' } }, 'name'],
      [backendMethods.teamCreate, { input: { name: 'Team', color: 'transparent' } }, 'color'],
      [backendMethods.benchTemplateCreate, { input: { name: 'Bench', folder: '/tmp', backend: 'other' } }, 'backend'],
      [backendMethods.benchTemplateCreate, { input: { name: '', folder: '', backend: 'codex' } }, 'name'],
      [backendMethods.settingsCodexResourceSharingSet, { input: { enabled: false, mode: 'later' } }, 'sharing'],
      [backendMethods.sourceWorktreesList, { repoPath: '' }, 'repoPath'],
      [backendMethods.sourceWorktreeCreate, { input: { repoPath: '', branchName: '' } }, 'configured'],
      [backendMethods.workProviderConnect, { provider: 'linear' }, 'work integrations'],
      [backendMethods.snapshotBenchGet, { location: { kind: 'elsewhere' } }, 'location'],
      [backendMethods.snapshotLoopsGet, { location: { kind: 'elsewhere' } }, 'location'],
    ];

    for (const [method, params, message] of invalidRequests) {
      let actualMessage = '';
      try {
        const response = await server.handleMessage({ jsonrpc: '2.0', id: method, method, params });
        actualMessage = response && 'error' in response ? response.error.message : '';
      } catch (error) {
        actualMessage = error instanceof Error ? error.message : String(error);
      }
      expect(actualMessage.toLowerCase()).toContain(message.toLowerCase());
    }

    await expect(server.handleMessage({
      jsonrpc: '2.0', id: 'work-manager', method: backendMethods.workProviderConnectionsReload,
    })).rejects.toThrow('Work integrations are not configured');
    await expect(server.handleMessage({
      jsonrpc: '2.0', id: 'loop-runner', method: backendMethods.loopDueRun,
    })).rejects.toThrow('Loop runner is not configured');
    await server.close();
  });

  it('routes the debug message fixture through the MCP messaging port', async () => {
    const snapshot = createTestSnapshot();
    snapshot.agents = [
      {
        id: 'agent-target',
        teamId: 'team-test',
        name: 'Target',
        folder: '/src/target',
        backend: 'codex',
        status: { type: 'idle' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      {
        id: 'agent-sender',
        teamId: 'team-test',
        name: 'Sender',
        folder: '/src/sender',
        backend: 'codex',
        status: { type: 'idle' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
    ];
    const sendAgentMessage = vi.fn();
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      sendAgentMessage,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'debug-message',
      method: backendMethods.debugAgentMessageSend,
      params: { agentId: 'agent-target' },
    })).resolves.toMatchObject({
      result: {
        recipientId: 'agent-target',
        senderId: 'agent-sender',
      },
    });
    expect(sendAgentMessage).toHaveBeenCalledWith(
      'agent-sender',
      'agent-target',
      'Reply with a brief confirmation that the Debug menu message arrived.',
    );
  });

  it('toggles the persisted debug execution plan through the backend event pipeline', async () => {
    const snapshot = createTestSnapshot();
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
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
    });

    const createResult = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'debug-plan-create',
      method: backendMethods.debugExecutionPlanToggle,
      params: { agentId: 'agent-dina' },
    });
    expect(createResult).toMatchObject({
      result: {
        agents: [{
          id: 'agent-dina',
          plan: {
            explanation: 'Debug execution plan',
            steps: [
              { step: 'Inspect the current state', status: 'completed' },
              { step: 'Exercise the execution-plan overlay', status: 'inProgress' },
              { step: 'Remove the debug fixture', status: 'pending' },
            ],
          },
        }],
      },
    });
    expect(snapshot.messages.some((message) => message.parts.some((part) => part.type === 'tool' && part.id.startsWith('plan-debug-plan-')))).toBe(true);

    const removeResult = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'debug-plan-remove',
      method: backendMethods.debugExecutionPlanToggle,
      params: { agentId: 'agent-dina' },
    });
    expect(removeResult).toMatchObject({ result: { agents: [{ id: 'agent-dina' }] } });
    expect((removeResult as { result: AppSnapshot }).result.agents[0]?.plan).toBeUndefined();
    expect(snapshot.messages.some((message) => message.parts.some((part) => part.type === 'tool' && part.id.startsWith('plan-debug-plan-')))).toBe(false);
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
  });

  it('replaces a stale execution plan on the first debug-menu request', async () => {
    const snapshot = createTestSnapshot();
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'idle' },
      plan: {
        threadId: 'thread-old',
        turnId: 'turn-old',
        kind: 'execution',
        status: 'incomplete',
        explanation: 'Old plan',
        steps: [{ step: 'Old step', status: 'pending' }],
        markdown: 'Old plan',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.messages = [{
      id: 'assistant-new',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'complete',
      turnId: 'turn-new',
      parts: [{ type: 'text', text: 'Newer work' }],
      createdAt: '2026-06-13T00:01:00.000Z',
    }];
    const server = new ClawBackendServer({ version: 'test-version', snapshot });

    const result = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'debug-plan-replace-stale',
      method: backendMethods.debugExecutionPlanToggle,
      params: { agentId: 'agent-dina' },
    });

    expect(result).toMatchObject({
      result: {
        agents: [{
          id: 'agent-dina',
          plan: {
            explanation: 'Debug execution plan',
            turnId: expect.stringMatching(/^debug-plan-/u),
          },
        }],
      },
    });
  });

  it('injects a proposed plan and emits the normal plan-review side-panel request', async () => {
    const snapshot = createTestSnapshot();
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
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    const events: unknown[] = [];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      onEvent: (event) => events.push(event),
    });

    const result = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'debug-plan-review',
      method: backendMethods.debugPlanReviewInject,
      params: { agentId: 'agent-dina' },
    });

    expect(result).toMatchObject({ result: { agents: [{ id: 'agent-dina', plan: { markdown: expect.stringContaining('# Debug plan review') } }] } });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'sidePanel.markdownRequested',
        payload: expect.objectContaining({
          kind: 'markdown',
          purpose: 'plan',
          title: 'Debug plan review',
          content: expect.stringMatching(/## Key Changes[\s\S]*## Commit Strategy/u),
        }),
      }),
    ]));
  });

  it('routes system permission requests through the backend system port', async () => {
    const status: SystemPermissionsStatus = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: false,
      },
      screenRecording: {
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
      screenRecording: {
        required: true,
        trusted: false,
      },
    };
    const screenRecordingStatus: SystemPermissionsStatus = {
      ...openedStatus,
      screenRecording: { required: true, trusted: true },
    };
    const systemPermissions = {
      getStatus: vi.fn().mockResolvedValue(status),
      openAccessibilitySettings: vi.fn().mockResolvedValue(openedStatus),
      openScreenRecordingSettings: vi.fn().mockResolvedValue(screenRecordingStatus),
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      systemPermissions,
    });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'permissions', method: 'system/permissions/get' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'permissions',
      result: status,
    });
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'open-permissions', method: 'system/permissions/accessibility/open' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'open-permissions',
      result: openedStatus,
    });
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'open-screen-recording', method: 'system/permissions/screenRecording/open' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'open-screen-recording',
      result: screenRecordingStatus,
    });
    expect(systemPermissions.getStatus).toHaveBeenCalledOnce();
    expect(systemPermissions.openAccessibilitySettings).toHaveBeenCalledOnce();
    expect(systemPermissions.openScreenRecordingSettings).toHaveBeenCalledOnce();
  });

  it('returns a non-desktop system permission status when no host port is configured', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'permissions', method: 'system/permissions/get' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'permissions',
      result: {
        platform: 'unsupported',
        accessibility: {
          required: false,
          trusted: true,
        },
        screenRecording: {
          required: false,
          trusted: true,
        },
      },
    });
  });

  it('routes device pairing requests through the Codex driver RPC boundary', async () => {
    const status = { status: 'connected', environmentId: 'environment-1' };
    const handle = vi.fn().mockResolvedValue(status);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      driverRpc: {
        handle,
        onEvent: vi.fn(() => () => undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as BackendDriverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0', id: 'pairing-status', method: 'devicePairing/status/get',
    })).resolves.toStrictEqual({ jsonrpc: '2.0', id: 'pairing-status', result: status });
    await expect(server.handleMessage({
      jsonrpc: '2.0', id: 'pairing-revoke', method: 'devicePairing/client/revoke',
      params: { environmentId: 'environment-1', clientId: 'client-1' },
    })).resolves.toStrictEqual({ jsonrpc: '2.0', id: 'pairing-revoke', result: status });

    expect(handle).toHaveBeenCalledWith('devicePairing/status/get', undefined);
    expect(handle).toHaveBeenCalledWith('devicePairing/client/revoke', {
      environmentId: 'environment-1', clientId: 'client-1',
    });
  });

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
            status: 'working' as const,
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
              status: 'working',
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
        folder: remoteAgent.folder,
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
        folder: otherRemoteAgent.folder,
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
          messages: [expect.objectContaining({ id: 'message-remote', agentId: remoteAgent.id })],
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
      }),
    ]);
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
        clientState: {
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

  it('derives client state from backend-owned snapshot state', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    snapshot.general.preventSleepWhenAgentsRun = true;
    snapshot.general.preventSleepWhenRemoteAccessEnabled = true;
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
      method: 'client/state/get',
    })).resolves.toMatchObject({
      result: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: true,
        shouldPreventDisplaySleepForRemoteAccess: false,
      },
    });

    snapshot.general.preventSleepWhenAgentsRun = false;
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'desktop-state-disabled',
      method: 'client/state/get',
    })).resolves.toMatchObject({
      result: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: false,
        shouldPreventDisplaySleepForRemoteAccess: false,
      },
    });
  });

  it('hydrates remote-control status before deriving initial client state', async () => {
    const snapshot = createTestSnapshot();
    snapshot.general.preventSleepWhenAgentsRun = true;
    snapshot.general.preventSleepWhenRemoteAccessEnabled = true;
    const handle = vi.fn(async (method: string) => method === backendMethods.devicePairingStatusGet ? {
      status: 'connected',
      serverName: 'Codex remote control',
      installationId: 'installation-1',
      environmentId: 'environment-1',
    } : undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: {
        handle,
        onEvent: vi.fn(() => () => undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as BackendDriverRpc,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'snapshot',
      method: 'snapshot/get',
    })).resolves.toMatchObject({
      result: {
        clientState: {
          shouldPreventDisplaySleepForRemoteAccess: true,
        },
      },
    });
    expect(handle).toHaveBeenCalledWith(backendMethods.devicePairingStatusGet, undefined);
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

    expect(handle).toHaveBeenCalledWith('source/folder/detect', undefined);
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

  it('does not accept legacy backend method names', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    for (const method of ['bench/snapshot', 'agent/listFiles']) {
      await expect(server.handleMessage({ jsonrpc: '2.0', id: method, method })).resolves.toStrictEqual({
        jsonrpc: '2.0',
        id: method,
        error: {
          code: -32601,
          message: `Unknown backend method: ${method}`,
        },
      });
    }
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
      clientState: {
        shouldPreventDisplaySleep: true,
        shouldPreventDisplaySleepForRemoteAccess: false,
      },
    }]);
    emitEvent({
      backend: 'codex',
      type: 'devicePairing.statusChanged',
      payload: {
        status: 'connected',
        serverName: 'Codex remote control',
        installationId: 'installation-1',
        environmentId: 'environment-1',
      },
    });
    expect(events).toContainEqual(expect.objectContaining({
      seq: 2,
      type: 'devicePairing.statusChanged',
      clientState: expect.objectContaining({ shouldPreventDisplaySleepForRemoteAccess: true }),
    }));
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get' })).resolves.toMatchObject({
      result: {
        lastEventSeq: 2,
      },
    });
  });

  it('refreshes authoritative git status after a completed file mutation', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      status: { type: 'working' },
      backendSession: { kind: 'codex', threadId: 'thread-test' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
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
      threadId: 'thread-test',
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
    });

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
      payload: expect.not.objectContaining({ messages: expect.anything() }),
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
    });
    server.emitEvent({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-dina',
      type: 'turn.planUpdated',
      payload: { explanation: 'working', plan: [] },
    });
    expect(saveSnapshot).not.toHaveBeenCalled();

    server.emitEvent({
      agentId: 'agent-dina',
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
      payload: { markdown: '# Proposed plan\n\n- Build it' },
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
      method: 'workProvider/backlog/configure',
      params: { input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } } },
    })).resolves.toMatchObject({ result: snapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'items',
      method: 'workProvider/items/list',
      params: { provider: 'github', repositoryId: 'nbonamy/codex-claw' },
    })).resolves.toMatchObject({
      result: [{ id: 'github:nbonamy/codex-claw#12' }],
    });

    expect(workIntegrations.connect).toHaveBeenCalledWith('github');
    expect(workIntegrations.configureBacklog).toHaveBeenCalledWith({ provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } });
    expect(workIntegrations.listItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw');
  });

  it('reloads work provider connections from token storage', async () => {
    const snapshot = createTestSnapshot();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const workIntegrations = {
      hydrateConnections: vi.fn(async () => {
        snapshot.workBacklog.connections = [{
          provider: 'github',
          status: 'connected',
          accountLabel: 'nbonamy',
          connectedAt: '2026-06-14T10:00:00.000Z',
        }];
      }),
    } as unknown as WorkIntegrationManager;
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      workIntegrations,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'reload-work-providers',
      method: 'workProvider/connections/reload',
    })).resolves.toMatchObject({
      result: {
        workBacklog: {
          connections: [{
            provider: 'github',
            status: 'connected',
            accountLabel: 'nbonamy',
          }],
        },
      },
    });

    expect(workIntegrations.hydrateConnections).toHaveBeenCalledOnce();
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('owns agent selection hydration and git status refresh', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.teams[0]!.activeAgentId = 'agent-dina';
    snapshot.activeAgentId = 'agent-dina';
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
      id: 'initial-snapshot',
      method: 'snapshot/get',
    })).resolves.toMatchObject({
      result: { snapshot: { activeAgentId: 'agent-dina' } },
    });
    await vi.waitFor(() => expect(getGitStatus).toHaveBeenCalledOnce());

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
    expect(getGitStatus).toHaveBeenCalledOnce();
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'snapshot.updated' }),
      expect.objectContaining({ type: 'git.statusUpdated', agentId: 'agent-dina' }),
    ]));
    expect(saveSnapshot).toHaveBeenCalled();
    await server.close();
  });

  it('evicts an inactive transcript and reloads it from the backend on selection', async () => {
    let now = 0;
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-active', 'agent-background'];
    snapshot.activeAgentId = 'agent-active';
    snapshot.agents = [
      {
        id: 'agent-active',
        teamId: 'team-test',
        name: 'Active',
        folder: '/tmp/active',
        backend: 'codex',
        backendSession: { kind: 'codex', threadId: 'thread-active' },
        status: { type: 'idle' },
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
      {
        id: 'agent-background',
        teamId: 'team-test',
        name: 'Background',
        folder: '/tmp/background',
        backend: 'codex',
        backendSession: { kind: 'codex', threadId: 'thread-background' },
        status: { type: 'idle' },
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
    ];
    snapshot.messages = [
      createTextMessage('active-message', 'agent-active', 'keep'),
      createTextMessage('background-message', 'agent-background', 'evict'),
    ];
    const forgetAgentSession = vi.fn();
    const hydrateAgent = vi.fn().mockResolvedValue({ kind: 'codex', threadId: 'thread-background' });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      getGitStatus: async () => null,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forgetAgentSession,
      hydrateAgent,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const events: Array<{ type: string; agentId?: string; payload?: unknown }> = [];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      onEvent: (event) => events.push(event),
      transcriptRetention: { ttlMs: 300, sweepIntervalMs: null, now: () => now },
    });

    now = 300;
    const retention = server as unknown as {
      transcriptRetention: { sweep(): Promise<readonly string[]> };
    };
    await expect(retention.transcriptRetention.sweep()).resolves.toStrictEqual(['agent-background']);
    expect(snapshot.messages).toStrictEqual([
      expect.objectContaining({ id: 'active-message', agentId: 'agent-active' }),
    ]);
    expect(forgetAgentSession).toHaveBeenCalledWith('agent-background');
    expect(events).toContainEqual(expect.objectContaining({
      type: 'thread.historyLoaded',
      agentId: 'agent-background',
      payload: { messages: [], replace: true },
    }));

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 'select-background',
      method: 'agent/select',
      params: { agentId: 'agent-background' },
    });
    expect(hydrateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-background' }));
    await server.close();
  });

  it('hydrates persisted agent history without changing active selection', async () => {
    const snapshot = createTestSnapshot();
    snapshot.activeAgentId = 'agent-dina';
    snapshot.agents = [
      {
        id: 'agent-dina',
        teamId: 'team-test',
        name: 'Dina',
        folder: '/Users/nbonamy/src/codex-claw',
        backend: 'codex',
        status: { type: 'idle' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      {
        id: 'agent-jesse',
        teamId: 'team-test',
        name: 'Jesse',
        folder: '/Users/nbonamy/src/multi-llm-ts',
        backend: 'codex',
        backendSession: { kind: 'codex', threadId: 'thread-old' },
        status: { type: 'idle' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
    ];
    const hydrateAgent = vi.fn().mockResolvedValue({ kind: 'codex', threadId: 'thread-hydrated' });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      hydrateAgent,
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
      id: 'hydrate',
      method: 'agent/history/hydrate',
      params: { agentId: 'agent-jesse' },
    })).resolves.toMatchObject({
      result: {
        activeAgentId: 'agent-dina',
        agents: [
          { id: 'agent-dina' },
          { id: 'agent-jesse', backendSession: { kind: 'codex', threadId: 'thread-hydrated' } },
        ],
      },
    });

    expect(hydrateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-jesse' }));
    expect(saveSnapshot).toHaveBeenCalled();
    expect(snapshot.activeAgentId).toBe('agent-dina');
    await server.close();
  });

  it('revalidates a selected agent while keeping its live in-memory messages', async () => {
    const snapshot = createTestSnapshot();
    snapshot.activeAgentId = null;
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-live' },
      status: { type: 'working' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.messages = [{
      id: 'assistant-live',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      parts: [{
        type: 'tool',
        id: 'tool-live',
        kind: 'command',
        title: 'Run npm test',
        status: 'running',
        input: { cmd: 'npm test' },
      }],
      createdAt: '2026-06-13T00:00:00.000Z',
    }];
    const hydrateAgent = vi.fn().mockResolvedValue({ kind: 'codex', threadId: 'thread-stale' });
    const getGitStatus = vi.fn().mockResolvedValue(null);
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
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'select-live',
      method: 'agent/select',
      params: { agentId: 'agent-dina' },
    });
    expect(response).toMatchObject({
      result: {
        activeAgentId: 'agent-dina',
      },
    });
    expect((response as { result: Record<string, unknown> }).result).not.toHaveProperty('messages');
    expect(snapshot.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'assistant-live', parts: [expect.objectContaining({ type: 'tool' })] }),
    ]));

    expect(hydrateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(getGitStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    await server.close();
  });

  it('hydrates the selected team active agent and refreshes git status', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams = [
      { id: 'team-test', name: 'Test Team', agentIds: ['agent-dina'], activeAgentId: 'agent-dina' },
      { id: 'team-other', name: 'Other Team', agentIds: ['agent-jesse'], activeAgentId: 'agent-jesse' },
    ];
    snapshot.activeTeamId = 'team-test';
    snapshot.activeAgentId = 'agent-dina';
    snapshot.agents = [
      {
        id: 'agent-dina',
        teamId: 'team-test',
        name: 'Dina',
        folder: '/Users/nbonamy/src/codex-claw',
        backend: 'codex',
        status: { type: 'idle' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
      {
        id: 'agent-jesse',
        teamId: 'team-other',
        name: 'Jesse',
        folder: '/Users/nbonamy/src/multi-llm-ts',
        backend: 'codex',
        backendSession: { kind: 'codex', threadId: 'thread-old' },
        status: { type: 'idle' },
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      },
    ];
    const hydrateAgent = vi.fn().mockResolvedValue({ kind: 'codex', threadId: 'thread-hydrated' });
    const getGitStatus = vi.fn().mockResolvedValue({
      folder: '/Users/nbonamy/src/multi-llm-ts',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 1,
      addedLines: 3,
      removedLines: 2,
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
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'select-team',
      method: 'team/select',
      params: { teamId: 'team-other' },
    })).resolves.toMatchObject({
      result: {
        activeTeamId: 'team-other',
        activeAgentId: 'agent-jesse',
        agents: [
          { id: 'agent-dina' },
          { id: 'agent-jesse', backendSession: { kind: 'codex', threadId: 'thread-hydrated' } },
        ],
        agentGitStatuses: {
          'agent-jesse': expect.objectContaining({ branch: 'main', state: 'dirty' }),
        },
      },
    });

    expect(hydrateAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-jesse' }));
    expect(getGitStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-jesse', backendSession: { kind: 'codex', threadId: 'thread-hydrated' } }));
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
        id: 'set-open-in-application',
        method: 'agent/externalApplication/update',
        params: { agentId, application: 'xcode' },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId, openInApplication: 'xcode' }],
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'duplicate-agent',
        method: 'agent/duplicate',
        params: { agentId },
      })).resolves.toMatchObject({
        result: {
          agents: [{ id: agentId }, { name: 'Dina Backend (copy)', openInApplication: 'xcode' }],
        },
      });
      const duplicateId = snapshot.agents[1]?.id ?? '';

      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'move-agent',
        method: 'agent/team/move',
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
        method: 'agent/folder/update',
        params: { agentId, folder: tempDir },
      })).resolves.toMatchObject({ result: { activeAgentId: expect.any(String) } });
      expect(snapshot.agents.find((agent) => agent.id === agentId)?.folder).toBe(tempDir);
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'close-agent',
        method: 'agent/delete',
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
        method: 'agent/files/list',
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
        method: 'agent/file/preview',
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
        method: 'agent/file/preview',
        params: { agentId: 'agent-missing', filePath: 'README.md' },
      })).resolves.toMatchObject({
        error: {
          message: 'Agent not found: agent-missing',
        },
      });
      await expect(server.handleMessage({
        jsonrpc: '2.0',
        id: 'traversal-file',
        method: 'agent/file/preview',
        params: { agentId: 'agent-dina', filePath: '../outside.md' },
      })).rejects.toThrow('outside the agent folder');
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
      backendSession: { kind: 'codex', threadId: 'thread-root' },
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    snapshot.activeAgentId = 'agent-dina';
    snapshot.subagentTrees['agent-dina'] = {
      rootConversationId: 'thread-root',
      nodes: {
        'thread-child': {
          conversationId: 'thread-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-13T00:00:00.000Z',
          status: 'completed',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
        'thread-grandchild': {
          conversationId: 'thread-grandchild',
          parentConversationId: 'thread-child',
          createdAt: '2026-06-13T00:00:00.000Z',
          status: 'completed',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
        'thread-legacy-child': {
          conversationId: 'thread-legacy-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-13T00:00:00.000Z',
          status: 'completed',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
      },
      operations: {},
      activities: {
        'activity-child': {
          id: 'activity-child',
          lifecycle: 'completed',
          kind: 'started',
          conversationId: 'thread-child',
          agentPath: '/root/child',
          occurredAt: '2026-06-13T00:00:01.000Z',
        },
        'activity-grandchild': {
          id: 'activity-grandchild',
          lifecycle: 'completed',
          kind: 'started',
          conversationId: 'thread-grandchild',
          agentPath: '/root/child/grandchild',
          occurredAt: '2026-06-13T00:00:02.000Z',
        },
      },
    };
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
    const messages = [{
      ...createTextMessage('user-thread-dina-user-1', 'agent-dina', 'hello'),
      turnId: 'turn-root',
    }];
    const subagentMessage = {
      ...createTextMessage('assistant-thread-child-1', 'agent-dina', 'child result'),
      turnId: 'turn-child',
    };
    const nestedSubagentMessage = {
      ...createTextMessage('assistant-thread-grandchild-1', 'agent-dina', 'nested child result'),
      turnId: 'turn-grandchild',
    };
    const legacySubagentMessage = createTextMessage('assistant-thread-legacy-child-1', 'agent-dina', 'legacy child result');
    const childMessages = [...messages, subagentMessage];
    const grandchildMessages = [subagentMessage, nestedSubagentMessage];
    const legacyChildMessages = [...messages, legacySubagentMessage];
    snapshot.messages = messages;
    const listModels = vi.fn().mockResolvedValue([{ id: 'gpt-test', name: 'GPT Test' }]);
    const listSkills = vi.fn().mockResolvedValue([{ name: 'frontend-design', path: '/skills/frontend-design/SKILL.md' }]);
    const listConversations = vi.fn().mockResolvedValue(conversations);
    const readConversationMessages = vi.fn(async (ref: BackendConversationRef) => {
      if (ref.backend !== 'codex') return messages;
      if (ref.threadId === 'thread-grandchild') return grandchildMessages;
      if (ref.threadId === 'thread-child') return childMessages;
      if (ref.threadId === 'thread-legacy-child') return legacyChildMessages;
      return messages;
    });
    const readConversationSummary = vi.fn(async (_agent: unknown, ref: BackendConversationRef) => ({
      id: ref.backend === 'codex' ? ref.threadId : 'thread-unknown',
      parentConversationId: ref.backend === 'codex' && ref.threadId === 'thread-grandchild'
        ? 'thread-child'
        : 'thread-root',
      agentNickname: ref.backend === 'codex' ? `Nickname ${ref.threadId}` : undefined,
      title: 'Subagent',
      status: 'idle' as const,
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:01.000Z',
      messageCount: 1,
      ref,
    }));
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
      readConversationSummary,
      onEvent: () => () => undefined,
      close: async () => undefined,
    };
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
    });

    await server.handleMessage({ jsonrpc: '2.0', id: 'snapshot', method: 'snapshot/get' });
    await vi.waitFor(() => {
      expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-child']?.agentNickname)
        .toBe('Nickname thread-child');
      expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-grandchild']?.agentNickname)
        .toBe('Nickname thread-grandchild');
      expect(snapshot.subagentTrees['agent-dina']?.nodes['thread-legacy-child']?.agentNickname)
        .toBe('Nickname thread-legacy-child');
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'models',
      method: 'agent/models/list',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: [{ id: 'gpt-test', name: 'GPT Test' }] });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'skills',
      method: 'agent/skills/list',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: [{ name: 'frontend-design' }] });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'conversations',
      method: 'agent/conversations/list',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: conversations });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-dina' } },
    })).resolves.toMatchObject({ result: messages });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'subagent-messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-child' } },
    })).resolves.toMatchObject({ result: childMessages });
    expect(readConversationMessages).not.toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-root' }, 'agent-dina');
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'nested-subagent-messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-grandchild' } },
    })).resolves.toMatchObject({ result: grandchildMessages });
    expect(readConversationMessages.mock.calls.filter(([candidate]) => (
      candidate.backend === 'codex' && candidate.threadId === 'thread-child'
    ))).toHaveLength(1);
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'legacy-subagent-messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-legacy-child' } },
    })).resolves.toMatchObject({ result: legacyChildMessages });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'unknown-ref',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex', threadId: 'thread-unknown' } },
    })).resolves.toMatchObject({ error: { message: 'Conversation reference is not available.' } });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'invalid-ref',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-dina', ref: { backend: 'codex' } },
    })).resolves.toMatchObject({ error: { message: 'Invalid conversation reference.' } });

    expect(listModels).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(listSkills).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(listConversations).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-child' }, 'agent-dina');
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-grandchild' }, 'agent-dina');
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-legacy-child' }, 'agent-dina');
    expect(readConversationMessages).not.toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-root' }, 'agent-dina');
    await server.close();
  });

  it('reads stored loop conversation messages after cleanup removes the agent', async () => {
    const snapshot = createTestSnapshot();
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
        completedAt: '2026-06-15T01:30:48.802Z',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-cleaned-up',
          agentName: 'Cleaned Up',
          workItemId: 'github:nbonamy/codex-claw#5',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/5',
          conversationRef: { backend: 'codex', threadId: 'thread-cleaned-up' },
        }],
      }],
    }];
    const messages = [createTextMessage('user-thread-cleaned-up-user-1', 'agent-cleaned-up', 'done')];
    const readConversationMessages = vi.fn().mockResolvedValue(messages);
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
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
      id: 'messages',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-cleaned-up', ref: { backend: 'codex', threadId: 'thread-cleaned-up' } },
    })).resolves.toMatchObject({ result: messages });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'unknown-ref',
      method: 'agent/conversation/messages/get',
      params: { agentId: 'agent-cleaned-up', ref: { backend: 'codex', threadId: 'thread-unknown' } },
    })).resolves.toMatchObject({ error: { message: 'Conversation reference is not available.' } });

    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-cleaned-up' }, 'agent-cleaned-up');
    await server.close();
  });

  it('routes remote loop snapshots and mutations without adopting remote snapshot events', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const remoteSnapshot = createTestSnapshot();
    remoteSnapshot.activeTeamId = 'team-remote';
    remoteSnapshot.teams[0]!.id = 'team-remote';
    remoteSnapshot.loops = [{
      id: 'loop-remote',
      name: 'Remote bugs',
      enabled: true,
      source: { provider: 'github', repositoryId: 'nbonamy/codex-claw' },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-remote',
        teamTarget: { mode: 'existing', teamId: 'team-remote' },
      },
      instructions: {},
      executionLog: [],
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
    const remoteClients = {
      request: vi.fn(async (_connection, method: string, _params, onEvent?: (event: unknown) => void) => {
        if (method === 'snapshot/get') {
          return {
            snapshot: remoteSnapshot,
            lastEventSeq: 12,
            clientState: {
              sourceFolderPath: '/home/nicolas/src',
              shouldPreventDisplaySleep: false,
            },
          };
        }
        onEvent?.({
          seq: 13,
          type: 'snapshot.updated',
          payload: remoteSnapshot,
          occurredAt: '2026-06-14T10:01:00.000Z',
          snapshot: remoteSnapshot,
        });
        return remoteSnapshot;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const events: unknown[] = [];
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      onEvent: (event) => events.push(event),
      remoteClients: remoteClients as never,
    });
    const location = { kind: 'remote' as const, remoteConnectionId: 'connection-devbox' };
    const createInput = {
      source: { provider: 'github' as const, repositoryId: 'nbonamy/codex-claw' },
      action: {
        type: 'create-agent-from-bench' as const,
        benchTemplateId: 'bench-remote',
        teamTarget: { mode: 'existing' as const, teamId: 'team-remote' },
      },
    };

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-loop-snapshot',
      method: 'snapshot/loops/get',
      params: { location },
    })).resolves.toMatchObject({ result: remoteSnapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-loop-create',
      method: 'loop/create',
      params: { input: createInput, location },
    })).resolves.toMatchObject({ result: remoteSnapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-backlog-configure',
      method: 'workProvider/backlog/configure',
      params: {
        input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } },
        location,
      },
    })).resolves.toMatchObject({ result: remoteSnapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-loop-update',
      method: 'loop/update',
      params: {
        input: {
          ...createInput,
          id: 'loop-remote',
          name: 'Remote regressions',
        },
        location,
      },
    })).resolves.toMatchObject({ result: remoteSnapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-loop-run',
      method: 'loop/run',
      params: { loopId: 'loop-remote', location },
    })).resolves.toMatchObject({ result: remoteSnapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-loop-history-clear',
      method: 'loop/history/clear',
      params: { loopId: 'loop-remote', location },
    })).resolves.toMatchObject({ result: remoteSnapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-loop-execution-delete',
      method: 'loop/execution/delete',
      params: { loopId: 'loop-remote', executionId: 'loop-exec-1', location },
    })).resolves.toMatchObject({ result: remoteSnapshot });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-loop-delete',
      method: 'loop/delete',
      params: { loopId: 'loop-remote', location },
    })).resolves.toMatchObject({ result: remoteSnapshot });

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
      'loop/create',
      { input: createInput },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      3,
      snapshot.remoteConnections.connections[0],
      'workProvider/backlog/configure',
      { input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } } },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      4,
      snapshot.remoteConnections.connections[0],
      'loop/update',
      {
        input: {
          ...createInput,
          id: 'loop-remote',
          name: 'Remote regressions',
        },
      },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      5,
      snapshot.remoteConnections.connections[0],
      'loop/run',
      { loopId: 'loop-remote' },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      6,
      snapshot.remoteConnections.connections[0],
      'loop/history/clear',
      { loopId: 'loop-remote' },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      7,
      snapshot.remoteConnections.connections[0],
      'loop/execution/delete',
      { loopId: 'loop-remote', executionId: 'loop-exec-1' },
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenNthCalledWith(
      8,
      snapshot.remoteConnections.connections[0],
      'loop/delete',
      { loopId: 'loop-remote' },
      expect.any(Function),
    );
    expect(snapshot.activeTeamId).toBe('team-test');
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'snapshot.updated' }));
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
      method: 'agent/git/diff/open',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({ result: true });

    expect(getGitDiff).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-dina',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        scope: 'workingTree',
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
      method: 'agent/git/diff/open',
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
      method: 'agent/workItem/assign',
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
      method: 'agent/workItem/assignment/delete',
      params: { item },
    })).resolves.toMatchObject({
      result: {
        workBacklog: { assignments: {} },
      },
    });
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'invalid-item',
      method: 'agent/workItem/assign',
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
      method: 'agent/conversation/resume',
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
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      forkConversation,
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
      expect(snapshot.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: 'agent-dina', role: 'user', parts: [{ type: 'text', text: 'hello codex' }] }),
      ]));
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
      method: 'agent/prompt/send',
      params: { agentId: 'agent-dina', prompt: '/compact' },
    });
    await flushMicrotasks();

    expect(tryHandlePromptCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), '/compact');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.messages).toHaveLength(0);
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
    });

    await server.handleMessage({
      jsonrpc: '2.0', id: 'queue', method: 'agent/prompt/send',
      params: {
        agentId: 'agent-dina',
        prompt: 'run next',
        options: { attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }] },
      },
    });
    expect(snapshot.queuedPrompts).toEqual([expect.objectContaining({
      agentId: 'agent-dina',
      text: 'run next',
      options: { attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }] },
    })]);
    expect(sendPrompt).not.toHaveBeenCalled();

    server.emitEvent({
      agentId: 'agent-dina', threadId: 'thread-dina', turnId: 'turn-old',
      type: 'turn.completed', payload: { status: 'completed' },
    });
    expect(sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'run next', {
      attachments: [{ type: 'file', path: '/tmp/queue.txt', name: 'queue.txt' }],
    });
    expect(snapshot.queuedPrompts).toHaveLength(1);
    const submittedEvent = events.find((event) => event.type === 'message.userSubmitted');
    expect(submittedEvent).toEqual(expect.objectContaining({
      type: 'message.userSubmitted',
      payload: {
        message: expect.objectContaining({
          agentId: 'agent-dina',
          role: 'user',
          parts: [
            { type: 'text', text: 'run next' },
            {
              type: 'attachment',
              attachment: { kind: 'file', path: '/tmp/queue.txt', name: 'queue.txt' },
            },
          ],
        }),
      },
    }));
    expect(submittedEvent).not.toHaveProperty('snapshot');

    acceptPrompt({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-next' });
    await vi.waitFor(() => expect(snapshot.queuedPrompts).toStrictEqual([]));
    await server.close();
  });

  it('retries failed queue drains without losing the item or duplicating its user message', async () => {
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
      agentId: 'agent-dina', threadId: 'thread-dina', turnId: 'turn-old',
      type: 'turn.completed', payload: { status: 'completed' },
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
    expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(snapshot.agents[0]?.status).toStrictEqual({ type: 'error', message: 'transport disconnected' });
    expect((server as unknown as { queuedPromptRetryTimers: Map<string, unknown> }).queuedPromptRetryTimers.size).toBe(1);

    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();
    expect(sendPrompt).toHaveBeenCalledTimes(2);
    expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(snapshot.queuedPrompts).toStrictEqual([]);
    await server.close();
    vi.useRealTimers();
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
      method: 'agent/message/retry',
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
      method: 'agent/message/update',
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
        method: 'bench/agent/template/create',
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
        method: 'bench/template/deploy',
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
        method: 'bench/template/delete',
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

  it('uses the team clawd Bench for remote team save deploy and remove', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0]!.remoteConnectionId = 'connection-devbox';
    snapshot.teams[0]!.remoteTeamId = 'team-remote';
    snapshot.agents = [];
    snapshot.activeAgentId = 'agent-dina';
    const remoteAgent: AppSnapshot['agents'][number] = {
      id: 'agent-dina',
      teamId: 'team-remote',
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
      backend: 'codex' as const,
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    };
    const remoteTemplate = {
      id: 'bench-remote-dina',
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
      backend: 'codex' as const,
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    };
    const remoteSnapshotWithAgent = createRemoteTeamSnapshot([remoteAgent]);
    const remoteSnapshotWithBench = {
      ...createRemoteTeamSnapshot([remoteAgent]),
      bench: [remoteTemplate],
    };
    const remoteSnapshotWithoutBench = {
      ...createRemoteTeamSnapshot([remoteAgent]),
      bench: [],
    };
    const remoteSnapshotWithDeployedAgent = createRemoteTeamSnapshot([remoteAgent, {
      ...createRemoteAgent(),
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    }]);
    const remoteClients = {
      request: vi.fn().mockImplementation((_connection, method: string) => {
        if (method === 'snapshot/get') {
          return Promise.resolve({
            snapshot: remoteSnapshotWithAgent,
            lastEventSeq: 0,
            clientState: {
              sourceFolderPath: '',
              shouldPreventDisplaySleep: false,
            },
          });
        }
        if (method === 'bench/agent/template/create' || method === 'snapshot/bench/get') {
          return Promise.resolve(remoteSnapshotWithBench);
        }
        if (method === 'bench/template/deploy') {
          return Promise.resolve(remoteSnapshotWithDeployedAgent);
        }
        if (method === 'bench/template/delete') {
          return Promise.resolve(remoteSnapshotWithoutBench);
        }
        return Promise.resolve(null);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'save-remote-bench',
      method: 'bench/agent/template/create',
      params: { agentId: 'agent-dina' },
    })).resolves.toMatchObject({
      result: {
        bench: [{ id: 'bench-remote-dina' }],
      },
    });
    expect(snapshot.bench).toStrictEqual([]);
    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'bench/agent/template/create',
      { agentId: 'agent-dina' },
      expect.any(Function),
    );

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'deploy-remote-bench',
      method: 'bench/template/deploy',
      params: {
        templateId: 'bench-remote-dina',
        teamId: 'team-test',
        location: { kind: 'remote', remoteConnectionId: 'connection-devbox' },
      },
    })).resolves.toMatchObject({
      result: {
        agents: [
          { id: 'agent-dina' },
          { id: 'agent-remote', name: 'Remote Dina', folder: '/home/nicolas/src/codex-claw', teamId: 'team-test' },
        ],
        bench: [],
      },
    });
    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'snapshot/bench/get',
      undefined,
      expect.any(Function),
    );
    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'bench/template/deploy',
      {
        templateId: 'bench-remote-dina',
        teamId: 'team-remote',
      },
      expect.any(Function),
    );

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remove-remote-bench',
      method: 'bench/template/delete',
      params: {
        templateId: 'bench-remote-dina',
        location: { kind: 'remote', remoteConnectionId: 'connection-devbox' },
      },
    })).resolves.toMatchObject({
      result: {
        bench: [],
      },
    });
    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'bench/template/delete',
      { templateId: 'bench-remote-dina' },
      expect.any(Function),
    );
    expect(saveSnapshot).toHaveBeenCalledOnce();

    await server.close();
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

  it('changes Codex resource sharing only while chats are idle', async () => {
    const snapshot = createTestSnapshot();
    const configureCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const inspectCodexResourceSharing = vi.fn().mockResolvedValue({ enabled: true, migrationRequired: true });
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      saveSnapshot,
      configureCodexResourceSharing,
      inspectCodexResourceSharing,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-status',
      method: backendMethods.settingsCodexResourceSharingGet,
    })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'resource-sharing-status',
      result: { enabled: true, migrationRequired: true },
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-off',
      method: backendMethods.settingsCodexResourceSharingSet,
      params: { input: { enabled: false, mode: 'copy' } },
    })).resolves.toMatchObject({
      result: {
        general: { shareCodexSkillsAndPlugins: false },
      },
    });

    expect(configureCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode: 'copy' });
    expect(inspectCodexResourceSharing).toHaveBeenCalledWith(true);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('rejects Codex resource sharing changes while a chat is running', async () => {
    const snapshot = createTestSnapshot();
    snapshot.agents = [{
      id: 'agent-working',
      name: 'Working',
      folder: '/src/working',
      backend: 'codex',
      status: { type: 'working' },
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    }];
    const configureCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      configureCodexResourceSharing,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-on',
      method: backendMethods.settingsCodexResourceSharingSet,
      params: { input: { enabled: true } },
    })).rejects.toThrow('Skills and plugins sharing cannot be changed while chats are running.');

    expect(configureCodexResourceSharing).not.toHaveBeenCalled();
  });

  it('allows an active chat to keep the existing isolated resource setup', async () => {
    const snapshot = createTestSnapshot();
    snapshot.agents = [{
      id: 'agent-working',
      name: 'Working',
      folder: '/src/working',
      backend: 'codex',
      status: { type: 'working' },
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    }];
    const configureCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      configureCodexResourceSharing,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'resource-sharing-keep',
      method: backendMethods.settingsCodexResourceSharingSet,
      params: { input: { enabled: false, mode: 'keep' } },
    })).resolves.toMatchObject({
      result: { general: { shareCodexSkillsAndPlugins: false } },
    });

    expect(configureCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode: 'keep' });
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
      method: 'source/repositories/list',
    })).resolves.toMatchObject({
      result: repositories,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/repositories/list', {
      sourceFolderPath: '/Users/nbonamy/src',
    });
  });

  it('routes source repository discovery to selected SSH connections', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const repositories = [{
      name: 'codex-claw',
      path: '/home/nicolas/src/codex-claw',
      worktrees: [{ name: 'main', path: '/home/nicolas/src/codex-claw' }],
    }];
    const remoteClients = {
      request: vi.fn().mockResolvedValue(repositories),
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
      id: 'remote-source-repositories',
      method: 'source/repositories/list',
      params: { remoteConnectionId: 'connection-devbox' },
    })).resolves.toMatchObject({
      result: repositories,
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'source/repositories/list',
      undefined,
      expect.any(Function),
    );
  });

  it('routes source folder listing to selected SSH connections', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const listing = {
      path: '/home/nicolas',
      parentPath: '/home',
      entries: [{
        name: 'src',
        path: '/home/nicolas/src',
      }],
    };
    const remoteClients = {
      request: vi.fn().mockResolvedValue(listing),
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
      id: 'remote-source-folders',
      method: 'source/folders/list',
      params: { remoteConnectionId: 'connection-devbox', path: '/home/nicolas' },
    })).resolves.toMatchObject({
      result: listing,
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'source/folders/list',
      { path: '/home/nicolas' },
      expect.any(Function),
    );
  });

  it('detects a source folder before listing repositories when the saved path is empty', async () => {
    const snapshot = createTestSnapshot();
    snapshot.sourceFolder = {
      path: '',
      initialized: true,
      recentRepoNames: [],
    };
    const repositories = [{
      name: 'witsy',
      path: '/home/mnmt/src/witsy',
      worktrees: [{ name: 'main', path: '/home/mnmt/src/witsy' }],
    }];
    const driverRpc = {
      handle: vi.fn(async (method: string, params: unknown) => {
        if (method === 'source/folder/detect') {
          return '~/src';
        }
        if (method === 'source/repositories/list') {
          expect(params).toStrictEqual({ sourceFolderPath: '~/src' });
          return repositories;
        }
        return undefined;
      }),
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
      method: 'source/repositories/list',
    })).resolves.toMatchObject({
      result: repositories,
    });

    expect(driverRpc.handle).toHaveBeenNthCalledWith(1, 'source/folder/detect', undefined);
    expect(driverRpc.handle).toHaveBeenNthCalledWith(2, 'source/repositories/list', {
      sourceFolderPath: '~/src',
    });
    expect(snapshot.sourceFolder).toMatchObject({
      path: '~/src',
      initialized: true,
    });
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
      method: 'source/worktree/path/suggest',
      params: { input },
    })).resolves.toMatchObject({
      result: '/Users/nbonamy/src/codex-claw-backend-split',
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/worktree/path/suggest', { input });
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
      method: 'source/worktrees/list',
      params: { repoPath: '/Users/nbonamy/src/codex-claw' },
    })).resolves.toMatchObject({
      result: worktrees,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/worktrees/list', {
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
      method: 'source/worktree/create',
      params: { input },
    })).resolves.toMatchObject({
      result: worktree,
    });

    expect(driverRpc.handle).toHaveBeenCalledWith('source/worktree/create', { input });
    expect(snapshot.sourceFolder.recentRepoNames).toStrictEqual(['codex-claw', 'id8']);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('routes source worktree creation to remote clawd without rebrokering metadata', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    const worktree = {
      name: 'remote-agent',
      path: '/home/nicolas/src/codex-claw-remote-agent',
    };
    const remoteClients = {
      request: vi.fn().mockResolvedValue(worktree),
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
      id: 'remote-source-worktree',
      method: 'source/worktree/create',
      params: {
        input: {
          repoPath: '/home/nicolas/src/codex-claw',
          branchName: 'remote-agent',
          remoteConnectionId: 'connection-devbox',
        },
      },
    })).resolves.toMatchObject({
      result: worktree,
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'source/worktree/create',
      {
        input: {
          repoPath: '/home/nicolas/src/codex-claw',
          branchName: 'remote-agent',
        },
      },
      expect.any(Function),
    );
    expect(snapshot.sourceFolder.recentRepoNames).toStrictEqual([]);
  });

  it('creates agents in remote teams using the team SSH connection', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    const remoteSnapshot = createRemoteTeamSnapshot([{
      ...createRemoteAgent(),
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    }]);
    const remoteClients = {
      request: vi.fn().mockResolvedValue(remoteSnapshot),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
      saveSnapshot,
      remoteClients: remoteClients as never,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'remote-agent',
      method: 'agent/create',
      params: {
        input: {
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex',
        },
      },
    })).resolves.toMatchObject({
      result: {
        teams: [{
          id: 'team-test',
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-remote',
          agentIds: ['agent-remote'],
        }],
        agents: [{
          id: 'agent-remote',
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          teamId: 'team-test',
        }],
      },
    });

    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'agent/create',
      {
        input: {
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex',
          teamId: 'team-remote',
        },
      },
      expect.any(Function),
    );
    expect(snapshot.agents).toStrictEqual([]);
    expect(saveSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('does not wait for remote git status refresh before completing agent creation', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    const remoteSnapshot = createRemoteTeamSnapshot([{
      ...createRemoteAgent(),
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    }]);
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

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const response = await Promise.race([
      server.handleMessage({
        jsonrpc: '2.0',
        id: 'remote-agent',
        method: 'agent/create',
        params: {
          input: {
            name: 'Remote Dina',
            folder: '/home/nicolas/src/codex-claw',
            backend: 'codex',
          },
        },
      }),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve('timed-out'), 50);
      }),
    ]);
    if (timeout) {
      clearTimeout(timeout);
    }

    expect(response).toMatchObject({
      result: {
        agents: [{
          id: 'agent-remote',
          name: 'Remote Dina',
        }],
      },
    });
    expect(remoteClients.request).toHaveBeenCalledWith(
      snapshot.remoteConnections.connections[0],
      'agent/create',
      {
        input: {
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex',
          teamId: 'team-remote',
        },
      },
      expect.any(Function),
    );
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
    if (snapshot.loops[0]) {
      snapshot.loops[0].lastRunAt = '2026-06-13T00:01:00.000Z';
      snapshot.loops[0].lastCreatedCount = 0;
      snapshot.loops[0].lastError = 'GitHub failed';
    }
    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'clear-history',
      method: 'loop/history/clear',
      params: { loopId },
    })).resolves.toMatchObject({ result: { loops: [{ executionLog: [] }] } });
    expect(snapshot.loops[0]).not.toHaveProperty('lastRunAt');
    expect(snapshot.loops[0]).not.toHaveProperty('lastCreatedCount');
    expect(snapshot.loops[0]).not.toHaveProperty('lastError');

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'run',
      method: 'loop/run',
      params: { loopId },
    })).resolves.toMatchObject({ result: { loops: [{ id: loopId }] } });
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'run-due', method: 'loop/due/run' })).resolves.toMatchObject({ result: { loops: [{ id: loopId }] } });

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
    backendApprovals: {},
    agentGitStatuses: {},
    turnGitDiffs: {},
    subagentTrees: {},
    backendRuntimes: [],
    workBacklog: {
      connections: [],
      providerConfigurations: {},
      providerSettings: {},
      assignments: {},
    },
    remoteConnections: {
      connections: [],
    },
    general: {
      preventSleepWhenAgentsRun: true,
      preventSleepWhenRemoteAccessEnabled: true,
      codexBinaryPath: '',
      agentListCompact: false,
      shareCodexSkillsAndPlugins: true,
      appshots: {
        hotkey: 'command',
        destination: 'active-agent',
        playSound: true,
      },
      plugins: {
        computerUseEnabled: false,
        chromeEnabled: false,
      },
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

function readyRemoteConnection(): AppSnapshot['remoteConnections']['connections'][number] {
  return {
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
  };
}

function createRemoteAgent(): AppSnapshot['agents'][number] {
  return {
    id: 'agent-remote',
    teamId: 'team-remote',
    name: 'Dina',
    folder: '/home/mnmt/src/codex-claw',
    backend: 'codex',
    status: { type: 'idle' },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}

function createRemoteTeamSnapshot(agents: AppSnapshot['agents'] = []): AppSnapshot {
  const snapshot = createTestSnapshot();
  snapshot.teams = [{
    id: 'team-remote',
    name: 'Remote Core',
    color: '#46A857',
    agentIds: agents.map((agent) => agent.id),
    activeAgentId: agents[0]?.id,
  }];
  snapshot.agents = agents;
  snapshot.activeTeamId = 'team-remote';
  snapshot.activeAgentId = agents[0]?.id ?? null;
  return snapshot;
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
