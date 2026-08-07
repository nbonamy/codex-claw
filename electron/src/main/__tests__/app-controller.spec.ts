import { describe, expect, it, vi } from 'vitest';
import { AppController, shouldBlockDisplaySleep } from '../app-controller';
import { createInitialSnapshot, snapshotMetadata } from '@codex-claw/shared/snapshot';
import type { AddSshConnectionInput, AgentFilePreviewResult, AgentFileSearchItem, AppSnapshot, BackendConversationRef, BenchLocation, BrowserState, ClientRequestResponse, CodexAuthentication, CodexChatGptLogin, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingSession, DevicePairingStatus, Loop, LoopCleanup, LoopLocation, LoopTeamTarget, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, RendererMessage, RendererSnapshotState, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SetCodexResourceSharingInput, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, SystemPermissionsStatus, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind } from '@codex-claw/shared/contracts';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';
import { ipcChannels } from '@codex-claw/shared/ipc';
import type { OpenInProvider } from '../open-in';

function callPrivate<Result>(controller: AppController, method: string): Promise<Result> {
  return (controller as unknown as Record<string, () => Promise<Result>>)[method]!();
}

describe('AppController', () => {
  it('keeps agent and AC-only remote-access sleep prevention independent', () => {
    expect(shouldBlockDisplaySleep({
      sourceFolderPath: '',
      shouldPreventDisplaySleep: true,
      shouldPreventDisplaySleepForRemoteAccess: false,
    }, true)).toBe(true);
    expect(shouldBlockDisplaySleep({
      sourceFolderPath: '',
      shouldPreventDisplaySleep: false,
      shouldPreventDisplaySleepForRemoteAccess: true,
    }, false)).toBe(true);
    expect(shouldBlockDisplaySleep({
      sourceFolderPath: '',
      shouldPreventDisplaySleep: false,
      shouldPreventDisplaySleepForRemoteAccess: true,
    }, true)).toBe(false);
  });

  it('routes the Debug message fixture to the active agent through clawd', async () => {
    const request = vi.fn().mockResolvedValue({ recipientId: 'agent-dina' });
    const controller = new AppController(createInitialSnapshot(), createBackendClient({ request }));
    const options = (controller as unknown as {
      debugMenuOptions(): { sendDebugAgentMessage(): void };
    }).debugMenuOptions();

    options.sendDebugAgentMessage();

    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(
      backendMethods.debugAgentMessageSend,
      { agentId: 'agent-dina' },
    ));
  });

  it('queues valid deep links until the renderer is ready, then focuses and dispatches them', () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const send = vi.fn();
    const show = vi.fn();
    const focus = vi.fn();
    setDeepLinkWindow(controller, { send, show, focus });

    expect(controller.openDeepLink('codex-claw://new?prompt=Measure%20this')).toBe(true);
    expect(controller.openDeepLink('https://example.com')).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();

    (controller as unknown as { rendererReady: boolean }).rendererReady = true;
    (controller as unknown as { flushPendingDeepLinkCommands(): void }).flushPendingDeepLinkCommands();

    expect(send).toHaveBeenCalledWith('app:command', {
      type: 'open-agent-composer',
      prompt: 'Measure this',
      submit: true,
    });
  });

  it('returns the latest event-applied snapshot after refreshing client state', async () => {
    const staleSnapshot = createInitialSnapshot();
    let resolveClientState!: (state: ClientState) => void;
    const clientState = new Promise<ClientState>((resolve) => {
      resolveClientState = resolve;
    });
    const request = vi.fn((method: string) => {
      if (method === backendMethods.clientStateGet) return clientState;
      return Promise.resolve({});
    });
    const backendClient = createBackendClient({
      request: vi.fn(),
      clientState: undefined,
    });
    backendClient.request = <Result,>(method: string) => request(method) as Promise<Result>;
    const controller = new AppController(createInitialSnapshot(), backendClient);

    const adoption = adoptBackendSnapshot(controller, staleSnapshot);
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(backendMethods.clientStateGet));
    emitBackendEvent(controller, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-08-02T14:00:00.000Z',
    });
    resolveClientState({ sourceFolderPath: '', shouldPreventDisplaySleep: true });

    await expect(adoption).resolves.toBe(staleSnapshot);
    expect(currentSnapshot(controller)).not.toBe(staleSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentSnapshot(controller).agents[0]?.status).toStrictEqual({ type: 'working' });
  });

  it('waits for the renderer browser pane to load a model-requested URL', async () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const send = vi.fn();
    setMainWindowSend(controller, send);
    const state = {
      url: 'https://example.com/',
      title: 'Example',
      canGoBack: false,
      canGoForward: false,
    };

    const opened = requestBrowserOpen(controller, 'agent-dina', 'primary', 'https://example.com');

    expect(send).toHaveBeenCalledWith('app:command', {
      type: 'open-browser',
      agentId: 'agent-dina',
      browserId: 'primary',
      url: 'https://example.com',
    });
    resolvePendingBrowserOpen(controller, 'agent-dina', 'primary', state);
    await expect(opened).resolves.toStrictEqual(state);
  });

  it('tracks concurrent browser opens independently by agent and browser id', async () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const send = vi.fn();
    setMainWindowSend(controller, send);
    const firstState = { url: 'https://one.example/', title: 'One', canGoBack: false, canGoForward: false };
    const secondState = { url: 'https://two.example/', title: 'Two', canGoBack: false, canGoForward: false };

    const first = requestBrowserOpen(controller, 'agent-dina', 'primary', 'https://one.example');
    const second = requestBrowserOpen(controller, 'agent-jesse', 'primary', 'https://two.example');
    resolvePendingBrowserOpen(controller, 'agent-jesse', 'primary', secondState);
    resolvePendingBrowserOpen(controller, 'agent-dina', 'primary', firstState);

    await expect(first).resolves.toStrictEqual(firstState);
    await expect(second).resolves.toStrictEqual(secondState);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('closes the backend before relaunching the app when restart is requested', async () => {
    const order: string[] = [];
    const appLifecycle = {
      quit: vi.fn(),
      relaunch: vi.fn(() => order.push('relaunch')),
      exit: vi.fn(() => order.push('exit')),
    };
    const backendClient = createBackendClient({
      close: vi.fn(async () => {
        order.push('close');
      }),
    });
    const controller = new AppController(createInitialSnapshot(), backendClient, appLifecycle);

    await controller.initialize();
    await restartApp(controller);

    expect(order).toStrictEqual(['close', 'relaunch', 'exit']);
    expect(appLifecycle.relaunch).toHaveBeenCalledOnce();
    expect(appLifecycle.exit).toHaveBeenCalledWith(0);
    expect(appLifecycle.quit).not.toHaveBeenCalled();
  });

  it('starts and health-checks the configured backend process client', async () => {
    const snapshot = createInitialSnapshot();
    const backendClient = {
      start: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
      request: vi.fn().mockResolvedValue({}),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AppController(snapshot, backendClient);

    await controller.initialize();
    await controller.shutdown();

    expect(backendClient.start).toHaveBeenCalledOnce();
    expect(backendClient.health).toHaveBeenCalledOnce();
    expect(backendClient.close).toHaveBeenCalledOnce();
  });

  it('runs startup daemon maintenance before connecting to clawd', async () => {
    const order: string[] = [];
    const backendClient = createBackendClient();
    backendClient.start = vi.fn().mockImplementation(async () => {
      order.push('backend-start');
    });
    const startupMaintenance = vi.fn().mockImplementation(async () => {
      order.push('maintenance');
    });
    const controller = new AppController(createInitialSnapshot(), backendClient, fakeAppLifecycle(), startupMaintenance);

    await controller.initialize();

    expect(startupMaintenance).toHaveBeenCalledOnce();
    expect(order).toStrictEqual(['maintenance', 'backend-start']);
  });

  it('hydrates its metadata cache from clawd snapshot state', async () => {
    const initialSnapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...createInitialSnapshot(),
      activeAgentId: 'agent-dina',
      activeTeamId: 'team-codex-claw',
      sourceFolder: {
        path: '/Users/nbonamy/src',
        initialized: true,
        recentRepoNames: ['codex-claw'],
      },
    };
    const clientState: ClientState = {
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: false,
    };
    const request = vi.fn();
    const backendClient: NonNullable<ConstructorParameters<typeof AppController>[1]> = {
      start: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
      request: <Result,>(method: string): Promise<Result> => {
        request(method);
        return Promise.resolve((method === 'snapshot/get' ? { snapshot: backendSnapshot, lastEventSeq: 17, clientState } : {}) as Result);
      },
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AppController(initialSnapshot, backendClient);

    await controller.initialize();

    expect(request).toHaveBeenCalledWith('snapshot/get');
    expect(currentSnapshot(controller)).not.toBe(backendSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentClientState(controller)).toStrictEqual(clientState);
  });

  it('forwards full snapshots to the renderer without retaining transcript bodies in main', async () => {
    const backendSnapshot = createInitialSnapshot();
    backendSnapshot.messages.push({
      id: 'large-history-message',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-08-04T00:00:00.000Z',
      parts: [{ type: 'text', text: 'A'.repeat(10_000) }],
    });
    const clientState: ClientState = { sourceFolderPath: '', shouldPreventDisplaySleep: false };
    const backendClient = createBackendClient({
      request: vi.fn(),
    });
    backendClient.request = vi.fn(async (method: string) => {
      if (method === backendMethods.snapshotGet) {
        return { snapshot: backendSnapshot, lastEventSeq: 0, clientState };
      }
      if (method === backendMethods.clientStateGet) return clientState;
      return {};
    }) as typeof backendClient.request;
    const controller = new AppController(createInitialSnapshot(), backendClient);

    await controller.initialize();
    expect(currentSnapshot(controller).messages).toStrictEqual([]);

    const rendererState = await callPrivate<RendererSnapshotState>(controller, 'getSnapshotState');

    expect(rendererState.snapshot.messages).toStrictEqual(backendSnapshot.messages);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });

  it('subscribes to clawd events before hydrating its startup snapshot', async () => {
    const initialSnapshot = createInitialSnapshot();
    const backendSnapshot = createInitialSnapshot();
    backendSnapshot.agents[0]!.status = { type: 'working' };
    const clientState: ClientState = {
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: false,
    };
    let emitBackendEvent: ((event: ClawBackendEvent) => void) | null = null;
    const backendClient: NonNullable<ConstructorParameters<typeof AppController>[1]> = {
      start: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
      request: <Result,>(method: string): Promise<Result> => {
        if (method === 'snapshot/get') {
          emitBackendEvent?.({
            seq: 18,
            backend: 'codex',
            agentId: 'agent-dina',
            type: 'agent.statusChanged',
            payload: { type: 'working' },
            occurredAt: '2026-06-13T00:00:00.000Z',
          });
          return Promise.resolve({ snapshot: backendSnapshot, lastEventSeq: 17, clientState } as Result);
        }
        return Promise.resolve({} as Result);
      },
      onEvent: vi.fn((listener) => {
        emitBackendEvent = listener;
        return () => undefined;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AppController(initialSnapshot, backendClient);
    const send = vi.fn();

    setMainWindowSend(controller, send);
    await controller.initialize();

    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 18,
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
    }));
    expect(currentSnapshot(controller)).not.toBe(backendSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentSnapshot(controller).agents[0]?.status).toStrictEqual({ type: 'working' });
  });

  it('reconnects the selected backend transport and refreshes its snapshot after disconnect', async () => {
    vi.useFakeTimers();
    const initialSnapshot = createInitialSnapshot();
    const reconnectedSnapshot = createInitialSnapshot();
    reconnectedSnapshot.agents[0]!.status = { type: 'working' };
    const clientState: ClientState = { sourceFolderPath: '', shouldPreventDisplaySleep: false };
    let connectionListener: (state: 'connected' | 'disconnected', error?: Error) => void = () => undefined;
    let snapshotReads = 0;
    const backendClient: NonNullable<ConstructorParameters<typeof AppController>[1]> = {
      start: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
      request: vi.fn(async (method: string) => {
        if (method === 'snapshot/get') {
          snapshotReads += 1;
          return {
            snapshot: snapshotReads === 1 ? initialSnapshot : reconnectedSnapshot,
            lastEventSeq: 0,
            clientState,
          };
        }
        return {};
      }) as NonNullable<ConstructorParameters<typeof AppController>[1]>['request'],
      onEvent: vi.fn(() => () => undefined),
      onConnectionState: vi.fn((listener) => {
        connectionListener = listener;
        return () => undefined;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AppController(initialSnapshot, backendClient);
    const send = vi.fn();
    setMainWindowSend(controller, send);
    await controller.initialize();
    send.mockClear();

    connectionListener('disconnected', new Error('socket closed'));
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'client.connectionChanged',
      payload: expect.objectContaining({ status: 'reconnecting', detail: 'socket closed' }),
    }));

    await vi.advanceTimersByTimeAsync(250);
    expect(backendClient.start).toHaveBeenCalledTimes(2);
    expect(currentSnapshot(controller)).not.toBe(reconnectedSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'client.connectionChanged',
      payload: { status: 'connected' },
    }));
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
      payload: expect.not.objectContaining({ messages: expect.anything() }),
    }));
    await controller.shutdown();
  });

  it('caches authoritative snapshot metadata from backend events emitted by the clawd process client', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = createInitialSnapshot();
    backendSnapshot.agents[0]!.status = { type: 'working' };
    const unsubscribe = vi.fn();
    let emitBackendEvent: (event: ClawBackendEvent) => void = () => undefined;
    const backendClient = createBackendClientWithEventEmitter((listener) => {
      emitBackendEvent = listener;
      return unsubscribe;
    });
    const controller = new AppController(snapshot, backendClient);
    const send = vi.fn();

    setMainWindowSend(controller, send);
    await controller.initialize();
    emitBackendEvent({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-13T00:00:00.000Z',
      clientState: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: true,
      },
      snapshot: backendSnapshot,
    });
    await controller.shutdown();

    expect(currentSnapshot(controller)).not.toBe(backendSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }));
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      snapshot: backendSnapshot,
    }));
    expect(currentClientState(controller)).toStrictEqual({
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: true,
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('applies incremental backend events to the Electron metadata cache', async () => {
    const snapshot = createInitialSnapshot();
    const payloadSnapshot = createInitialSnapshot();
    payloadSnapshot.agents[0]!.status = { type: 'working' };
    const controller = new AppController(snapshot, createBackendClient());
    const send = vi.fn();

    setMainWindowSend(controller, send);
    await controller.initialize();
    (controller as unknown as {
      emitBackendEvent(event: ClawBackendEvent): void;
    }).emitBackendEvent({
      seq: 1,
      type: 'snapshot.updated',
      payload: payloadSnapshot,
      occurredAt: '2026-06-13T00:00:00.000Z',
    });

    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentSnapshot(controller).agents[0]?.status).toStrictEqual({ type: 'working' });
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 1,
      type: 'snapshot.updated',
      payload: payloadSnapshot,
    }));
  });

  it('ignores malformed backend event snapshot fields', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    const send = vi.fn();

    setMainWindowSend(controller, send);
    await controller.initialize();
    (controller as unknown as {
      emitBackendEvent(event: ClawBackendEvent): void;
    }).emitBackendEvent({
      seq: 1,
      type: 'snapshot.updated',
      payload: {},
      occurredAt: '2026-06-13T00:00:00.000Z',
      snapshot: {
        teams: [],
        agents: [],
      } as unknown as AppSnapshot,
    });

    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 1,
      type: 'snapshot.updated',
    }));
  });

  it('routes client request responses through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0]!, status: { type: 'idle' as const } }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const response: ClientRequestResponse = {
      id: 'approval-1',
      payload: { decision: 'allow' },
    };

    await controller.initialize();
    await expect(respondToClientRequest(controller, response)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('client/request/respond', { response });
    expect(currentSnapshot(controller)).not.toBe(backendSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });

  it('routes source repository discovery through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const repositories: SourceRepository[] = [{
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [{
        name: 'main',
        path: '/Users/nbonamy/src/codex-claw',
      }],
    }];
    const request = vi.fn().mockResolvedValue(repositories);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listSourceRepositories(controller)).resolves.toStrictEqual(repositories);
    expect(request).toHaveBeenCalledWith('source/repositories/list', undefined);
  });

  it('routes source worktree listing through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const worktrees: SourceWorktree[] = [
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'backend-split', path: '/Users/nbonamy/src/codex-claw-backend-split' },
    ];
    const request = vi.fn().mockResolvedValueOnce(worktrees);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listSourceWorktrees(controller, '/Users/nbonamy/src/codex-claw')).resolves.toStrictEqual(worktrees);
    expect(request).toHaveBeenCalledWith('source/worktrees/list', {
      repoPath: '/Users/nbonamy/src/codex-claw',
    });
  });

  it('routes source worktree creation through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const worktree: SourceWorktree = {
      name: 'backend-split',
      path: '/Users/nbonamy/src/codex-claw-backend-split',
    };
    const request = vi.fn().mockResolvedValueOnce(worktree);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input: CreateSourceWorktreeInput = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await controller.initialize();

    await expect(createSourceWorktree(controller, input)).resolves.toStrictEqual(worktree);
    expect(request).toHaveBeenCalledWith('source/worktree/create', { input });
  });

  it('routes source worktree path suggestions through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const suggestion = '/Users/nbonamy/src/codex-claw-backend-split';
    const request = vi.fn().mockResolvedValueOnce(suggestion);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await controller.initialize();

    await expect(suggestSourceWorktreePath(controller, input)).resolves.toBe(suggestion);
    expect(request).toHaveBeenCalledWith('source/worktree/path/suggest', { input });
  });

  it('routes system permission actions through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const permissionStatus: SystemPermissionsStatus = {
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
    const request = vi.fn()
      .mockResolvedValueOnce(permissionStatus)
      .mockResolvedValueOnce(openedStatus)
      .mockResolvedValueOnce({ ...openedStatus, screenRecording: { required: true, trusted: true } });
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(getSystemPermissions(controller)).resolves.toStrictEqual(permissionStatus);
    await expect(openAccessibilitySettings(controller)).resolves.toStrictEqual(openedStatus);
    await expect(openScreenRecordingSettings(controller)).resolves.toStrictEqual({
      ...openedStatus,
      screenRecording: { required: true, trusted: true },
    });
    expect(request).toHaveBeenNthCalledWith(1, 'system/permissions/get', undefined);
    expect(request).toHaveBeenNthCalledWith(2, 'system/permissions/accessibility/open', undefined);
    expect(request).toHaveBeenNthCalledWith(3, 'system/permissions/screenRecording/open', undefined);
  });

  it('routes work provider actions through clawd when the backend client is connected', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const configuredSnapshot = {
      ...snapshot,
      workBacklog: {
        ...snapshot.workBacklog,
        providerConfigurations: {
          github: { repositoryId: 'nbonamy/codex-claw' },
        },
      },
    };
    const request = vi.fn(async (method: string) => {
      if (method === 'workProvider/connect') {
        return { snapshot, authorization: { provider: 'github', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresAt: '2026-06-13T00:00:00.000Z' } };
      }
      if (method === 'workProvider/backlog/configure') {
        return configuredSnapshot;
      }
      if (method === 'workProvider/items/list') {
        return [{ provider: 'github', id: 'github:nbonamy/codex-claw#12', title: 'Fix bug', url: 'https://github.com/nbonamy/codex-claw/issues/12' }];
      }
      return snapshot;
    });
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(connectWorkProvider(controller, 'github')).resolves.toMatchObject({
      authorization: { provider: 'github', userCode: 'ABCD-1234' },
    });
    await expect(configureWorkBacklog(controller, { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } })).resolves.toStrictEqual(configuredSnapshot);
    await expect(listWorkItems(controller, 'github', 'nbonamy/codex-claw')).resolves.toStrictEqual([{
      provider: 'github',
      id: 'github:nbonamy/codex-claw#12',
      title: 'Fix bug',
      url: 'https://github.com/nbonamy/codex-claw/issues/12',
    }]);
    await expect(configureWorkBacklog(
      controller,
      { provider: 'github', configuration: { repositoryId: 'nbonamy/remote' } },
      { kind: 'remote', remoteConnectionId: 'connection-devbox' },
    )).resolves.toStrictEqual(configuredSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'workProvider/connect', { provider: 'github' });
    expect(request).toHaveBeenNthCalledWith(2, 'workProvider/backlog/configure', { input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } } });
    expect(request).toHaveBeenNthCalledWith(3, 'workProvider/items/list', { provider: 'github', repositoryId: 'nbonamy/codex-claw' });
    expect(request).toHaveBeenNthCalledWith(4, 'workProvider/backlog/configure', {
      input: { provider: 'github', configuration: { repositoryId: 'nbonamy/remote' } },
      location: { kind: 'remote', remoteConnectionId: 'connection-devbox' },
    });
  });

  it('routes work item assignment mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const item = createWorkItem();
    const backendSnapshot = {
      ...snapshot,
      workBacklog: {
        ...snapshot.workBacklog,
        assignments: {
          'github:github:nbonamy/codex-claw#12': {
            provider: 'github',
            itemId: 'github:nbonamy/codex-claw#12',
            agentId: 'agent-dina',
            assignedAt: '2026-06-13T00:00:00.000Z',
            status: 'working',
          },
        },
      },
    } satisfies AppSnapshot;
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(assignWorkItemToAgent(controller, 'agent-dina', item)).resolves.toBe(backendSnapshot);
    await expect(removeWorkItemAssignment(controller, item)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/workItem/assign', { agentId: 'agent-dina', item });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/workItem/assignment/delete', { item });
  });

  it('routes team mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      teams: [
        ...snapshot.teams,
        { id: 'team-backend', name: 'Backend', color: '#7158D4', agentIds: [] },
      ],
      activeTeamId: 'team-backend',
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const createInput: CreateTeamInput = { name: 'Backend', color: '#7158D4' };
    const updateInput: UpdateTeamInput = { id: 'team-backend', name: 'Backend Core', color: '#AA4AB8' };
    const reorderInput: ReorderTeamsInput = { teamId: 'team-backend', beforeTeamId: 'team-codex-claw' };

    await controller.initialize();

    await expect(createTeam(controller, createInput)).resolves.toBe(backendSnapshot);
    await expect(updateTeam(controller, updateInput)).resolves.toBe(backendSnapshot);
    await expect(reorderTeams(controller, reorderInput)).resolves.toBe(backendSnapshot);
    await expect(closeTeam(controller, 'team-backend')).resolves.toBe(backendSnapshot);
    await expect(selectTeam(controller, 'team-codex-claw')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'team/create', { input: createInput });
    expect(request).toHaveBeenNthCalledWith(2, 'team/update', { input: updateInput });
    expect(request).toHaveBeenNthCalledWith(3, 'team/reorder', { input: reorderInput });
    expect(request).toHaveBeenNthCalledWith(4, 'team/delete', { teamId: 'team-backend' });
    expect(request).toHaveBeenNthCalledWith(5, 'team/select', { teamId: 'team-codex-claw' });
  });

  it('routes agent CRUD and layout mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        name: 'Backend Dina',
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const createInput: CreateAgentInput = {
      name: 'Backend Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      teamId: 'team-codex-claw',
    };
    const updateInput: UpdateAgentInput = {
      id: 'agent-dina',
      name: 'Backend Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
    };
    const moveInput: MoveAgentToTeamInput = {
      agentId: 'agent-dina',
      teamId: 'team-codex-claw',
    };
    const reorderInput: ReorderAgentsInput = {
      teamId: 'team-codex-claw',
      agentId: 'agent-dina',
      beforeAgentId: null,
    };

    await controller.initialize();

    await expect(createAgent(controller, createInput)).resolves.toBe(backendSnapshot);
    await expect(updateAgent(controller, updateInput)).resolves.toBe(backendSnapshot);
    await expect(duplicateAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);
    await expect(forkAgent(controller, 'agent-dina', 4)).resolves.toBe(backendSnapshot);
    await expect(moveAgentToTeam(controller, moveInput)).resolves.toBe(backendSnapshot);
    await expect(reorderAgents(controller, reorderInput)).resolves.toBe(backendSnapshot);
    await expect(updateAgentFolder(controller, 'agent-dina', '/Users/nbonamy/src/id8')).resolves.toBe(backendSnapshot);
    await expect(selectAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);
    await expect(closeAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/create', { input: createInput });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/update', { input: updateInput });
    expect(request).toHaveBeenNthCalledWith(3, 'agent/duplicate', { agentId: 'agent-dina' });
    expect(request).toHaveBeenNthCalledWith(4, 'agent/fork', { agentId: 'agent-dina', messageIndex: 4 });
    expect(request).toHaveBeenNthCalledWith(5, 'agent/team/move', { input: moveInput });
    expect(request).toHaveBeenNthCalledWith(6, 'agent/reorder', { input: reorderInput });
    expect(request).toHaveBeenNthCalledWith(7, 'agent/folder/update', { agentId: 'agent-dina', folder: '/Users/nbonamy/src/id8' });
    expect(request).toHaveBeenNthCalledWith(8, 'agent/select', { agentId: 'agent-dina' });
    expect(request).toHaveBeenNthCalledWith(9, 'agent/delete', { agentId: 'agent-dina' });
    expect(request).not.toHaveBeenCalledWith('agent/folder/validate', expect.anything());
  });

  it('routes bench mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      bench: [{
        id: 'bench-dina',
        name: 'Dina',
        folder: '/Users/nbonamy/src/codex-claw',
        backend: 'codex' as const,
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(saveAgentToBench(controller, 'agent-dina')).resolves.toBe(backendSnapshot);
    await expect(deployBenchTemplate(controller, 'bench-dina', 'team-codex-claw')).resolves.toBe(backendSnapshot);
    await expect(removeBenchTemplate(controller, 'bench-dina')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'bench/agent/template/create', { agentId: 'agent-dina' });
    expect(request).toHaveBeenNthCalledWith(2, 'bench/template/deploy', { templateId: 'bench-dina', teamId: 'team-codex-claw' });
    expect(request).toHaveBeenNthCalledWith(3, 'bench/template/delete', { templateId: 'bench-dina' });
  });

  it('keeps remote Bench snapshots out of the local desktop snapshot', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.remoteConnections.connections = [{
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      status: 'ready',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
    snapshot.teams[0]!.remoteConnectionId = 'connection-devbox';
    snapshot.teams[0]!.agentIds = ['agent-dina'];
    snapshot.agents = [{
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      folder: '/home/nicolas/src/codex-claw',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
    }];
    const remoteLocation: BenchLocation = { kind: 'remote', remoteConnectionId: 'connection-devbox' };
    const remoteBenchSnapshot = {
      ...createInitialSnapshot(),
      bench: [{
        id: 'bench-remote-dina',
        name: 'Remote Dina',
        folder: '/home/nicolas/src/codex-claw',
        backend: 'codex' as const,
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      }],
    };
    const deployedLocalSnapshot = {
      ...snapshot,
      agents: [
        ...snapshot.agents,
        {
          id: 'agent-from-remote-bench',
          teamId: 'team-codex-claw',
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex' as const,
          status: { type: 'idle' as const },
          createdAt: '2026-06-13T00:00:00.000Z',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
      ],
    };
    const request = vi.fn().mockImplementation((method: string) => {
      if (method === 'bench/template/deploy') {
        return Promise.resolve(deployedLocalSnapshot);
      }
      return Promise.resolve(remoteBenchSnapshot);
    });
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(getBenchSnapshot(controller, remoteLocation)).resolves.toBe(remoteBenchSnapshot);
    await expect(saveAgentToBench(controller, 'agent-dina')).resolves.toBe(remoteBenchSnapshot);
    await expect(getSnapshot(controller)).resolves.toMatchObject({
      teams: [{ id: 'team-codex-claw', remoteConnectionId: 'connection-devbox' }],
      bench: [],
    });

    await expect(removeBenchTemplate(controller, 'bench-remote-dina', remoteLocation)).resolves.toBe(remoteBenchSnapshot);
    await expect(getSnapshot(controller)).resolves.toMatchObject({
      teams: [{ id: 'team-codex-claw', remoteConnectionId: 'connection-devbox' }],
      bench: [],
    });

    await expect(deployBenchTemplate(controller, 'bench-remote-dina', 'team-codex-claw', remoteLocation)).resolves.toBe(deployedLocalSnapshot);
    await expect(getSnapshot(controller)).resolves.toStrictEqual({ ...deployedLocalSnapshot, messages: [] });

    expect(request).toHaveBeenCalledWith('snapshot/bench/get', { location: remoteLocation });
    expect(request).toHaveBeenCalledWith('bench/agent/template/create', { agentId: 'agent-dina' });
    expect(request).toHaveBeenCalledWith('bench/template/delete', { templateId: 'bench-remote-dina', location: remoteLocation });
    expect(request).toHaveBeenCalledWith('bench/template/deploy', {
      templateId: 'bench-remote-dina',
      teamId: 'team-codex-claw',
      location: remoteLocation,
    });
  });

  it('routes settings updates through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      general: { ...snapshot.general, preventSleepWhenAgentsRun: false },
      theme: { ...snapshot.theme, mode: 'dark' as const },
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input: UpdateSettingsInput = {
      general: { preventSleepWhenAgentsRun: false },
      theme: { mode: 'dark' },
    };

    await controller.initialize();

    await expect(updateSettings(controller, input)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('settings/update', { input });
  });

  it('restarts the background backend after changing Codex resource sharing', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      general: { ...snapshot.general, shareCodexSkillsAndPlugins: false },
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const lifecycle: string[] = [];
    const close = vi.fn().mockImplementation(async () => {
      lifecycle.push('backend-close');
    });
    const appLifecycle = fakeAppLifecycle();
    const daemonStatusLoader = vi.fn().mockResolvedValue({
      supported: true,
      installed: true,
      running: true,
      socketPath: '/tmp/clawd.sock',
      launchAgentPath: '/tmp/clawd.plist',
    });
    const daemonRefresher = vi.fn().mockResolvedValue({
      supported: true,
      installed: true,
      running: true,
      socketPath: '/tmp/clawd.sock',
      launchAgentPath: '/tmp/clawd.plist',
    });
    const backendClient = createBackendClient({ request, close });
    const controller = new AppController(
      snapshot,
      backendClient,
      appLifecycle,
      async () => undefined,
      async () => undefined,
      null,
      daemonStatusLoader,
      daemonRefresher,
    );
    const closeAllBrowserPanes = vi.spyOn((controller as unknown as {
      browserPane: { closeAll(): Promise<void> };
    }).browserPane, 'closeAll').mockImplementation(async () => {
      lifecycle.push('browser-panes-close');
    });
    const input: SetCodexResourceSharingInput = { enabled: false, mode: 'fresh' };

    await controller.initialize();
    await expect(setCodexResourceSharing(controller, input)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith(backendMethods.settingsCodexResourceSharingSet, { input });
    expect(closeAllBrowserPanes).toHaveBeenCalledOnce();
    expect(lifecycle).toStrictEqual(['browser-panes-close', 'backend-close']);
    expect(close).toHaveBeenCalledOnce();
    expect(daemonRefresher).toHaveBeenCalledOnce();
    expect(backendClient.start).toHaveBeenCalledTimes(2);
    expect(appLifecycle.relaunch).not.toHaveBeenCalled();
    expect(appLifecycle.exit).not.toHaveBeenCalled();
  });

  it('closes hosted browser panes before reloading only the renderer', async () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const lifecycle: string[] = [];
    vi.spyOn((controller as unknown as {
      browserPane: { closeAll(): Promise<void> };
    }).browserPane, 'closeAll').mockImplementation(async () => {
      lifecycle.push('browser-panes-close');
    });
    setRendererReloadWindow(controller, () => {
      lifecycle.push('renderer-reload');
    });

    await callPrivate(controller, 'reloadRenderer');

    expect(lifecycle).toStrictEqual(['browser-panes-close', 'renderer-reload']);
  });

  it('reads migration status and keeps the backend running when migration is declined', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      general: { ...snapshot.general, shareCodexSkillsAndPlugins: false },
    };
    const request = vi.fn(async (method: string) => (
      method === backendMethods.settingsCodexResourceSharingGet
        ? { enabled: true, migrationRequired: true }
        : backendSnapshot
    ));
    const close = vi.fn().mockResolvedValue(undefined);
    const appLifecycle = fakeAppLifecycle();
    const controller = new AppController(snapshot, createBackendClient({ request, close }), appLifecycle);

    await controller.initialize();
    await expect(callPrivate(controller, 'getCodexResourceSharingStatus')).resolves.toStrictEqual({
      enabled: true,
      migrationRequired: true,
    });
    await expect(setCodexResourceSharing(controller, { enabled: false, mode: 'keep' })).resolves.toBe(backendSnapshot);

    expect(close).not.toHaveBeenCalled();
    expect(appLifecycle.relaunch).not.toHaveBeenCalled();
    expect(appLifecycle.exit).not.toHaveBeenCalled();
  });

  it('routes isolated Codex authentication and opens the ChatGPT login URL', async () => {
    const authentication: CodexAuthentication = {
      account: null,
      requiresOpenaiAuth: true,
      login: { status: 'idle', error: null },
    };
    const login: CodexChatGptLogin = {
      loginId: 'login-1',
      authUrl: 'https://auth.openai.com/login',
    };
    const request = vi.fn(async (method: string) => (
      method === backendMethods.codexChatGptLoginStart ? login : authentication
    ));
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const controller = new AppController(
      createInitialSnapshot(),
      createBackendClient({ request }),
      fakeAppLifecycle(),
      async () => undefined,
      openExternal,
    );

    await expect(callPrivate<CodexAuthentication>(controller, 'getCodexAuthentication'))
      .resolves.toStrictEqual(authentication);
    await expect(callPrivate<CodexChatGptLogin>(controller, 'startCodexChatGptLogin'))
      .resolves.toStrictEqual(login);
    await expect(callPrivate<CodexAuthentication>(controller, 'cancelCodexChatGptLogin'))
      .resolves.toStrictEqual(authentication);
    await expect(callPrivate<CodexAuthentication>(controller, 'logoutCodex'))
      .resolves.toStrictEqual(authentication);

    expect(request).toHaveBeenCalledWith(backendMethods.codexAuthenticationGet, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.codexChatGptLoginStart, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.codexChatGptLoginCancel, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.codexLogout, undefined);
    expect(openExternal).toHaveBeenCalledWith(login.authUrl);
  });

  it('restarts the app when the Codex executable setting changes', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      general: {
        ...snapshot.general,
        codexBinaryPath: '/opt/homebrew/bin/codex',
      },
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const appLifecycle = fakeAppLifecycle();
    const controller = new AppController(snapshot, createBackendClient({ request }), appLifecycle);
    const input: UpdateSettingsInput = {
      general: {
        codexBinaryPath: ' /opt/homebrew/bin/codex ',
      },
    };

    await controller.initialize();

    await expect(updateSettings(controller, input)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('settings/update', { input });
    expect(appLifecycle.relaunch).toHaveBeenCalledOnce();
    expect(appLifecycle.exit).toHaveBeenCalledWith(0);
  });

  it('routes remote connection actions through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      remoteConnections: {
        connections: [{
          id: 'connection-devbox',
          kind: 'ssh' as const,
          name: 'devbox',
          host: 'devbox',
          status: 'ready' as const,
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        }],
      },
    };
    const hosts: SshHostCandidate[] = [{ host: 'devbox', hostName: 'devbox.internal' }];
    const folders = { path: '/home/nicolas', parentPath: '/home', entries: [{ name: 'src', path: '/home/nicolas/src' }] };
    const request = vi.fn((method: string) => {
      if (method === 'connections/sshHosts/list') {
        return Promise.resolve(hosts);
      }
      if (method === 'source/folders/list') {
        return Promise.resolve(folders);
      }
      return Promise.resolve(backendSnapshot);
    });
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const input: AddSshConnectionInput = {
      host: 'devbox',
      hostName: 'devbox.internal',
    };

    await controller.initialize();

    await expect(listSshHosts(controller)).resolves.toBe(hosts);
    await expect(addSshConnection(controller, input)).resolves.toBe(backendSnapshot);
    await expect(checkRemoteConnection(controller, 'connection-devbox')).resolves.toBe(backendSnapshot);
    await expect(updateRemoteConnection(controller, 'connection-devbox', { sourceFolderPath: '~/src' })).resolves.toBe(backendSnapshot);
    await expect(listSourceFolders(controller, { remoteConnectionId: 'connection-devbox', path: '/home/nicolas' })).resolves.toBe(folders);
    await expect(removeRemoteConnection(controller, 'connection-devbox')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('connections/sshHosts/list', undefined);
    expect(request).toHaveBeenCalledWith('connections/ssh/create', { input });
    expect(request).toHaveBeenCalledWith('connections/sync', { connectionId: 'connection-devbox' });
    expect(request).toHaveBeenCalledWith('connections/update', {
      connectionId: 'connection-devbox',
      input: { sourceFolderPath: '~/src' },
    });
    expect(request).toHaveBeenCalledWith('source/folders/list', {
      remoteConnectionId: 'connection-devbox',
      path: '/home/nicolas',
    });
    expect(request).toHaveBeenCalledWith('connections/delete', { connectionId: 'connection-devbox' });
  });

  it('routes device pairing actions through clawd', async () => {
    const status: DevicePairingStatus = {
      status: 'connected', serverName: 'Claw', installationId: 'installation-1', environmentId: 'environment-1',
    };
    const session: DevicePairingSession = {
      pairingCode: 'opaque-payload', manualPairingCode: 'ABCD-EFGH', environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    };
    const devices: PairedDevice[] = [{ clientId: 'client-1', displayName: 'Nicolas’s iPhone' }];
    const request = vi.fn((method: string) => {
      if (method === backendMethods.devicePairingStart) return Promise.resolve(session);
      if (method === backendMethods.devicePairingStatus) return Promise.resolve(true);
      if (method === backendMethods.devicePairingClientsList) return Promise.resolve(devices);
      if (method === backendMethods.devicePairingClientRevoke) return Promise.resolve(null);
      return Promise.resolve(status);
    });
    const controller = new AppController(createInitialSnapshot(), createBackendClient({ request }));
    await controller.initialize();

    await expect(getDevicePairingStatus(controller)).resolves.toBe(status);
    await expect(enableDevicePairing(controller)).resolves.toBe(status);
    await expect(disableDevicePairing(controller)).resolves.toBe(status);
    await expect(startDevicePairing(controller)).resolves.toBe(session);
    await expect(checkDevicePairing(controller, session)).resolves.toBe(true);
    await expect(listPairedDevices(controller, 'environment-1')).resolves.toBe(devices);
    await expect(revokePairedDevice(controller, 'environment-1', 'client-1')).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingStatusGet, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingEnable, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingDisable, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingStart, undefined);
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingStatus, { session });
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingClientsList, { environmentId: 'environment-1' });
    expect(request).toHaveBeenCalledWith(backendMethods.devicePairingClientRevoke, {
      environmentId: 'environment-1', clientId: 'client-1',
    });
  });

  it('routes loop mutations and runs through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      loops: [loopFixture({
        cleanup: { deleteAgent: false },
        teamTarget: { mode: 'existing', teamId: 'team-codex-claw' },
      })],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const createInput: CreateLoopInput = {
      name: 'GitHub bugs',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
      instructions: {},
    };
    const updateInput: UpdateLoopInput = {
      ...createInput,
      id: 'loop-bugs',
    };

    await controller.initialize();

    await expect(createLoop(controller, createInput)).resolves.toBe(backendSnapshot);
    await expect(updateLoop(controller, updateInput)).resolves.toBe(backendSnapshot);
    await expect(runLoop(controller, 'loop-bugs')).resolves.toBe(backendSnapshot);
    await expect(clearLoopHistory(controller, 'loop-bugs')).resolves.toBe(backendSnapshot);
    await expect(deleteLoopExecution(controller, 'loop-bugs', 'loop-exec-1')).resolves.toBe(backendSnapshot);
    await expect(deleteLoop(controller, 'loop-bugs')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'loop/create', { input: createInput });
    expect(request).toHaveBeenNthCalledWith(2, 'loop/update', { input: updateInput });
    expect(request).toHaveBeenNthCalledWith(3, 'loop/run', { loopId: 'loop-bugs' });
    expect(request).toHaveBeenNthCalledWith(4, 'loop/history/clear', { loopId: 'loop-bugs' });
    expect(request).toHaveBeenNthCalledWith(5, 'loop/execution/delete', { loopId: 'loop-bugs', executionId: 'loop-exec-1' });
    expect(request).toHaveBeenNthCalledWith(6, 'loop/delete', { loopId: 'loop-bugs' });
  });

  it('routes remote loop requests without adopting the remote snapshot', async () => {
    const snapshot = createInitialSnapshot();
    const remoteSnapshot = {
      ...createInitialSnapshot(),
      activeTeamId: 'team-remote',
      loops: [loopFixture({
        cleanup: { deleteAgent: false },
        teamTarget: { mode: 'existing', teamId: 'team-remote' },
      })],
    };
    const request = vi.fn().mockResolvedValue(remoteSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const location: LoopLocation = { kind: 'remote', remoteConnectionId: 'connection-devbox' };
    const createInput: CreateLoopInput = {
      name: 'Remote bugs',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-remote',
        },
      },
      instructions: {},
    };

    await controller.initialize();

    await expect(getLoopSnapshot(controller, location)).resolves.toBe(remoteSnapshot);
    await expect(createLoop(controller, createInput, location)).resolves.toBe(remoteSnapshot);
    await expect(runLoop(controller, 'loop-bugs', location)).resolves.toBe(remoteSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'snapshot/loops/get', { location });
    expect(request).toHaveBeenNthCalledWith(2, 'loop/create', { input: createInput, location });
    expect(request).toHaveBeenNthCalledWith(3, 'loop/run', { loopId: 'loop-bugs', location });
    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });

  it('opens repo git diff previews through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const request = vi.fn().mockResolvedValue(true);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await openAgentGitDiff(controller, 'agent-dina');

    expect(request).toHaveBeenCalledWith('agent/git/diff/open', { agentId: 'agent-dina' });
  });

  it('routes agent restart through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    const backendSnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0]!, backendSession: undefined }],
      messages: snapshot.messages.filter((message) => message.agentId !== 'agent-dina'),
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(restartAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/restart', { agentId: 'agent-dina' });
  });

  it('routes lazy agent history hydration through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...snapshot,
      messages: [
        {
          id: 'assistant-history',
          agentId: 'agent-dina',
          role: 'assistant' as const,
          status: 'complete' as const,
          createdAt: '2026-06-13T00:00:00.000Z',
          parts: [{ type: 'text' as const, text: 'Restored.' }],
        },
      ],
    };
    const backendMetadata = snapshotMetadata(backendSnapshot);
    const request = vi.fn().mockResolvedValue(backendMetadata);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await expect(hydrateAgentHistory(controller, 'agent-dina')).resolves.toBe(backendMetadata);

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('agent/history/hydrate', { agentId: 'agent-dina' });
    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });

  it('caches token usage updates emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    const contextUsage = {
      totalTokens: 1200,
      inputTokens: 900,
      cachedInputTokens: 100,
      outputTokens: 300,
      reasoningOutputTokens: 80,
      lastTotalTokens: 300,
      modelContextWindow: 10000,
      usedPercent: 12,
    };

    await controller.initialize();
    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'thread.tokenUsageUpdated',
      payload: { contextUsage },
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].contextUsage).toStrictEqual(contextUsage);
  });

  it('caches account rate-limit updates emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    const rateLimits = {
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 62,
        windowDurationMins: 300,
        resetsAt: 1_780_756_682,
      },
      secondary: {
        usedPercent: 50,
        windowDurationMins: 10_080,
        resetsAt: 1_781_140_878,
      },
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };

    await controller.initialize();
    emitBackendEvent(controller, {
      type: 'account.rateLimitsUpdated',
      payload: { rateLimits },
    });
    await flushMicrotasks();

    expect(currentSnapshot(controller).accountRateLimits).toStrictEqual(rateLimits);
  });

  it('caches plan updates emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const send = vi.fn();
    const controller = new AppController(snapshot, createBackendClient());

    await controller.initialize();
    setMainWindowSend(controller, send);
    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: 'Current plan',
        plan: [
          { step: 'Inspect app-server event', status: 'completed' },
          { step: 'Preview markdown', status: 'inProgress' },
        ],
      },
      occurredAt: '2026-06-05T10:11:12.000Z',
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      explanation: 'Current plan',
      steps: [
        { step: 'Inspect app-server event', status: 'completed' },
        { step: 'Preview markdown', status: 'inProgress' },
      ],
      markdown: 'Current plan\n- [x] Inspect app-server event\n- [ ] Preview markdown',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
    }));
    expect(send).not.toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'sidePanel.markdownRequested',
    }));
  });

  it('caches completed plan items emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const send = vi.fn();
    const controller = new AppController(snapshot, createBackendClient());

    await controller.initialize();
    setMainWindowSend(controller, send);
    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanCompleted',
      payload: {
        itemId: 'turn-plan-plan',
        markdown: '# Dummy False Plan\n\n- [ ] Do not implement',
      },
      occurredAt: '2026-06-05T10:11:12.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      explanation: '',
      steps: [],
      markdown: '# Dummy False Plan\n\n- [ ] Do not implement',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    await flushMicrotasks();
    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanCompleted',
    }));
    expect(send).not.toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'sidePanel.markdownRequested',
    }));
  });

  it('routes agent goal mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const goalSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
        goal: {
          threadId: 'thread-dina',
          objective: 'Ship the goal shelf',
          status: 'active' as const,
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      }],
    };
    const clearedSnapshot = {
      ...goalSnapshot,
      agents: [{ ...goalSnapshot.agents[0]!, goal: undefined }],
    };
    const request = vi.fn()
      .mockResolvedValueOnce(goalSnapshot)
      .mockResolvedValueOnce(clearedSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(setAgentGoal(controller, 'agent-dina', ' Ship the goal shelf ')).resolves.toBe(goalSnapshot);
    await expect(clearAgentGoal(controller, 'agent-dina')).resolves.toBe(clearedSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/goal/update', { agentId: 'agent-dina', objective: ' Ship the goal shelf ' });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/goal/clear', { agentId: 'agent-dina' });
  });

  it('routes approval preset updates through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
        backendDefaults: {
          kind: 'codex' as const,
          approvalPreset: 'approve-for-me' as const,
          approvalPolicy: 'on-request' as const,
          approvalsReviewer: 'auto_review' as const,
          sandboxMode: 'workspace-write' as const,
        },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(setAgentApprovalPreset(controller, 'agent-dina', 'approve-for-me')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/approvalPreset/update', { agentId: 'agent-dina', preset: 'approve-for-me' });
  });

  it('routes active-turn steering through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(steerPrompt(controller, 'agent-dina', ' try smaller ')).resolves.toBe(backendSnapshot);
    await expect(steerPrompt(controller, 'agent-dina', ' inspect this ', {
      attachments: [{ type: 'file', path: '/tmp/notes.txt', name: 'notes.txt' }],
    })).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/prompt/steer', { agentId: 'agent-dina', prompt: ' try smaller ' });
    expect(request).toHaveBeenCalledWith('agent/prompt/steer', {
      agentId: 'agent-dina',
      prompt: ' inspect this ',
      options: { attachments: [{ type: 'file', path: '/tmp/notes.txt', name: 'notes.txt' }] },
    });
  });

  it('routes queued prompt mutations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const request = vi.fn().mockResolvedValue(snapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    await controller.initialize();

    await expect(steerQueuedPrompt(controller, 'agent-dina', 'prompt-1')).resolves.toBe(snapshot);
    await expect(deleteQueuedPrompt(controller, 'agent-dina', 'prompt-2')).resolves.toBe(snapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'agent/queuedPrompt/steer', { agentId: 'agent-dina', promptId: 'prompt-1' });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/queuedPrompt/delete', { agentId: 'agent-dina', promptId: 'prompt-2' });
  });

  it('routes interruption through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'codex' as const, threadId: 'thread-dina' },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(interruptAgent(controller, 'agent-dina')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/interrupt', { agentId: 'agent-dina' });
  });

  it('routes prompts through clawd by agent id', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backend = 'claude';
    snapshot.agents[0].backendDefaults = { kind: 'claude' };
    const backendSnapshot = {
      ...snapshot,
      messages: [
        ...snapshot.messages,
        userMessage('user-turn-1', 'turn-1', 'hello claude'),
      ],
      agents: [{
        ...snapshot.agents[0]!,
        backendSession: { kind: 'claude' as const, sessionId: 'claude-session-1', transport: 'stdio' as const },
      }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await expect(sendPrompt(controller, 'agent-dina', 'hello claude')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/prompt/send', {
      agentId: 'agent-dina',
      prompt: 'hello claude',
      options: undefined,
    });
  });

  it('reads historical conversation messages through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const messages = [{
      id: 'user-thread-dina-user-1',
      agentId: 'agent-dina',
      role: 'user' as const,
      status: 'complete' as const,
      createdAt: '2026-06-09T10:00:00.000Z',
      parts: [{ type: 'text' as const, text: 'hello' }],
    }];
    const request = vi.fn().mockResolvedValue(messages);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(readConversationMessages(controller, { backend: 'codex', threadId: 'thread-dina' }, 'agent-dina')).resolves.toStrictEqual(messages);
    expect(request).toHaveBeenCalledWith('agent/conversation/messages/get', {
      ref: { backend: 'codex', threadId: 'thread-dina' },
      agentId: 'agent-dina',
    });
  });

  it('lists agent conversations through clawd', async () => {
    const snapshot = createInitialSnapshot();
    const conversations: ConversationSummary[] = [{
      id: 'thread-dina',
      title: 'Read docs',
      updatedAt: '2026-06-09T10:00:00.000Z',
      messageCount: 3,
      ref: { backend: 'codex', threadId: 'thread-dina' },
    }];
    const request = vi.fn().mockResolvedValue(conversations);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listAgentConversations(controller, 'agent-dina')).resolves.toStrictEqual(conversations);
    expect(request).toHaveBeenCalledWith('agent/conversations/list', { agentId: 'agent-dina' });
  });

  it('routes agent conversation resume through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    const backendSnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0]!, backendSession: { kind: 'codex' as const, threadId: 'thread-dina' } }],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const ref = { backend: 'codex' as const, threadId: 'thread-dina' };

    await controller.initialize();

    await expect(resumeAgentConversation(controller, 'agent-dina', ref)).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenCalledWith('agent/conversation/resume', { agentId: 'agent-dina', ref });
  });

  it('lets clawd validate busy agent conversation resume', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const request = vi.fn().mockRejectedValue(new Error('Agent must be idle before resuming a conversation.'));
    const controller = new AppController(snapshot, createBackendClient({ request }));
    const ref = { backend: 'codex' as const, threadId: 'thread-dina' };

    await controller.initialize();

    await expect(resumeAgentConversation(controller, 'agent-dina', ref)).rejects.toThrow('Agent must be idle before resuming a conversation.');
    expect(request).toHaveBeenCalledWith('agent/conversation/resume', { agentId: 'agent-dina', ref });
  });

  it('lets clawd reject unrecorded historical conversation refs', async () => {
    const snapshot = createInitialSnapshot();
    const request = vi.fn().mockRejectedValue(new Error('Conversation reference is not available.'));
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(readConversationMessages(controller, { backend: 'codex', threadId: 'thread-dina' }, 'agent-dina')).rejects.toThrow('Conversation reference is not available.');
    expect(request).toHaveBeenCalledWith('agent/conversation/messages/get', {
      ref: { backend: 'codex', threadId: 'thread-dina' },
      agentId: 'agent-dina',
    });
  });

  it('lets clawd reject invalid historical conversation refs', async () => {
    const snapshot = createInitialSnapshot();
    const request = vi.fn().mockRejectedValue(new Error('Invalid conversation reference.'));
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(readConversationMessages(controller, { backend: 'codex' }, 'agent-dina')).rejects.toThrow('Invalid conversation reference.');
    expect(request).toHaveBeenCalledWith('agent/conversation/messages/get', {
      ref: { backend: 'codex' },
      agentId: 'agent-dina',
    });
  });

  it('routes agent file listing and previews through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].folder = '/Users/nbonamy/src/codex-claw';
    const files: AgentFileSearchItem[] = [{ name: 'README.md', path: 'README.md' }];
    const readResult: AgentFilePreviewResult = { path: 'README.md', content: '# Read me\n' };
    const request = vi.fn()
      .mockResolvedValueOnce(files)
      .mockResolvedValueOnce(readResult);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(listAgentFiles(controller, 'agent-dina')).resolves.toStrictEqual(files);
    await expect(previewAgentFile(controller, 'agent-dina', 'README.md')).resolves.toStrictEqual(readResult);
    expect(request).toHaveBeenNthCalledWith(1, 'agent/files/list', {
      agentId: 'agent-dina',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/file/preview', {
      agentId: 'agent-dina',
      filePath: 'README.md',
    });
  });

  it('opens local project paths and persists the selected application per agent', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/Users/nbonamy/src/codex-claw';
    const updatedSnapshot = structuredClone(snapshot);
    updatedSnapshot.agents[0].openInApplication = 'vscode';
    const request = vi.fn().mockResolvedValue(updatedSnapshot);
    const open = vi.fn().mockResolvedValue(undefined);
    const controller = new AppController(snapshot, createBackendClient({ request }));
    (controller as unknown as { openInProvider: OpenInProvider }).openInProvider = {
      list: vi.fn(),
      open,
    };

    await expect(openAgentPath(controller, 'agent-dina', 'vscode', 'README.md')).resolves.toBe(updatedSnapshot);

    expect(open).toHaveBeenCalledWith('vscode', '/Users/nbonamy/src/codex-claw/README.md');
    expect(request).toHaveBeenCalledWith(backendMethods.agentOpenInApplicationUpdate, {
      agentId: 'agent-dina',
      application: 'vscode',
    });
    expect(currentSnapshot(controller).agents[0].openInApplication).toBe('vscode');
  });

  it('rejects Open In for remote agents and files outside the project', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/Users/nbonamy/src/codex-claw';
    const open = vi.fn();
    const controller = new AppController(snapshot, createBackendClient());
    (controller as unknown as { openInProvider: OpenInProvider }).openInProvider = {
      list: vi.fn(),
      open,
    };

    await expect(openAgentPath(controller, 'agent-dina', 'finder', '/Users/nbonamy/src/skwad/README.md'))
      .rejects.toThrow('only available for files inside');

    currentSnapshot(controller).teams[0].remoteConnectionId = 'connection-devbox';
    await expect(openAgentPath(controller, 'agent-dina', 'finder')).rejects.toThrow('only available for local agents');
    expect(open).not.toHaveBeenCalled();
  });

  it('caches turn diff updates emitted by clawd without deriving side-panel previews', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    await controller.initialize();
    const send = vi.fn();
    setMainWindowSend(controller, send);
    const diff = [
      'diff --git a/src/main.ts b/src/main.ts',
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'diff.updated',
      payload: {
        turnId: 'turn-1',
        addedLines: 1,
        removedLines: 1,
        diff,
      },
    });

    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      type: 'diff.updated',
      payload: expect.objectContaining({ diff }),
    }));
    expect(send).not.toHaveBeenCalledWith('app:event', expect.objectContaining({
      type: 'sidePanel.gitDiffRequested',
    }));
  });

  it('forwards side-panel requests emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    await controller.initialize();
    const send = vi.fn();
    setMainWindowSend(controller, send);

    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        scope: 'turn',
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff: 'diff --git a/a.ts b/a.ts\n',
      },
    });

    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        scope: 'turn',
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff: 'diff --git a/a.ts b/a.ts\n',
      },
    }));
  });

  it('deletes a message by rolling back from its Codex turn and replacing history', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
      userMessage('user-turn-2', 'turn-2', 'second prompt'),
      assistantMessage('assistant-turn-2', 'turn-2', 'second answer'),
    ];
    const rollbackSnapshot = {
      ...snapshot,
      messages: snapshot.messages.slice(0, 2),
    };
    const request = vi.fn().mockResolvedValue(rollbackSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();

    await expect(deleteMessage(controller, 'agent-dina', 'user-turn-2')).resolves.toBe(rollbackSnapshot);

    expect(request).toHaveBeenCalledWith('agent/message/delete', { agentId: 'agent-dina', messageId: 'user-turn-2' });
  });

  it('retries an assistant message by rolling back and resending the matching user prompt', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
    ];
    const rollbackSnapshot = {
      ...snapshot,
      messages: [],
    };
    const request = vi.fn().mockResolvedValue(rollbackSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await retryMessage(controller, 'agent-dina', 'assistant-turn-1');

    expect(request).toHaveBeenCalledWith('agent/message/retry', { agentId: 'agent-dina', messageId: 'assistant-turn-1' });
  });

  it('edits a user message by rolling back and resending the edited prompt', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
    ];
    const rollbackSnapshot = {
      ...snapshot,
      messages: [],
    };
    const request = vi.fn().mockResolvedValue(rollbackSnapshot);
    const controller = new AppController(snapshot, createBackendClient({ request }));

    await controller.initialize();
    await editMessage(controller, 'agent-dina', 'user-turn-1', ' edited prompt ');

    expect(request).toHaveBeenCalledWith('agent/message/update', { agentId: 'agent-dina', messageId: 'user-turn-1', prompt: ' edited prompt ' });
  });
});

