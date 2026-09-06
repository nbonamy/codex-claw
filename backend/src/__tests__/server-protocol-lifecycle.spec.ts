import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { Agent, AgentGitStatus, AppSnapshot, BackendConversationRef, RendererMessage, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem } from '@codex-claw/core/contracts';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/core/backend-driver';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';
import type { AgentGitService } from '../git/agent-git-service';
import {
  createTestSnapshot,
  createTextMessage,
} from './server-test-fixtures';

describe('ClawBackendServer', () => {
  it('backfills missing workspace identity before returning the startup snapshot', async () => {
    const snapshot = createTestSnapshot();
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-test',
      name: 'Dina',
      folder: '/repo',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }];
    snapshot.activeAgentId = 'agent-dina';
    const identity = vi.fn().mockResolvedValue({
      kind: 'git',
      folder: '/repo',
      repositoryName: 'repo',
      repositoryRoot: '/repo',
      branch: 'main',
      isLinkedWorktree: false,
      primaryWorktreeRoot: '/repo',
      updatedAt: '2026-08-27T12:00:00.000Z',
    });
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const server = new ClawBackendServer({
      version: 'test-version',
      snapshot,
      saveSnapshot,
      agentGitService: { identity } as unknown as AgentGitService,
    });

    await expect(server.handleMessage({
      jsonrpc: '2.0',
      id: 'startup-snapshot',
      method: backendMethods.snapshotGet,
    })).resolves.toMatchObject({
      result: {
        snapshot: {
          agents: [expect.objectContaining({
            workspace: expect.objectContaining({ repositoryName: 'repo', branch: 'main' }),
          })],
        },
      },
    });

    expect(identity).toHaveBeenCalledWith('/repo');
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    await server.close();
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
      [backendMethods.agentUpdate, { input: { id: 'agent-1', name: 42 } }, 'agent name'],
      [backendMethods.agentFork, { agentId: 'agent-1', turnId: 42 }, 'turnId'],
      [backendMethods.agentOpenInApplicationUpdate, { agentId: 'agent-1', application: 'emacs' }, 'application'],
      [backendMethods.teamCreate, { input: { name: '', color: '#123456' } }, 'name'],
      [backendMethods.teamCreate, { input: { name: 'Team', color: 'transparent' } }, 'color'],
      [backendMethods.settingsCodexResourceSharingSet, { input: { enabled: false, mode: 'later' } }, 'sharing'],
      [backendMethods.sourceWorktreesList, { repoPath: '' }, 'repoPath'],
      [backendMethods.sourceRepositoryClone, { input: { url: '' } }, 'url'],
      [backendMethods.sourceWorktreeCreate, { input: { repoPath: '', branchName: '' } }, 'configured'],
      [backendMethods.workProviderConnect, { provider: 'linear' }, 'work integrations'],
      [backendMethods.snapshotAutomationsGet, { location: { kind: 'elsewhere' } }, 'location'],
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

  it('keeps synchronization snapshots bounded when cached transcripts are large', async () => {
    const snapshot = createTestSnapshot();
    snapshot.messages.push(createTextMessage(
      'message-large-transcript',
      'agent-dina',
      'A'.repeat(1_000_000),
    ));
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot,
    });

    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 'bounded-snapshot',
      method: backendMethods.snapshotGet,
    });

    expect(JSON.stringify(response).length).toBeLessThan(100_000);
    const responseSnapshot = (response as { result: { snapshot: AppSnapshot } }).result.snapshot;
    expect(responseSnapshot.messages).toStrictEqual([]);
    expect(snapshot.messages).toHaveLength(1);
    await server.close();
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

    for (const method of ['agent/listFiles']) {
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
});
