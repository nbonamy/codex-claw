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
  automationRunnerOptions: [] as unknown[],
  schedulerOptions: [] as unknown[],
  schedulerTasks: [] as unknown[],
  remoteOptions: [] as unknown[],
  workIntegrationOptions: [] as unknown[],
  agentGitServices: [] as Array<{ identity: ReturnType<typeof vi.fn> }>,
  sendAgentPrompt: vi.fn(),
  updateAutomationConversation: vi.fn(),
  loadBackendSnapshot: vi.fn(),
  ensureBackendCodexHome: vi.fn(),
  ensureBackendMissionHome: vi.fn(),
  deleteBackendMissionHome: vi.fn(),
  initializeCodexResourceSharing: vi.fn(),
  loadPluginStatus: vi.fn(),
  saveBackendSnapshot: vi.fn(),
  backendCodexHomeDir: vi.fn(() => '/tmp/codex-home'),
  backendProviderTokensFilePath: vi.fn(),
  mcpStart: vi.fn(),
  mcpStop: vi.fn(),
  mcpHostedServerUrls: vi.fn(),
  mcpSetDriverRpc: vi.fn(),
  mcpSetEventSink: vi.fn(),
  mcpHandleBackendEvent: vi.fn(),
  mcpSendMessage: vi.fn(),
  mcpRecordPromptInputMethod: vi.fn(),
  hydrateConnections: vi.fn(),
  githubConnected: vi.fn(),
  getPullRequest: vi.fn(),
  schedulerStart: vi.fn(),
  schedulerStop: vi.fn(),
  schedulerRegister: vi.fn(),
  automationRunAll: vi.fn(),
  serverEmitEvent: vi.fn(),
  serverClose: vi.fn(),
  missionDeveloperInstructions: vi.fn(),
  createDefaultBackendDrivers: vi.fn(),
  runtimeGitHubOAuthClientId: vi.fn(),
  warnMain: vi.fn(),
}));

vi.mock('@codex-claw/core/agent-chat-service', () => ({
  sendAgentPrompt: mocks.sendAgentPrompt,
}));

vi.mock('@codex-claw/core/automation-manager', () => ({
  updateAutomationExecutionAgentConversationInSnapshot: mocks.updateAutomationConversation,
}));