function loopFixture(input: { cleanup: LoopCleanup; teamTarget: LoopTeamTarget }): Loop {
  return {
    id: 'loop-bugs',
    name: 'GitHub bugs',
    enabled: true,
    source: {
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      tagName: 'bug',
    },
    action: {
      type: 'create-agent-from-bench',
      benchTemplateId: 'bench-dina',
      teamTarget: input.teamTarget,
      cleanup: input.cleanup,
    },
    instructions: {},
    executionLog: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:00:00.000Z',
  };
}

function emitBackendEvent(
  controller: AppController,
  event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
): void {
  const fullEvent: MainToRendererEvent = {
    ...event,
    seq: event.seq ?? 1,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  };
  (controller as unknown as {
    emitBackendEvent(event: ClawBackendEvent): void;
  }).emitBackendEvent(fullEvent);
}

function adoptBackendSnapshot(controller: AppController, snapshot: AppSnapshot): Promise<AppSnapshot> {
  return (controller as unknown as {
    adoptBackendSnapshot(snapshot: AppSnapshot): Promise<AppSnapshot>;
  }).adoptBackendSnapshot(snapshot);
}

function setMainWindowSend(controller: AppController, send: ReturnType<typeof vi.fn>): void {
  (controller as unknown as {
    mainWindow: { isDestroyed(): boolean; webContents: { send: ReturnType<typeof vi.fn> } };
  }).mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send,
    },
  };
}

