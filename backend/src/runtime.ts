import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { sendAgentPrompt } from '@codex-claw/core/agent-chat-service';
import type { Agent, BackendConversationRef, SystemPermissionsStatus } from '@codex-claw/core/contracts';
import { formatConversationTitle, shouldSyncConversationTitleFromAgent } from '@codex-claw/core/conversation-title';
import { requireAgentFolder } from '@codex-claw/core/agent-folder';
import { updateAutomationExecutionAgentConversationInSnapshot } from '@codex-claw/core/automation-manager';
import type { AgentBackendDriver, BackendSendResult } from '@codex-claw/core/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { BackendDriverRpc, createDefaultBackendDrivers } from './driver-rpc';
import { RemoteClawdClientManager } from './connections/remote-clawd-client';
import { SshConnectionService } from './connections/ssh-connections';
import { AutomationRunner } from './automations/runner';
import { AutomationScheduler } from './automations/scheduler';
import { ClawMcpService } from './mcp/service';
import { runtimeGitHubOAuthClientId } from './runtime-config';
import { ClawBackendServer } from './server';
import { backendProviderTokensFilePath, ensureBackendCodexHome, loadBackendSnapshot, saveBackendSnapshot } from './state';
import { FileWorkIntegrationTokenStore } from './work-integrations/file-token-store';
import { GitHubWorkProviderDriver } from './work-integrations/github-driver';
import { WorkIntegrationManager } from './work-integrations/manager';
import { warnMain } from './log';
import { initializeCodexResourceSharing } from './codex-resource-sharing';
import { loadPluginStatus } from './plugin-status';
import { AgentGitService } from './git/agent-git-service';
import { WorktreeManager } from './worktrees/worktree-manager';

type ClawdClientRequest = <Result>(method: string, params?: unknown) => Promise<Result>;

export type ClawdRuntimeOptions = {
  emitEvent(event: ClawBackendEvent): void;
  features?: {
    computerUse?: boolean;
    embeddedBrowser?: boolean;
  };
  requestClient: ClawdClientRequest;
  version: string;
};

export type ClawdRuntime = {
  server: ClawBackendServer;
  stop(): Promise<void>;
};

