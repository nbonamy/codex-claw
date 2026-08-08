import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';

const mocks = vi.hoisted(() => ({
  snapshot: {
    agents: [{
      id: 'agent-dina',
      teamId: 'team-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '/src/claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    }],
    general: {},
    workBacklog: { providerSettings: { github: { oauthClientId: 'github-client' } } },
  },
  drivers: new Map<string, unknown>(),
  mcpOptions: [] as unknown[],
  serverOptions: [] as unknown[],
  loopRunnerOptions: [] as unknown[],
  schedulerOptions: [] as unknown[],
  remoteOptions: [] as unknown[],
  workIntegrationOptions: [] as unknown[],
  sendAgentPrompt: vi.fn(),
  updateLoopConversation: vi.fn(),
  loadBackendSnapshot: vi.fn(),
  ensureBackendCodexHome: vi.fn(),
  initializeCodexResourceSharing: vi.fn(),
  loadPluginStatus: vi.fn(),
  saveBackendSnapshot: vi.fn(),
  backendProviderTokensFilePath: vi.fn(),
  mcpStart: vi.fn(),
  mcpStop: vi.fn(),
  mcpSetDriverRpc: vi.fn(),
  mcpSetEventSink: vi.fn(),
  mcpHandleBackendEvent: vi.fn(),
  mcpSendMessage: vi.fn(),
  hydrateConnections: vi.fn(),
  schedulerStart: vi.fn(),
  schedulerStop: vi.fn(),
  loopRunAll: vi.fn(),
  serverEmitEvent: vi.fn(),
  serverClose: vi.fn(),
  createDefaultBackendDrivers: vi.fn(),
  runtimeGitHubOAuthClientId: vi.fn(),
  warnMain: vi.fn(),
}));

vi.mock('@codex-claw/core/agent-chat-service', () => ({
  sendAgentPrompt: mocks.sendAgentPrompt,
}));

vi.mock('@codex-claw/core/loop-manager', () => ({
  updateLoopExecutionAgentConversationInSnapshot: mocks.updateLoopConversation,
}));

vi.mock('../state', () => ({
  loadBackendSnapshot: mocks.loadBackendSnapshot,
  ensureBackendCodexHome: mocks.ensureBackendCodexHome,
  saveBackendSnapshot: mocks.saveBackendSnapshot,
  backendProviderTokensFilePath: mocks.backendProviderTokensFilePath,
}));

vi.mock('../codex-resource-sharing', () => ({
  initializeCodexResourceSharing: mocks.initializeCodexResourceSharing,
}));

vi.mock('../plugin-status', () => ({
  loadPluginStatus: mocks.loadPluginStatus,
}));

vi.mock('../mcp/service', () => ({
  ClawMcpService: class {
    constructor(options: unknown) { mocks.mcpOptions.push(options); }
    start = mocks.mcpStart;
    stop = mocks.mcpStop;
    setDriverRpc = mocks.mcpSetDriverRpc;
    setEventSink = mocks.mcpSetEventSink;
    handleBackendEvent = mocks.mcpHandleBackendEvent;
    sendMessage = mocks.mcpSendMessage;
  },
}));

vi.mock('../driver-rpc', () => ({
  BackendDriverRpc: class {
    constructor(readonly drivers: unknown) {}
  },
  createDefaultBackendDrivers: mocks.createDefaultBackendDrivers,
}));

vi.mock('../work-integrations/manager', () => ({
  WorkIntegrationManager: class {
    constructor(options: unknown) { mocks.workIntegrationOptions.push(options); }
    hydrateConnections = mocks.hydrateConnections;
  },
}));

vi.mock('../work-integrations/github-driver', () => ({
  GitHubWorkProviderDriver: class {
    constructor(readonly getClientId: unknown) {}
  },
}));

vi.mock('../work-integrations/file-token-store', () => ({
  FileWorkIntegrationTokenStore: class {
    constructor(readonly path: unknown) {}
  },
}));