function setRendererReloadWindow(controller: AppController, reload: () => void): void {
  (controller as unknown as {
    mainWindow: { isDestroyed(): boolean; webContents: { reload(): void } };
  }).mainWindow = {
    isDestroyed: () => false,
    webContents: { reload },
  };
}

function setDeepLinkWindow(
  controller: AppController,
  callbacks: { send(...args: unknown[]): void; show(): void; focus(): void },
): void {
  (controller as unknown as {
    mainWindow: {
      isDestroyed(): boolean;
      isMinimized(): boolean;
      restore(): void;
      show(): void;
      focus(): void;
      webContents: { send(...args: unknown[]): void };
    };
  }).mainWindow = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: vi.fn(),
    show: callbacks.show,
    focus: callbacks.focus,
    webContents: { send: callbacks.send },
  };
}

function requestBrowserOpen(controller: AppController, agentId: string, browserId: string, url: string) {
  return (controller as unknown as {
    requestBrowserOpen(agentId: string, browserId: string, url: string): Promise<unknown>;
  }).requestBrowserOpen(agentId, browserId, url);
}

function resolvePendingBrowserOpen(controller: AppController, agentId: string, browserId: string, state: BrowserState): void {
  (controller as unknown as {
    resolvePendingBrowserOpen(agentId: string, browserId: string, state: BrowserState): void;
  }).resolvePendingBrowserOpen(agentId, browserId, state);
}