export async function createClawdRuntime(options: ClawdRuntimeOptions): Promise<ClawdRuntime> {
  const computerUseAvailable = options.features?.computerUse !== false;
  const embeddedBrowserAvailable = options.features?.embeddedBrowser !== false;
  const snapshot = await loadBackendSnapshot();
  await initializeCodexResourceSharing(snapshot.general.shareCodexSkillsAndPlugins);
  await ensureBackendCodexHome();
  let pluginStatus = await loadPluginStatus();
  const pluginSettings = () => ({
    ...(snapshot.general.plugins ?? { computerUseEnabled: false, chromeEnabled: false }),
    computerUseEnabled: computerUseAvailable && snapshot.general.plugins?.computerUseEnabled === true,
    chromeEnabled: pluginStatus.chromeEnabled,
  });
  const worktreeManager = new WorktreeManager({
    getInitializationMode: () => snapshot.general.worktreeInitializationMode,
  });
  const agentGitService = new AgentGitService(
    undefined,
    undefined,
    async (input) => (await worktreeManager.create(input)).worktree,
  );
  const mcpService = new ClawMcpService({
    snapshot,
    computerUse: computerUseAvailable ? {
      execute: (input) => options.requestClient(backendMethods.clientComputerUseExecute, input),
      requestAccessibility: () => options.requestClient(backendMethods.clientComputerUseRequestAccessibility),
      status: () => options.requestClient(backendMethods.clientComputerUseStatusGet),
      stop: () => options.requestClient(backendMethods.clientComputerUseStop),
    } : undefined,
    computerUseEnabled: () => computerUseAvailable && snapshot.general.plugins?.computerUseEnabled === true,
    browser: embeddedBrowserAvailable ? {
      open: (input) => options.requestClient(backendMethods.clientBrowserOpen, input),
      execute: (input) => options.requestClient(backendMethods.clientBrowserExecute, input),
    } : undefined,
    resolveWorkspaceIdentity: (folder) => agentGitService.identity(folder),
    worktreeManager,
  });
  const mcpServerUrl = await mcpService.start();
  const backendDrivers = createDefaultBackendDrivers({
    clawMcpServerUrl: mcpServerUrl,
    generalSettings: snapshot.general,
    pluginSettings,
  });
  const driverRpc = new BackendDriverRpc(backendDrivers, worktreeManager);
  let server: ClawBackendServer;
  const workIntegrations = new WorkIntegrationManager({
    drivers: [new GitHubWorkProviderDriver(() => runtimeGitHubOAuthClientId(snapshot.workBacklog.providerSettings.github))],
    getSnapshot: () => snapshot,
    openExternal: (url) => options.requestClient(backendMethods.clientExternalOpen, { url }),
    saveSnapshot: () => saveBackendSnapshot(snapshot),
    tokenStore: new FileWorkIntegrationTokenStore(backendProviderTokensFilePath()),
  });
  await workIntegrations.hydrateConnections();
  const automationRunner = new AutomationRunner({
    getSnapshot: () => snapshot,
    listWorkItems: workIntegrations,
    notifySnapshotUpdated: () => server.emitEvent({
      type: 'snapshot.updated',
      payload: snapshot,
    }),
    saveSnapshot: () => saveBackendSnapshot(snapshot),
    sendPrompt: (agentId, prompt, context) => {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
      if (!agent) {
        return Promise.resolve(snapshot);
      }
      const driver = requireBackendDriver(backendDrivers, agent);
      sendAgentPrompt(snapshot, driver, agentId, prompt, undefined, (event) => server.emitEvent(event), {
        onBackendSessionUpdated: (result, wasNewSession) => setNewConversationTitle(agent, driver, wasNewSession),
        onPromptStarted: async (result) => {
          const automation = updateAutomationExecutionAgentConversationInSnapshot(snapshot, context.automationId, context.executionId, agentId, {
            conversationRef: conversationRefFromSendResult(agent, result),
            updatedAt: new Date().toISOString(),
          });
          if (automation) {
            await saveBackendSnapshot(snapshot);
            server.emitEvent({
              type: 'snapshot.updated',
              payload: snapshot,
            });
          }
        },
      });
      return Promise.resolve(snapshot);
    },
  });
  const automationScheduler = new AutomationScheduler({
    runAutomations: () => automationRunner.runAll(),
    onError: (error) => {
      warnMain('automation-scheduler', 'check failed', { message: error instanceof Error ? error.message : String(error) });
    },
  });
  server = new ClawBackendServer({
    version: options.version,
    snapshot,
    agentGitService,
    driverRpc,
    onEvent: options.emitEvent,
    onBackendEventApplied: (event) => mcpService.handleBackendEvent(event),
    saveSnapshot: (nextSnapshot) => saveBackendSnapshot(nextSnapshot),
    inspectPluginStatus: async () => {
      pluginStatus = await loadPluginStatus();
      return pluginStatus;
    },
    sendAgentMessage: (fromAgentId, toAgentId, content) => mcpService.sendMessage(fromAgentId, toAgentId, content),
    workRouting: mcpService,
    workIntegrations,
    automationRunner,
    remoteClients: new RemoteClawdClientManager({
      requestHandlers: {
        [backendMethods.clientExternalOpen]: (params) => options.requestClient(backendMethods.clientExternalOpen, params),
        [backendMethods.clientBrowserOpen]: (params) => options.requestClient(backendMethods.clientBrowserOpen, params),
        [backendMethods.clientBrowserExecute]: (params) => options.requestClient(backendMethods.clientBrowserExecute, params),
        [backendMethods.clientComputerUseExecute]: (params) => options.requestClient(backendMethods.clientComputerUseExecute, params),
        [backendMethods.clientComputerUseStop]: (params) => options.requestClient(backendMethods.clientComputerUseStop, params),
        [backendMethods.clientComputerUseRequestAccessibility]: (params) => options.requestClient(backendMethods.clientComputerUseRequestAccessibility, params),
        [backendMethods.clientComputerUseStatusGet]: (params) => options.requestClient(backendMethods.clientComputerUseStatusGet, params),
        [backendMethods.clientSystemPermissionsGet]: (params) => options.requestClient(backendMethods.clientSystemPermissionsGet, params),
        [backendMethods.clientSystemPermissionsAccessibilityOpen]: (params) => options.requestClient(backendMethods.clientSystemPermissionsAccessibilityOpen, params),
        [backendMethods.clientSystemPermissionsScreenRecordingOpen]: (params) => options.requestClient(backendMethods.clientSystemPermissionsScreenRecordingOpen, params),
      },
    }),
    sshConnections: new SshConnectionService(),
    systemPermissions: {
      getStatus: () => options.requestClient<SystemPermissionsStatus>(backendMethods.clientSystemPermissionsGet),
      openAccessibilitySettings: () => options.requestClient<SystemPermissionsStatus>(backendMethods.clientSystemPermissionsAccessibilityOpen),
      openScreenRecordingSettings: () => options.requestClient<SystemPermissionsStatus>(backendMethods.clientSystemPermissionsScreenRecordingOpen),
    },
  });
  mcpService.setDriverRpc(driverRpc);
  mcpService.setEventSink((event) => server.emitEvent(event));
  automationScheduler.start();

  return {
    server,
    async stop() {
      automationScheduler.stop();
      await server.close();
      await mcpService.stop();
    },
  };
}

function requireBackendDriver(drivers: Map<Agent['backend'], AgentBackendDriver>, agent: Agent): AgentBackendDriver {
  const driver = drivers.get(agent.backend);
  if (!driver) {
    throw new Error(`Backend driver is not configured: ${agent.backend}`);
  }
  return driver;
}

function setNewConversationTitle(agent: Agent, driver: AgentBackendDriver, wasNewSession: boolean): void {
  if (!wasNewSession || !driver.setConversationTitle || !shouldSyncConversationTitleFromAgent(agent)) {
    return;
  }

  agent.conversationTitle = formatConversationTitle(agent);
  void Promise.resolve(driver.setConversationTitle(agent, agent.conversationTitle)).catch((error) => {
    warnMain('conversation-title', 'failed', {
      agentId: agent.id,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

function conversationRefFromSendResult(agent: Agent, result: BackendSendResult): BackendConversationRef {
  return result.backendSession.kind === 'codex'
    ? { backend: 'codex', threadId: result.backendSession.threadId }
    : { backend: 'claude', folder: requireAgentFolder(agent), sessionId: result.backendSession.transcriptSessionId ?? result.backendSession.sessionId };
}