vi.mock('../loops/runner', () => ({
  LoopRunner: class {
    constructor(options: unknown) { mocks.loopRunnerOptions.push(options); }
    runAll = mocks.loopRunAll;
  },
}));

vi.mock('../loops/scheduler', () => ({
  LoopScheduler: class {
    constructor(options: unknown) { mocks.schedulerOptions.push(options); }
    start = mocks.schedulerStart;
    stop = mocks.schedulerStop;
  },
}));

vi.mock('../server', () => ({
  ClawBackendServer: class {
    constructor(options: unknown) { mocks.serverOptions.push(options); }
    emitEvent = mocks.serverEmitEvent;
    close = mocks.serverClose;
  },
}));

vi.mock('../connections/remote-clawd-client', () => ({
  RemoteClawdClientManager: class {
    constructor(options: unknown) { mocks.remoteOptions.push(options); }
  },
}));

vi.mock('../connections/ssh-connections', () => ({
  SshConnectionService: class {},
}));

vi.mock('../runtime-config', () => ({
  runtimeGitHubOAuthClientId: mocks.runtimeGitHubOAuthClientId,
}));

vi.mock('../log', () => ({ warnMain: mocks.warnMain }));

import { createClawdRuntime } from '../runtime';

type McpOptions = {
  computerUse?: {
    execute(input: unknown): Promise<unknown>;
    requestAccessibility(): Promise<unknown>;
    status(): Promise<unknown>;
    stop(): Promise<unknown>;
  };
  browser?: {
    open(input: unknown): Promise<unknown>;
    execute(input: unknown): Promise<unknown>;
  };
};

type ServerOptions = {
  version: string;
  inspectPluginStatus(): Promise<{ chromeEnabled: boolean }>;
  onEvent(event: unknown): void;
  onBackendEventApplied(event: unknown): void;
  saveSnapshot(snapshot: unknown): Promise<unknown>;
  sendAgentMessage(fromAgentId: string, toAgentId: string, content: string): void;
  systemPermissions: {
    getStatus(): Promise<unknown>;
    openAccessibilitySettings(): Promise<unknown>;
    openScreenRecordingSettings(): Promise<unknown>;
  };
};

type LoopRunnerOptions = {
  notifySnapshotUpdated(): void;
  saveSnapshot(): Promise<unknown>;
  sendPrompt(agentId: string, prompt: string, context: { loopId: string; executionId: string }): Promise<unknown>;
};

type SchedulerOptions = { runLoops(): Promise<unknown>; onError(error: unknown): void };

type WorkIntegrationOptions = {
  drivers: Array<{ getClientId(): string }>;
  getSnapshot(): unknown;
  openExternal(url: string): Promise<unknown>;
  saveSnapshot(): Promise<unknown>;
};

type RemoteOptions = {
  requestHandlers: Record<string, (params: unknown) => Promise<unknown>>;
};