async function sendPrompt(controller: AppController, agentId: string, prompt: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    sendPrompt(agentId: string, prompt: string): Promise<AppSnapshot>;
  }).sendPrompt(agentId, prompt);
}

async function restartAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    restartAgent(agentId: string): Promise<AppSnapshot>;
  }).restartAgent(agentId);
}

async function hydrateAgentHistory(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    hydrateAgentHistory(agentId: string): Promise<AppSnapshot>;
  }).hydrateAgentHistory(agentId);
}

async function openAgentGitDiff(controller: AppController, agentId: string): Promise<void> {
  await (controller as unknown as {
    openAgentGitDiff(agentId: string): Promise<void>;
  }).openAgentGitDiff(agentId);
}

async function selectAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    selectAgent(agentId: string): Promise<AppSnapshot>;
  }).selectAgent(agentId);
}

async function respondToClientRequest(controller: AppController, response: ClientRequestResponse): Promise<AppSnapshot> {
  return (controller as unknown as {
    respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>;
  }).respondToClientRequest(response);
}

function currentSnapshot(controller: AppController): AppSnapshot {
  return (controller as unknown as { snapshot: AppSnapshot }).snapshot;
}

function currentClientState(controller: AppController): ClientState {
  return (controller as unknown as { clientState: ClientState }).clientState;
}