vi.mock('../state', () => ({
  loadBackendSnapshot: mocks.loadBackendSnapshot,
  ensureBackendCodexHome: mocks.ensureBackendCodexHome,
  ensureBackendMissionHome: mocks.ensureBackendMissionHome,
  deleteBackendMissionHome: mocks.deleteBackendMissionHome,
  saveBackendSnapshot: mocks.saveBackendSnapshot,
  backendCodexHomeDir: mocks.backendCodexHomeDir,
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
    hostedMcpServerUrls = mocks.mcpHostedServerUrls;
    setDriverRpc = mocks.mcpSetDriverRpc;
    setEventSink = mocks.mcpSetEventSink;
    handleBackendEvent = mocks.mcpHandleBackendEvent;
    sendMessage = mocks.mcpSendMessage;
    recordPromptInputMethod = mocks.mcpRecordPromptInputMethod;
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
    githubConnected = mocks.githubConnected;
    getPullRequest = mocks.getPullRequest;
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

vi.mock('../automations/runner', () => ({
  AutomationRunner: class {
    constructor(options: unknown) { mocks.automationRunnerOptions.push(options); }
    runAll = mocks.automationRunAll;
  },
}));

vi.mock('../scheduling/runtime-scheduler', () => ({
  RuntimeScheduler: class {
    constructor(options: unknown) { mocks.schedulerOptions.push(options); }
    register = (task: unknown) => {
      mocks.schedulerRegister(task);
      mocks.schedulerTasks.push(task);
    };
    start = mocks.schedulerStart;
    stop = mocks.schedulerStop;
  },
}));

vi.mock('../server', () => ({
  ClawBackendServer: class {
    initialize = vi.fn().mockResolvedValue(undefined);
    constructor(options: unknown) { mocks.serverOptions.push(options); }
    emitEvent = mocks.serverEmitEvent;
    close = mocks.serverClose;
    missionDeveloperInstructions = mocks.missionDeveloperInstructions;
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

vi.mock('../git/agent-git-service', () => ({
  AgentGitService: class {
    identity = vi.fn().mockResolvedValue({ kind: 'folder', folder: '/src/claw', label: 'claw', updatedAt: '2026-09-02T00:00:00.000Z' });

    constructor() {
      mocks.agentGitServices.push(this);
    }
  },
}));

import { createClawdRuntime } from '../runtime';

type McpOptions = {
  hostedMcpGateway?: unknown;
  resolveWorkspaceIdentity(folder: string): Promise<unknown>;
  queueSpokenAnnouncement(input: unknown): Promise<unknown>;
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
  agentGitService: unknown;
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

type AutomationRunnerOptions = {
  notifySnapshotUpdated(): void;
  saveSnapshot(): Promise<unknown>;
  sendPrompt(agentId: string, prompt: string, context: { automationId: string; executionId: string }): Promise<unknown>;
  selectWorkItems(automation: import('@codex-claw/core/contracts').Automation, candidates: import('@codex-claw/core/contracts').WorkItem[]): Promise<import('@codex-claw/core/contracts').WorkItem[]>;
};

type SchedulerOptions = { onError(taskId: string, error: unknown): void };
type SchedulerTask = { id: string; intervalMs: number; runOnStart?: boolean; run(): Promise<unknown> };

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
    generateText: vi.fn(),
    setConversationTitle: vi.fn(),
  };
  const emitEvent = vi.fn();
  const requestClient = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mcpOptions.length = 0;
    mocks.serverOptions.length = 0;
    mocks.automationRunnerOptions.length = 0;
    mocks.schedulerOptions.length = 0;
    mocks.schedulerTasks.length = 0;
    mocks.remoteOptions.length = 0;
    mocks.workIntegrationOptions.length = 0;
    mocks.agentGitServices.length = 0;
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
    mocks.mcpHostedServerUrls.mockReturnValue({
      github: 'http://127.0.0.1:4242/mcp/providers/github',
    });
    mocks.hydrateConnections.mockResolvedValue(undefined);
    mocks.githubConnected.mockResolvedValue(false);
    mocks.serverClose.mockResolvedValue(undefined);
    mocks.missionDeveloperInstructions.mockReturnValue('<context>\nMission contract\n</context>');
    mocks.createDefaultBackendDrivers.mockReturnValue(mocks.drivers);
    mocks.runtimeGitHubOAuthClientId.mockReturnValue('github-client');
    requestClient.mockImplementation(async (method: string, params?: unknown) => ({ method, params }));
    mocks.automationRunAll.mockResolvedValue(undefined);
    driver.generateText.mockResolvedValue({ text: '{"workItemIds":["github:nbonamy/codex-claw#12"]}' });
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
    expect(mocks.schedulerTasks).toEqual([
      expect.objectContaining({ id: 'automations', intervalMs: 60_000, runOnStart: true }),
      expect.objectContaining({ id: 'pull-request-monitor', intervalMs: 300_000, runOnStart: true }),
    ]);
    expect(mocks.mcpSetDriverRpc).toHaveBeenCalledOnce();
    expect(mocks.mcpSetEventSink).toHaveBeenCalledOnce();

    const mcp = mocks.mcpOptions[0] as McpOptions;
    expect(mcp.hostedMcpGateway).toBeDefined();
    await mcp.resolveWorkspaceIdentity('/src/claw');
    expect(mocks.agentGitServices[0]?.identity).toHaveBeenCalledWith('/src/claw');
    await mcp.computerUse!.execute({ command: 'click' });
    await mcp.computerUse!.requestAccessibility();
    await mcp.computerUse!.status();
    await mcp.computerUse!.stop();
    await mcp.browser!.open({ url: 'https://example.com' });
    await mcp.browser!.execute({ command: 'dom' });
    await mcp.queueSpokenAnnouncement({
      agentId: 'agent-dina', phase: 'start', text: 'On it.', voice: 'af_heart',
    });
    expect(requestClient.mock.calls.map(([method]) => method)).toStrictEqual([
      backendMethods.clientComputerUseExecute,
      backendMethods.clientComputerUseRequestAccessibility,
      backendMethods.clientComputerUseStatusGet,
      backendMethods.clientComputerUseStop,
      backendMethods.clientBrowserOpen,
      backendMethods.clientBrowserExecute,
      backendMethods.clientSpokenAnnouncementQueue,
    ]);

    const driverOptions = mocks.createDefaultBackendDrivers.mock.calls[0]?.[0] as {
      hostedMcpServerUrls(): Record<string, string>;
      additionalDeveloperInstructions(agent: { id: string }): string | undefined;
    };
    expect(driverOptions.hostedMcpServerUrls()).toStrictEqual({
      github: 'http://127.0.0.1:4242/mcp/providers/github',
    });
    expect(driverOptions.additionalDeveloperInstructions(mocks.snapshot.agents[0]!)).toMatch(
      /<context>\nMission contract\n<\/context>[\s\S]*contextual Visualize MCP tools/u,
    );
    expect(mocks.missionDeveloperInstructions).toHaveBeenCalledWith('agent-dina');

    const server = mocks.serverOptions[0] as ServerOptions;
    expect(server.agentGitService).toBe(mocks.agentGitServices[0]);
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
    await workIntegrations.saveSnapshot();
    expect(workIntegrations).not.toHaveProperty('openExternal');
    expect(mocks.saveBackendSnapshot).toHaveBeenCalledWith(mocks.snapshot);

    const remote = mocks.remoteOptions[0] as RemoteOptions;
    for (const [method, handler] of Object.entries(remote.requestHandlers)) {
      await handler({ request: method });
      expect(requestClient).toHaveBeenCalledWith(method, { request: method });
    }

    const sink = mocks.mcpSetEventSink.mock.calls[0]?.[0] as (event: unknown) => void;
    sink({ type: 'sink-event' });
    expect(mocks.serverEmitEvent).toHaveBeenCalledWith({ type: 'sink-event' });

    const automationTask = mocks.schedulerTasks[0] as SchedulerTask;
    await automationTask.run();
    expect(mocks.automationRunAll).toHaveBeenCalledOnce();
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

  it('runs automation prompts, records new conversations, and emits snapshot updates', async () => {
    mocks.updateAutomationConversation.mockReturnValue({ agentId: 'agent-dina' });
    let titlePromise: Promise<void> | undefined;
    let startedPromise: Promise<void> | undefined;
    mocks.sendAgentPrompt.mockImplementation((_snapshot, _driver, _agentId, _prompt, _options, emit, hooks) => {
      emit({ agentId: 'agent-dina', type: 'agent.statusChanged', payload: { type: 'working' } });
      titlePromise = hooks.onBackendSessionUpdated({
        backendSession: { kind: 'codex', threadId: 'thread-42' },
      }, true);
      startedPromise = hooks.onPromptStarted({
        backendSession: { kind: 'codex', threadId: 'thread-42' },
      });
    });

    await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });
    const automations = mocks.automationRunnerOptions[0] as AutomationRunnerOptions;
    await expect(automations.sendPrompt('missing', 'ignore', { automationId: 'automation-1', executionId: 'run-1' }))
      .resolves.toBe(mocks.snapshot);
    expect(mocks.sendAgentPrompt).not.toHaveBeenCalled();

    await expect(automations.sendPrompt('agent-dina', 'run tests', { automationId: 'automation-1', executionId: 'run-1' }))
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
      'Dina',
    );
    expect(mocks.updateAutomationConversation).toHaveBeenCalledWith(
      mocks.snapshot,
      'automation-1',
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

    automations.notifySnapshotUpdated();
    await automations.saveSnapshot();
    expect(mocks.serverEmitEvent).toHaveBeenLastCalledWith({
      type: 'snapshot.updated',
      payload: mocks.snapshot,
    });
  });

  it('uses hidden structured generation to select automation work across all repositories', async () => {
    await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });
    const automations = mocks.automationRunnerOptions[0] as AutomationRunnerOptions;
    const item = {
      provider: 'github' as const,
      id: 'nbonamy/codex-claw#12',
      repositoryId: 'nbonamy/codex-claw',
      repositoryFullName: 'nbonamy/codex-claw',
      number: 12,
      title: 'Fix the picker',
      url: 'https://github.com/nbonamy/codex-claw/issues/12',
      state: 'open' as const,
      assignees: [],
      labels: [],
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    };
    const automation = {
      id: 'automation-1',
      name: 'Ready work',
      enabled: true,
      repositories: [
        { provider: 'github' as const, repositoryId: 'nbonamy/codex-claw', sourceRepositoryPath: '/src/claw' },
        { provider: 'github' as const, repositoryId: 'nbonamy/witsy', sourceRepositoryPath: '/src/witsy' },
      ],
      teamId: 'team-claw',
      selectionPrompt: 'Only ready bugs.',
      schedule: { intervalMinutes: 60 },
      executionLog: [],
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    };

    await expect(automations.selectWorkItems(automation, [item])).resolves.toStrictEqual([item]);

    expect(driver.generateText).toHaveBeenCalledWith(
      mocks.snapshot.agents[0],
      expect.objectContaining({
        cwd: '/src/claw',
        prompt: expect.stringContaining('nbonamy/witsy (local clone: /src/witsy)'),
        outputSchema: expect.objectContaining({ type: 'object' }),
      }),
    );
  });

  it('handles lifecycle shutdown and nonfatal scheduler/title failures', async () => {
    let hooks: { onBackendSessionUpdated(result: unknown, isNew: boolean): Promise<void> } | undefined;
    mocks.sendAgentPrompt.mockImplementation((_snapshot, _driver, _agentId, _prompt, _options, _emit, value) => {
      hooks = value;
    });
    driver.setConversationTitle.mockRejectedValue('rename failed');
    const runtime = await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });
    const automations = mocks.automationRunnerOptions[0] as AutomationRunnerOptions;
    await automations.sendPrompt('agent-dina', 'run', { automationId: 'automation-1', executionId: 'run-1' });
    await hooks?.onBackendSessionUpdated({ backendSession: { kind: 'codex', threadId: 'thread' } }, false);
    await hooks?.onBackendSessionUpdated({ backendSession: { kind: 'codex', threadId: 'thread' } }, true);
    expect(mocks.warnMain).toHaveBeenCalledWith('conversation-title', 'failed', {
      agentId: 'agent-dina',
      message: 'rename failed',
    });

    const scheduler = mocks.schedulerOptions[0] as SchedulerOptions;
    scheduler.onError('automations', new Error('automation failed'));
    scheduler.onError('pull-request-monitor', 'github string failure');
    expect(mocks.warnMain).toHaveBeenCalledWith('runtime-scheduler', 'task failed', { taskId: 'automations', message: 'automation failed' });
    expect(mocks.warnMain).toHaveBeenCalledWith('runtime-scheduler', 'task failed', { taskId: 'pull-request-monitor', message: 'github string failure' });

    await runtime.stop();
    expect(mocks.schedulerStop).toHaveBeenCalledOnce();
    expect(mocks.serverClose).toHaveBeenCalledOnce();
    expect(mocks.mcpStop).toHaveBeenCalledOnce();
  });

  it('rejects automation prompts when a backend driver is not configured', async () => {
    const runtime = await createClawdRuntime({ emitEvent, requestClient, version: '1.2.3' });
    mocks.drivers.clear();
    const automations = mocks.automationRunnerOptions[0] as AutomationRunnerOptions;

    expect(() => automations.sendPrompt('agent-dina', 'run', { automationId: 'automation-1', executionId: 'run-1' }))
      .toThrowError('Backend driver is not configured: codex');
    await runtime.stop();
  });
});
