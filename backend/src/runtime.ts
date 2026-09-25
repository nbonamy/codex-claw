import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import path from 'node:path';
import { sendAgentPrompt } from '@codex-claw/core/agent-chat-service';
import type { Agent, BackendConversationRef, SystemPermissionsStatus } from '@codex-claw/core/contracts';
import { formatConversationTitle, shouldSyncConversationTitleFromAgent } from '@codex-claw/core/conversation-title';
import { requireAgentFolder } from '@codex-claw/core/agent-folder';
import { createAgentFromInput } from '@codex-claw/core/agent-manager';
import { updateAutomationExecutionAgentConversationInSnapshot } from '@codex-claw/core/automation-manager';
import { automationSelectionOutputSchema, automationSelectionPrompt, parseAutomationSelection } from '@codex-claw/core/automation-prompts';
import type { AgentBackendDriver, BackendSendResult } from '@codex-claw/core/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { BackendDriverRpc, createDefaultBackendDrivers } from './driver-rpc';
import { RemoteClawdClientManager } from './connections/remote-clawd-client';
import { SshConnectionService } from './connections/ssh-connections';
import { AutomationRunner } from './automations/runner';
import { RuntimeScheduler } from './scheduling/runtime-scheduler';
import { ClawMcpService } from './mcp/service';
import { HostedMcpGateway } from './mcp/hosted-mcp-gateway';
import { runtimeGitHubOAuthClientId } from './runtime-config';
import { ClawBackendServer } from './server';
import { backendCodexHomeDir, backendProviderTokensFilePath, deleteBackendMissionHome, ensureBackendCodexHome, ensureBackendMissionHome, loadBackendSnapshot, saveBackendSnapshot } from './state';
import { FileWorkIntegrationTokenStore } from './work-integrations/file-token-store';
import { GitHubWorkProviderDriver } from './work-integrations/github-driver';
import { WorkIntegrationManager } from './work-integrations/manager';
import { warnMain } from './log';
import { initializeCodexResourceSharing } from './codex-resource-sharing';
import { loadPluginStatus } from './plugin-status';
import { AgentGitService } from './git/agent-git-service';
import { PullRequestMonitor } from './git/pull-request-monitor';
import { WorktreeManager } from './worktrees/worktree-manager';
import { AgentCreationService } from './agents/agent-creation-service';
import { VisualizeService } from './visualize-service';
import { createVisualizeToolModuleProvider } from './mcp/visualize-tools';

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
  const agentCreation = new AgentCreationService(snapshot);
  const workIntegrations = new WorkIntegrationManager({
    drivers: [new GitHubWorkProviderDriver(() => runtimeGitHubOAuthClientId(snapshot.workBacklog.providerSettings.github))],
    getSnapshot: () => snapshot,
    saveSnapshot: () => saveBackendSnapshot(snapshot),
    tokenStore: new FileWorkIntegrationTokenStore(backendProviderTokensFilePath()),
  });
  await workIntegrations.hydrateConnections();
  const hostedMcpGateway = new HostedMcpGateway({ credentials: workIntegrations });
  let server!: ClawBackendServer;
  const visualizeService = new VisualizeService({
    snapshot,
    generatedImagesRoot: path.join(backendCodexHomeDir(), 'generated_images'),
    persist: () => saveBackendSnapshot(snapshot),
    publish: () => server?.emitEvent({ type: 'snapshot.updated', payload: snapshot }),
  });
  const mcpService = new ClawMcpService({
    missionTools: {
      contextForAgent: agentId => server.missionContext(agentId),
      submitResult: (agentId, input) => server.submitMissionResult(agentId, input),
      upsertTicket: (agentId, input) => server.upsertMissionTicket(agentId, input),
      setTitle: (agentId, title) => server.setMissionTitle(agentId, title),
      attachRepository: (agentId, repoPath) => server.attachMissionRepository(agentId, repoPath),
      listArtifacts: agentId => server.listMissionArtifacts(agentId),
      readArtifact: (agentId, stage) => server.readMissionArtifact(agentId, stage),
      writeArtifact: (agentId, input) => server.writeMissionArtifact(agentId, input),
      reportReviewFinding: (agentId, input) => server.reportMissionReviewFinding(agentId, input),
      updateReviewFinding: (agentId, input) => server.updateMissionReviewFinding(agentId, input),
    },
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
    hostedMcpGateway,
    queueSpokenAnnouncement: (input) => options.requestClient(backendMethods.clientSpokenAnnouncementQueue, input),
    resolveWorkspaceIdentity: (folder) => agentGitService.identity(folder),
    worktreeManager,
    agentCreation,
    createProject: (agentId, name, prompt, backend) => server.createProjectFromQuickChat(agentId, name, prompt, backend),
    toolModuleProviders: [createVisualizeToolModuleProvider(visualizeService)],
  });
  const mcpServerUrl = await mcpService.start();
  const backendDrivers = createDefaultBackendDrivers({
    clawMcpServerUrl: mcpServerUrl,
    hostedMcpServerUrls: () => mcpService.hostedMcpServerUrls(),
    generalSettings: snapshot.general,
    pluginSettings,
    celebrationsEnabled: () => snapshot.general.celebrationsEnabled,
    additionalDeveloperInstructions: (agent) => [
      server?.missionDeveloperInstructions(agent.id),
      visualizeService.developerInstructions(),
    ].filter(Boolean).join('\n\n') || undefined,
  });
  const driverRpc = new BackendDriverRpc(backendDrivers, worktreeManager);
  const automationRunner = new AutomationRunner({
    getSnapshot: () => snapshot,
    listWorkItems: workIntegrations,
    createWorktree: async (input) => (await worktreeManager.create(input)).worktree,
    notifySnapshotUpdated: () => server.emitEvent({
      type: 'snapshot.updated',
      payload: snapshot,
    }),
    saveSnapshot: () => saveBackendSnapshot(snapshot),
    selectWorkItems: async (automation, candidates) => {
      const folder = automation.repositories[0]?.sourceRepositoryPath ?? '';
      const pickerAgent = snapshot.agents.find((agent) => agent.teamId === automation.teamId && agent.backend === 'codex')
        ?? createAgentFromInput({ name: null, folder, backend: 'codex', teamId: automation.teamId });
      const driver = requireBackendDriver(backendDrivers, pickerAgent);
      if (!driver.generateText) {
        throw new Error('The selected automation backend cannot evaluate work item criteria.');
      }
      const result = await driver.generateText(pickerAgent, {
        cwd: folder,
        prompt: automationSelectionPrompt(automation, candidates),
        developerInstructions: 'Return only the IDs of eligible work items that match the supplied criteria. Never invent an ID or include an item outside the supplied candidate list.',
        outputSchema: automationSelectionOutputSchema,
      });
      return parseAutomationSelection(result.text, candidates);
    },
    sendPrompt: (agentId, prompt, context) => {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
      if (!agent) {
        return Promise.resolve(snapshot);
      }
      const driver = requireBackendDriver(backendDrivers, agent);
      mcpService.recordPromptInputMethod(agentId, 'typed');
      sendAgentPrompt(snapshot, driver, agentId, prompt, undefined, (event) => server.emitEvent(event), {
        onBackendSessionUpdated: (_result, wasNewSession) => setNewConversationTitle(agent, driver, wasNewSession),
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
  const scheduler = new RuntimeScheduler({
    onError: (taskId, error) => {
      warnMain('runtime-scheduler', 'task failed', {
        taskId,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });
  scheduler.register({
    id: 'automations',
    intervalMs: 60_000,
    runOnStart: true,
    run: () => automationRunner.runAll(),
  });
  const pullRequestMonitor = new PullRequestMonitor({
    getSnapshot: () => snapshot,
    notifySnapshotUpdated: () => server.emitEvent({
      type: 'snapshot.updated',
      payload: snapshot,
    }),
    onError: (agentId, error) => {
      warnMain('pull-request-monitor', 'check failed', {
        agentId,
        message: error instanceof Error ? error.message : String(error),
      });
    },
    pullRequests: workIntegrations,
    saveSnapshot: () => saveBackendSnapshot(snapshot),
  });
  scheduler.register({
    id: 'pull-request-monitor',
    intervalMs: 5 * 60_000,
    runOnStart: true,
    run: () => pullRequestMonitor.check(),
  });
  server = new ClawBackendServer({
    version: options.version,
    snapshot,
    agentGitService,
    agentCreation,
    visualizeService,
    driverRpc,
    onEvent: options.emitEvent,
    onBackendEventApplied: (event) => mcpService.handleBackendEvent(event),
    saveSnapshot: (nextSnapshot) => saveBackendSnapshot(nextSnapshot),
    ensureMissionHome: ensureBackendMissionHome,
    deleteMissionHome: deleteBackendMissionHome,
    inspectPluginStatus: async () => {
      pluginStatus = await loadPluginStatus();
      return pluginStatus;
    },
    sendAgentMessage: (fromAgentId, toAgentId, content) => mcpService.sendMessage(fromAgentId, toAgentId, content),
    onPromptStarting: (agentId, promptOptions) => {
      mcpService.recordPromptInputMethod(agentId, promptOptions?.inputMethod);
    },
    codeReviewTools: mcpService,
    workIntegrations,
    automationRunner,
    remoteClients: new RemoteClawdClientManager({
      requestHandlers: {
        [backendMethods.clientExternalOpen]: (params) => options.requestClient(backendMethods.clientExternalOpen, params),
        [backendMethods.clientSpokenAnnouncementQueue]: (params) => options.requestClient(backendMethods.clientSpokenAnnouncementQueue, params),
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
  scheduler.start();
  void server.initialize().catch((error) => warnMain('startup', 'backend initialization failed', {
    message: error instanceof Error ? error.message : String(error),
  }));

  return {
    server,
    async stop() {
      scheduler.stop();
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