function restartApp(controller: AppController): Promise<void> {
  return (controller as unknown as { restartApp(): Promise<void> }).restartApp();
}

function fakeAppLifecycle() {
  return {
    quit: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn(),
  };
}

function createBackendClientWithEventEmitter(
  onEvent: (listener: (event: ClawBackendEvent) => void) => () => void,
) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
    request: vi.fn().mockResolvedValue({}),
    onEvent: vi.fn(onEvent),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createBackendClient(overrides: {
  request?: unknown;
  onEvent?: unknown;
  close?: unknown;
  clientState?: ClientState;
} = {}): NonNullable<ConstructorParameters<typeof AppController>[1]> {
  const request = (overrides.request ?? vi.fn().mockResolvedValue({})) as (method: string, params?: unknown) => Promise<unknown>;
  const onEvent = (overrides.onEvent ?? vi.fn(() => () => undefined)) as (listener: (event: ClawBackendEvent) => void) => () => void;
  const clientState = overrides.clientState ?? {
    sourceFolderPath: '',
    shouldPreventDisplaySleep: false,
  };
  return {
    start: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
    request: <Result>(method: string, params?: unknown) => {
      if (method === 'snapshot/get') {
        return Promise.resolve({}) as Promise<Result>;
      }
      if (method === 'client/state/get') {
        return Promise.resolve(clientState) as Promise<Result>;
      }
      return request(method, params) as Promise<Result>;
    },
    onEvent,
    close: (overrides.close ?? vi.fn().mockResolvedValue(undefined)) as () => Promise<void>,
  };
}