describe('clawd runtime', () => {
  const driver = {
    setConversationTitle: vi.fn(),
  };
  const emitEvent = vi.fn();
  const requestClient = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mcpOptions.length = 0;
    mocks.serverOptions.length = 0;
    mocks.loopRunnerOptions.length = 0;
    mocks.schedulerOptions.length = 0;
    mocks.remoteOptions.length = 0;
    mocks.workIntegrationOptions.length = 0;
    mocks.snapshot.general = {};
    mocks.drivers.clear();
    mocks.drivers.set('codex', driver);
    mocks.loadBackendSnapshot.mockResolvedValue(mocks.snapshot);
    mocks.ensureBackendCodexHome.mockResolvedValue(undefined);
    mocks.initializeCodexResourceSharing.mockResolvedValue(undefined);
    mocks.loadPluginStatus.mockResolvedValue({ chromeEnabled: false });
    mocks.saveBackendSnapshot.mockResolvedValue(undefined);
    mocks.backendProviderTokensFilePath.mockReturnValue('/tmp/provider-tokens.json');
    mocks.mcpStart.mockResolvedValue('http://127.0.0.1:4242/mcp');
    mocks.mcpStop.mockResolvedValue(undefined);
    mocks.hydrateConnections.mockResolvedValue(undefined);
    mocks.serverClose.mockResolvedValue(undefined);
    mocks.createDefaultBackendDrivers.mockReturnValue(mocks.drivers);
    mocks.runtimeGitHubOAuthClientId.mockReturnValue('github-client');
    requestClient.mockImplementation(async (method: string, params?: unknown) => ({ method, params }));
    mocks.loopRunAll.mockResolvedValue(undefined);
  });

  it('constructs the runtime services and forwards client-owned operations', async () => {
    await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });

    expect(mocks.loadBackendSnapshot).toHaveBeenCalledOnce();
    expect(mocks.initializeCodexResourceSharing).toHaveBeenCalledWith(undefined);
    expect(mocks.ensureBackendCodexHome).toHaveBeenCalledOnce();
    expect(mocks.mcpStart).toHaveBeenCalledOnce();
    expect(mocks.createDefaultBackendDrivers).toHaveBeenCalledWith(expect.objectContaining({
      clawMcpServerUrl: 'http://127.0.0.1:4242/mcp',
      generalSettings: mocks.snapshot.general,
      pluginSettings: expect.any(Function),
    }));
    expect(mocks.hydrateConnections).toHaveBeenCalledOnce();
    expect(mocks.schedulerStart).toHaveBeenCalledOnce();
    expect(mocks.mcpSetDriverRpc).toHaveBeenCalledOnce();
    expect(mocks.mcpSetEventSink).toHaveBeenCalledOnce();

    const mcp = mocks.mcpOptions[0] as McpOptions;
    await mcp.computerUse!.execute({ command: 'click' });
    await mcp.computerUse!.requestAccessibility();
    await mcp.computerUse!.status();
    await mcp.computerUse!.stop();
    await mcp.browser!.open({ url: 'https://example.com' });
    await mcp.browser!.execute({ command: 'dom' });
    expect(requestClient.mock.calls.map(([method]) => method)).toStrictEqual([
      backendMethods.clientComputerUseExecute,
      backendMethods.clientComputerUseRequestAccessibility,
      backendMethods.clientComputerUseStatusGet,
      backendMethods.clientComputerUseStop,
      backendMethods.clientBrowserOpen,
      backendMethods.clientBrowserExecute,
    ]);

    const server = mocks.serverOptions[0] as ServerOptions;
    expect(server.version).toBe('1.2.3');
    server.onEvent({ type: 'test' });
    expect(emitEvent).toHaveBeenCalledWith({ type: 'test' });
    server.onBackendEventApplied({ type: 'backend' });
    expect(mocks.mcpHandleBackendEvent).toHaveBeenCalledWith({ type: 'backend' });
    await server.saveSnapshot({ next: true });
    expect(mocks.saveBackendSnapshot).toHaveBeenCalledWith({ next: true });
    server.sendAgentMessage('agent-dina', 'agent-jesse', 'hello');
    expect(mocks.mcpSendMessage).toHaveBeenCalledWith('agent-dina', 'agent-jesse', 'hello');
    await server.systemPermissions.getStatus();
    await server.systemPermissions.openAccessibilitySettings();
    await server.systemPermissions.openScreenRecordingSettings();
    expect(requestClient).toHaveBeenCalledWith(backendMethods.clientSystemPermissionsGet);
    expect(requestClient).toHaveBeenCalledWith(backendMethods.clientSystemPermissionsAccessibilityOpen);
    expect(requestClient).toHaveBeenCalledWith(backendMethods.clientSystemPermissionsScreenRecordingOpen);

    const workIntegrations = mocks.workIntegrationOptions[0] as WorkIntegrationOptions;
    expect(workIntegrations.getSnapshot()).toBe(mocks.snapshot);
    expect(workIntegrations.drivers[0]?.getClientId()).toBe('github-client');
    expect(mocks.runtimeGitHubOAuthClientId).toHaveBeenCalledWith({ oauthClientId: 'github-client' });
    await workIntegrations.openExternal('https://github.com/login');
    await workIntegrations.saveSnapshot();
    expect(requestClient).toHaveBeenCalledWith(backendMethods.clientExternalOpen, {
      url: 'https://github.com/login',
    });
    expect(mocks.saveBackendSnapshot).toHaveBeenCalledWith(mocks.snapshot);

    const remote = mocks.remoteOptions[0] as RemoteOptions;
    for (const [method, handler] of Object.entries(remote.requestHandlers)) {
      await handler({ request: method });
      expect(requestClient).toHaveBeenCalledWith(method, { request: method });
    }

    const sink = mocks.mcpSetEventSink.mock.calls[0]?.[0] as (event: unknown) => void;
    sink({ type: 'sink-event' });
    expect(mocks.serverEmitEvent).toHaveBeenCalledWith({ type: 'sink-event' });

    const scheduler = mocks.schedulerOptions[0] as SchedulerOptions;
    await scheduler.runLoops();
    expect(mocks.loopRunAll).toHaveBeenCalledOnce();
  });

  it('removes desktop-owned tools from a web-hosted runtime', async () => {
    mocks.snapshot.general = {
      plugins: { computerUseEnabled: true, chromeEnabled: true },
    };
    mocks.loadPluginStatus.mockResolvedValueOnce({ chromeEnabled: true });

    await createClawdRuntime({
      emitEvent,
      features: { computerUse: false, embeddedBrowser: false },
      requestClient,
      version: '1.2.3',
    });

    const mcp = mocks.mcpOptions[0] as McpOptions & { computerUseEnabled(): boolean };
    expect(mcp.computerUse).toBeUndefined();
    expect(mcp.browser).toBeUndefined();
    expect(mcp.computerUseEnabled()).toBe(false);

    const driverOptions = mocks.createDefaultBackendDrivers.mock.calls[0]?.[0] as {
      pluginSettings(): { computerUseEnabled: boolean; chromeEnabled: boolean };
    };
    expect(driverOptions.pluginSettings()).toEqual({
      computerUseEnabled: false,
      chromeEnabled: true,
    });
    expect(requestClient).not.toHaveBeenCalled();
  });

  it('uses the installed Chrome plugin status for Codex sessions and refreshes it from settings', async () => {
    mocks.snapshot.general = {
      plugins: { computerUseEnabled: false, chromeEnabled: false },
    };
    mocks.loadPluginStatus.mockResolvedValueOnce({ chromeEnabled: true });

    await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });

    const driverOptions = mocks.createDefaultBackendDrivers.mock.calls[0]?.[0] as {
      pluginSettings(): { computerUseEnabled: boolean; chromeEnabled: boolean };
    };
    expect(driverOptions.pluginSettings()).toStrictEqual({
      computerUseEnabled: false,
      chromeEnabled: true,
    });

    mocks.loadPluginStatus.mockResolvedValueOnce({ chromeEnabled: false });
    const server = mocks.serverOptions[0] as ServerOptions;
    await expect(server.inspectPluginStatus()).resolves.toStrictEqual({ chromeEnabled: false });
    expect(driverOptions.pluginSettings()).toStrictEqual({
      computerUseEnabled: false,
      chromeEnabled: false,
    });
  });

  it('runs loop prompts, records new conversations, and emits snapshot updates', async () => {
    mocks.updateLoopConversation.mockReturnValue({ agentId: 'agent-dina' });
    let titlePromise: Promise<void> | undefined;
    let startedPromise: Promise<void> | undefined;
    mocks.sendAgentPrompt.mockImplementation((_snapshot, _driver, _agentId, _prompt, _options, emit, hooks) => {
      emit({ type: 'message.updated' });
      titlePromise = hooks.onBackendSessionUpdated({
        backendSession: { kind: 'codex', threadId: 'thread-42' },
      }, true);
      startedPromise = hooks.onPromptStarted({
        backendSession: { kind: 'codex', threadId: 'thread-42' },
      });
    });

    await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });
    const loops = mocks.loopRunnerOptions[0] as LoopRunnerOptions;
    await expect(loops.sendPrompt('missing', 'ignore', { loopId: 'loop-1', executionId: 'run-1' }))
      .resolves.toBe(mocks.snapshot);
    expect(mocks.sendAgentPrompt).not.toHaveBeenCalled();

    await expect(loops.sendPrompt('agent-dina', 'run tests', { loopId: 'loop-1', executionId: 'run-1' }))
      .resolves.toBe(mocks.snapshot);
    await titlePromise;
    await startedPromise;
    expect(mocks.sendAgentPrompt).toHaveBeenCalledWith(
      mocks.snapshot,
      driver,
      'agent-dina',
      'run tests',
      undefined,
      expect.any(Function),
      expect.any(Object),
    );
    expect(driver.setConversationTitle).toHaveBeenCalledWith(
      mocks.snapshot.agents[0],
      expect.stringMatching(/^Dina - /),
    );
    expect(mocks.updateLoopConversation).toHaveBeenCalledWith(
      mocks.snapshot,
      'loop-1',
      'run-1',
      'agent-dina',
      expect.objectContaining({
        conversationRef: { backend: 'codex', threadId: 'thread-42' },
      }),
    );
    expect(mocks.serverEmitEvent).toHaveBeenCalledWith({
      type: 'snapshot.updated',
      payload: mocks.snapshot,
    });

    loops.notifySnapshotUpdated();
    await loops.saveSnapshot();
    expect(mocks.serverEmitEvent).toHaveBeenLastCalledWith({
      type: 'snapshot.updated',
      payload: mocks.snapshot,
    });
  });

  it('handles lifecycle shutdown and nonfatal scheduler/title failures', async () => {
    let hooks: { onBackendSessionUpdated(result: unknown, isNew: boolean): Promise<void> } | undefined;
    mocks.sendAgentPrompt.mockImplementation((_snapshot, _driver, _agentId, _prompt, _options, _emit, value) => {
      hooks = value;
    });
    driver.setConversationTitle.mockRejectedValue('rename failed');
    const runtime = await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });
    const loops = mocks.loopRunnerOptions[0] as LoopRunnerOptions;
    await loops.sendPrompt('agent-dina', 'run', { loopId: 'loop-1', executionId: 'run-1' });
    await hooks?.onBackendSessionUpdated({ backendSession: { kind: 'codex', threadId: 'thread' } }, false);
    await hooks?.onBackendSessionUpdated({ backendSession: { kind: 'codex', threadId: 'thread' } }, true);
    expect(mocks.warnMain).toHaveBeenCalledWith('conversation-title', 'failed', {
      agentId: 'agent-dina',
      message: 'rename failed',
    });

    const scheduler = mocks.schedulerOptions[0] as SchedulerOptions;
    scheduler.onError(new Error('loop failed'));
    scheduler.onError('loop string failure');
    expect(mocks.warnMain).toHaveBeenCalledWith('loop-scheduler', 'check failed', { message: 'loop failed' });
    expect(mocks.warnMain).toHaveBeenCalledWith('loop-scheduler', 'check failed', { message: 'loop string failure' });

    await runtime.stop();
    expect(mocks.schedulerStop).toHaveBeenCalledOnce();
    expect(mocks.serverClose).toHaveBeenCalledOnce();
    expect(mocks.mcpStop).toHaveBeenCalledOnce();
  });

  it('rejects loop prompts when a backend driver is not configured', async () => {
    const runtime = await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });
    mocks.drivers.clear();
    const loops = mocks.loopRunnerOptions[0] as LoopRunnerOptions;

    expect(() => loops.sendPrompt('agent-dina', 'run', { loopId: 'loop-1', executionId: 'run-1' }))
      .toThrowError('Backend driver is not configured: codex');
    await runtime.stop();
  });
});