async function listSourceRepositories(controller: AppController): Promise<SourceRepository[]> {
  return (controller as unknown as {
    listSourceRepositories(): Promise<SourceRepository[]>;
  }).listSourceRepositories();
}

async function listSourceWorktrees(controller: AppController, repoPath: string): Promise<SourceWorktree[]> {
  return (controller as unknown as {
    listSourceWorktrees(repoPath: string): Promise<SourceWorktree[]>;
  }).listSourceWorktrees(repoPath);
}

async function createSourceWorktree(
  controller: AppController,
  input: CreateSourceWorktreeInput,
): Promise<SourceWorktree> {
  return (controller as unknown as {
    createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree>;
  }).createSourceWorktree(input);
}

async function suggestSourceWorktreePath(
  controller: AppController,
  input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>,
): Promise<string> {
  return (controller as unknown as {
    suggestSourceWorktreePath(input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>): Promise<string>;
  }).suggestSourceWorktreePath(input);
}

async function getSystemPermissions(controller: AppController): Promise<SystemPermissionsStatus> {
  return (controller as unknown as {
    getSystemPermissions(): Promise<SystemPermissionsStatus>;
  }).getSystemPermissions();
}

async function openAccessibilitySettings(controller: AppController): Promise<SystemPermissionsStatus> {
  return (controller as unknown as {
    openAccessibilitySettings(): Promise<SystemPermissionsStatus>;
  }).openAccessibilitySettings();
}

async function openScreenRecordingSettings(controller: AppController): Promise<SystemPermissionsStatus> {
  return (controller as unknown as {
    openScreenRecordingSettings(): Promise<SystemPermissionsStatus>;
  }).openScreenRecordingSettings();
}

async function assignWorkItemToAgent(controller: AppController, agentId: string, item: WorkItem): Promise<AppSnapshot> {
  return (controller as unknown as {
    assignWorkItemToAgent(agentId: string, item: WorkItem): Promise<AppSnapshot>;
  }).assignWorkItemToAgent(agentId, item);
}

async function removeWorkItemAssignment(controller: AppController, item: WorkItem): Promise<AppSnapshot> {
  return (controller as unknown as {
    removeWorkItemAssignment(item: WorkItem): Promise<AppSnapshot>;
  }).removeWorkItemAssignment(item);
}

async function createAgent(controller: AppController, input: CreateAgentInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    createAgent(input: CreateAgentInput): Promise<AppSnapshot>;
  }).createAgent(input);
}

async function updateAgent(controller: AppController, input: UpdateAgentInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>;
  }).updateAgent(input);
}

async function duplicateAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    duplicateAgent(agentId: string): Promise<AppSnapshot>;
  }).duplicateAgent(agentId);
}

async function forkAgent(controller: AppController, agentId: string, messageIndex?: number): Promise<AppSnapshot> {
  return (controller as unknown as {
    forkAgent(agentId: string, messageIndex?: number): Promise<AppSnapshot>;
  }).forkAgent(agentId, messageIndex);
}

async function moveAgentToTeam(controller: AppController, input: MoveAgentToTeamInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>;
  }).moveAgentToTeam(input);
}

async function reorderAgents(controller: AppController, input: ReorderAgentsInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot>;
  }).reorderAgents(input);
}

async function closeAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    closeAgent(agentId: string): Promise<AppSnapshot>;
  }).closeAgent(agentId);
}

async function updateAgentFolder(controller: AppController, agentId: string, folder: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateAgentFolder(agentId: string, folder: string): Promise<AppSnapshot>;
  }).updateAgentFolder(agentId, folder);
}

async function createTeam(controller: AppController, input: CreateTeamInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    createTeam(input: CreateTeamInput): Promise<AppSnapshot>;
  }).createTeam(input);
}

async function updateTeam(controller: AppController, input: UpdateTeamInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateTeam(input: UpdateTeamInput): Promise<AppSnapshot>;
  }).updateTeam(input);
}

async function reorderTeams(controller: AppController, input: ReorderTeamsInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    reorderTeams(input: ReorderTeamsInput): Promise<AppSnapshot>;
  }).reorderTeams(input);
}

async function closeTeam(controller: AppController, teamId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    closeTeam(teamId: string): Promise<AppSnapshot>;
  }).closeTeam(teamId);
}

async function selectTeam(controller: AppController, teamId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    selectTeam(teamId: string): Promise<AppSnapshot>;
  }).selectTeam(teamId);
}

async function getSnapshot(controller: AppController): Promise<AppSnapshot> {
  return (controller as unknown as {
    getSnapshot(): Promise<AppSnapshot>;
  }).getSnapshot();
}

async function getBenchSnapshot(controller: AppController, location?: BenchLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    getBenchSnapshot(location?: BenchLocation): Promise<AppSnapshot>;
  }).getBenchSnapshot(location);
}

async function saveAgentToBench(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    saveAgentToBench(agentId: string): Promise<AppSnapshot>;
  }).saveAgentToBench(agentId);
}

async function deployBenchTemplate(controller: AppController, templateId: string, teamId?: string, location?: BenchLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    deployBenchTemplate(templateId: string, teamId?: string, location?: BenchLocation): Promise<AppSnapshot>;
  }).deployBenchTemplate(templateId, teamId, location);
}

async function removeBenchTemplate(controller: AppController, templateId: string, location?: BenchLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    removeBenchTemplate(templateId: string, location?: BenchLocation): Promise<AppSnapshot>;
  }).removeBenchTemplate(templateId, location);
}

async function updateSettings(controller: AppController, input: UpdateSettingsInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateSettings(input: UpdateSettingsInput): Promise<AppSnapshot>;
  }).updateSettings(input);
}

async function setCodexResourceSharing(controller: AppController, input: SetCodexResourceSharingInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    setCodexResourceSharing(input: SetCodexResourceSharingInput): Promise<AppSnapshot>;
  }).setCodexResourceSharing(input);
}

async function getLoopSnapshot(controller: AppController, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    getLoopSnapshot(location?: LoopLocation): Promise<AppSnapshot>;
  }).getLoopSnapshot(location);
}

async function createLoop(controller: AppController, input: CreateLoopInput, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    createLoop(input: CreateLoopInput, location?: LoopLocation): Promise<AppSnapshot>;
  }).createLoop(input, location);
}

async function updateLoop(controller: AppController, input: UpdateLoopInput, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateLoop(input: UpdateLoopInput, location?: LoopLocation): Promise<AppSnapshot>;
  }).updateLoop(input, location);
}

async function runLoop(controller: AppController, loopId: string, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    runLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot>;
  }).runLoop(loopId, location);
}

async function clearLoopHistory(controller: AppController, loopId: string, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    clearLoopHistory(loopId: string, location?: LoopLocation): Promise<AppSnapshot>;
  }).clearLoopHistory(loopId, location);
}

async function deleteLoopExecution(controller: AppController, loopId: string, executionId: string, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteLoopExecution(loopId: string, executionId: string, location?: LoopLocation): Promise<AppSnapshot>;
  }).deleteLoopExecution(loopId, executionId, location);
}

async function deleteLoop(controller: AppController, loopId: string, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot>;
  }).deleteLoop(loopId, location);
}

async function readConversationMessages(
  controller: AppController,
  ref: unknown,
  agentId: string,
  location?: LoopLocation,
): Promise<RendererMessage[]> {
  return (controller as unknown as {
    readConversationMessages(ref: unknown, agentId: string, location?: LoopLocation): Promise<RendererMessage[]>;
  }).readConversationMessages(ref, agentId, location);
}

async function listAgentConversations(
  controller: AppController,
  agentId: string,
): Promise<ConversationSummary[]> {
  return (controller as unknown as {
    listAgentConversations(agentId: string): Promise<ConversationSummary[]>;
  }).listAgentConversations(agentId);
}

async function resumeAgentConversation(
  controller: AppController,
  agentId: string,
  ref: BackendConversationRef,
): Promise<AppSnapshot> {
  return (controller as unknown as {
    resumeAgentConversation(agentId: string, ref: unknown): Promise<AppSnapshot>;
  }).resumeAgentConversation(agentId, ref);
}

async function steerPrompt(
  controller: AppController,
  agentId: string,
  prompt: string,
  options?: SendPromptOptions,
): Promise<AppSnapshot> {
  return (controller as unknown as {
    steerPrompt(agentId: string, prompt: string, options?: SendPromptOptions): Promise<AppSnapshot>;
  }).steerPrompt(agentId, prompt, options);
}

async function steerQueuedPrompt(controller: AppController, agentId: string, promptId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    steerQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot>;
  }).steerQueuedPrompt(agentId, promptId);
}

async function deleteQueuedPrompt(controller: AppController, agentId: string, promptId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot>;
  }).deleteQueuedPrompt(agentId, promptId);
}

async function interruptAgent(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    interruptAgent(agentId: string): Promise<AppSnapshot>;
  }).interruptAgent(agentId);
}

async function deleteMessage(controller: AppController, agentId: string, messageId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  }).deleteMessage(agentId, messageId);
}

async function retryMessage(controller: AppController, agentId: string, messageId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    retryMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  }).retryMessage(agentId, messageId);
}

async function editMessage(controller: AppController, agentId: string, messageId: string, prompt: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot>;
  }).editMessage(agentId, messageId, prompt);
}

async function setAgentGoal(controller: AppController, agentId: string, objective: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot>;
  }).setAgentGoal(agentId, objective);
}

async function clearAgentGoal(controller: AppController, agentId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    clearAgentGoal(agentId: string): Promise<AppSnapshot>;
  }).clearAgentGoal(agentId);
}

async function setAgentApprovalPreset(controller: AppController, agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<AppSnapshot> {
  return (controller as unknown as {
    setAgentApprovalPreset(agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<AppSnapshot>;
  }).setAgentApprovalPreset(agentId, preset);
}

async function previewAgentFile(controller: AppController, agentId: string, filePath: string): Promise<unknown> {
  return (controller as unknown as {
    previewAgentFile(agentId: string, filePath: string): Promise<unknown>;
  }).previewAgentFile(agentId, filePath);
}

async function openAgentPath(
  controller: AppController,
  agentId: string,
  application: 'vscode' | 'finder',
  filePath?: string,
): Promise<AppSnapshot> {
  return (controller as unknown as {
    openAgentPath(agentId: string, application: 'vscode' | 'finder', filePath?: string): Promise<AppSnapshot>;
  }).openAgentPath(agentId, application, filePath);
}

async function listAgentFiles(controller: AppController, agentId: string): Promise<AgentFileSearchItem[]> {
  return (controller as unknown as {
    listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]>;
  }).listAgentFiles(agentId);
}

async function connectWorkProvider(controller: AppController, provider: WorkProviderKind): Promise<WorkProviderConnectResult> {
  return (controller as unknown as {
    connectWorkProvider(provider: WorkProviderKind): Promise<WorkProviderConnectResult>;
  }).connectWorkProvider(provider);
}

async function listSshHosts(controller: AppController): Promise<SshHostCandidate[]> {
  return (controller as unknown as {
    listSshHosts(): Promise<SshHostCandidate[]>;
  }).listSshHosts();
}

async function addSshConnection(controller: AppController, input: AddSshConnectionInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    addSshConnection(input: AddSshConnectionInput): Promise<AppSnapshot>;
  }).addSshConnection(input);
}

async function checkRemoteConnection(controller: AppController, connectionId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    checkRemoteConnection(connectionId: string): Promise<AppSnapshot>;
  }).checkRemoteConnection(connectionId);
}

async function listSourceFolders(controller: AppController, input: { remoteConnectionId: string; path: string }) {
  return (controller as unknown as {
    listSourceFolders(input: SourceFolderListInput): Promise<unknown>;
  }).listSourceFolders(input);
}

async function updateRemoteConnection(controller: AppController, connectionId: string, input: UpdateRemoteConnectionInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateRemoteConnection(connectionId: string, input: UpdateRemoteConnectionInput): Promise<AppSnapshot>;
  }).updateRemoteConnection(connectionId, input);
}

async function removeRemoteConnection(controller: AppController, connectionId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    removeRemoteConnection(connectionId: string): Promise<AppSnapshot>;
  }).removeRemoteConnection(connectionId);
}

function getDevicePairingStatus(controller: AppController): Promise<DevicePairingStatus> {
  return (controller as unknown as { getDevicePairingStatus(): Promise<DevicePairingStatus> }).getDevicePairingStatus();
}

function enableDevicePairing(controller: AppController): Promise<DevicePairingStatus> {
  return (controller as unknown as { enableDevicePairing(): Promise<DevicePairingStatus> }).enableDevicePairing();
}

function disableDevicePairing(controller: AppController): Promise<DevicePairingStatus> {
  return (controller as unknown as { disableDevicePairing(): Promise<DevicePairingStatus> }).disableDevicePairing();
}

function startDevicePairing(controller: AppController): Promise<DevicePairingSession> {
  return (controller as unknown as { startDevicePairing(): Promise<DevicePairingSession> }).startDevicePairing();
}

function checkDevicePairing(controller: AppController, session: DevicePairingSession): Promise<boolean> {
  return (controller as unknown as { checkDevicePairing(value: DevicePairingSession): Promise<boolean> }).checkDevicePairing(session);
}

function listPairedDevices(controller: AppController, environmentId: string): Promise<PairedDevice[]> {
  return (controller as unknown as { listPairedDevices(id: string): Promise<PairedDevice[]> }).listPairedDevices(environmentId);
}

function revokePairedDevice(controller: AppController, environmentId: string, clientId: string): Promise<void> {
  return (controller as unknown as { revokePairedDevice(environment: string, client: string): Promise<void> })
    .revokePairedDevice(environmentId, clientId);
}

async function configureWorkBacklog(controller: AppController, input: WorkBacklogConfigurationInput, location?: LoopLocation): Promise<AppSnapshot> {
  return (controller as unknown as {
    configureWorkBacklog(input: WorkBacklogConfigurationInput, location?: LoopLocation): Promise<AppSnapshot>;
  }).configureWorkBacklog(input, location);
}

async function listWorkItems(controller: AppController, provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]> {
  return (controller as unknown as {
    listWorkItems(provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]>;
  }).listWorkItems(provider, repositoryId);
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

function userMessage(id: string, turnId: string, text: string) {
  return {
    id,
    agentId: 'agent-dina',
    role: 'user' as const,
    status: 'complete' as const,
    turnId,
    createdAt: '2026-06-05T00:00:00.000Z',
    parts: [{ type: 'text' as const, text }],
  };
}

function assistantMessage(id: string, turnId: string, text: string) {
  return {
    id,
    agentId: 'agent-dina',
    role: 'assistant' as const,
    status: 'complete' as const,
    turnId,
    createdAt: '2026-06-05T00:00:01.000Z',
    parts: [{ type: 'text' as const, text }],
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
