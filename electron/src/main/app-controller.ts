import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { AgentActivityPowerSaveBlocker } from './agent-activity-power-save-blocker';
import { logMain, warnMain } from './log';
import { createMainWindow } from './main-window';
import { createRuntimeClawBackendClient, type ClawBackendClientPort } from './backend-client';
import { getClawdDaemonStatus, setClawdDaemonEnabled } from './daemon-launch-agent';
import { ensureCurrentClawdDaemonForStartup } from './daemon-startup-maintenance';
import { isClawSnapshotGetResult, type ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { isAppSnapshot, isClientState } from '@codex-claw/shared/snapshot-guards';
import type { AddSshConnectionInput, AgentFilePreviewResult, AgentFileSearchItem, AppleSpeechTranscriptionOptions, AppleSpeechTranscriptionResult, ApprovalPreset, AppSnapshot, BackendConversationRef, BenchLocation, BackendModelOption, BackendSkillSummary, ClawdDaemonStatus, ClientRequestResponse, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, LoopLocation, MainToRendererEvent, MoveAgentToTeamInput, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, SystemPermissionsStatus, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { ipcChannels } from '@codex-claw/shared/ipc';

type AppLifecycle = Pick<typeof app, 'exit' | 'quit' | 'relaunch'>;
type StartupMaintenance = () => Promise<void>;

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private snapshot: AppSnapshot | null = null;
  private clientState: ClientState = createEmptyClientState();
  private backendClientEventUnsubscribe: (() => void) | null = null;
  private seq = 0;

  private readonly powerSaveBlocker = new AgentActivityPowerSaveBlocker();
  private readonly backendClient: ClawBackendClientPort | null;

  constructor(
    initialSnapshot: AppSnapshot | null = null,
    backendClient: ClawBackendClientPort | null = createRuntimeClawBackendClient(),
    private readonly appLifecycle: AppLifecycle = app,
    private readonly startupMaintenance: StartupMaintenance = async () => undefined,
  ) {
    this.snapshot = initialSnapshot;
    this.backendClient = backendClient;
  }

  async initialize(): Promise<void> {
    await this.startupMaintenance();
    await this.initializeBackendClient();
    this.syncPowerSaveBlocker();
  }

  registerIpcHandlers(): void {
    ipcMain.handle(ipcChannels.getSnapshot, () => this.getSnapshot());

    ipcMain.handle(ipcChannels.listSshHosts, () => {
      return this.listSshHosts();
    });

    ipcMain.handle(ipcChannels.addSshConnection, async (_event, input: AddSshConnectionInput) => {
      return this.addSshConnection(input);
    });

    ipcMain.handle(ipcChannels.checkRemoteConnection, async (_event, connectionId: string) => {
      return this.checkRemoteConnection(connectionId);
    });

    ipcMain.handle(ipcChannels.updateRemoteConnection, async (_event, connectionId: string, input: UpdateRemoteConnectionInput) => {
      return this.updateRemoteConnection(connectionId, input);
    });

    ipcMain.handle(ipcChannels.removeRemoteConnection, async (_event, connectionId: string) => {
      return this.removeRemoteConnection(connectionId);
    });

    ipcMain.handle(ipcChannels.connectWorkProvider, async (_event, provider: WorkProviderKind) => {
      return this.connectWorkProvider(provider);
    });

    ipcMain.handle(ipcChannels.openWorkProviderAuthorization, async (_event, provider: WorkProviderKind) => {
      return this.openWorkProviderAuthorization(provider);
    });

    ipcMain.handle(ipcChannels.completeWorkProviderConnection, async (_event, provider: WorkProviderKind) => {
      return this.completeWorkProviderConnection(provider);
    });

    ipcMain.handle(ipcChannels.disconnectWorkProvider, async (_event, provider: WorkProviderKind) => {
      return this.disconnectWorkProvider(provider);
    });

    ipcMain.handle(ipcChannels.listWorkRepositories, async (_event, provider: WorkProviderKind, location?: LoopLocation) => {
      return this.listWorkRepositories(provider, location);
    });

    ipcMain.handle(ipcChannels.configureWorkBacklog, async (_event, input: WorkBacklogConfigurationInput, location?: LoopLocation) => {
      return this.configureWorkBacklog(input, location);
    });

    ipcMain.handle(ipcChannels.listWorkItems, async (_event, provider: WorkProviderKind, repositoryId: string, location?: LoopLocation) => {
      return this.listWorkItems(provider, repositoryId, location);
    });

    ipcMain.handle(ipcChannels.listBackendModels, async (_event, agentId: string) => {
      return this.listBackendModels(agentId);
    });

    ipcMain.handle(ipcChannels.listBackendSkills, async (_event, agentId: string) => {
      return this.listBackendSkills(agentId);
    });

    ipcMain.handle(ipcChannels.listAgentFiles, async (_event, agentId: string) => {
      return this.listAgentFiles(agentId);
    });

    ipcMain.handle(ipcChannels.previewAgentFile, async (_event, agentId: string, filePath: string) => {
      return this.previewAgentFile(agentId, filePath);
    });

    ipcMain.handle(ipcChannels.openAgentGitDiff, async (_event, agentId: string) => {
      return this.openAgentGitDiff(agentId);
    });

    ipcMain.handle(ipcChannels.chooseAgentFolder, async () => {
      return this.chooseAgentFolder();
    });

    ipcMain.handle(ipcChannels.chooseSourceFolder, async () => {
      return this.chooseSourceFolder();
    });

    ipcMain.handle(ipcChannels.listSourceFolders, async (_event, input?: SourceFolderListInput) => {
      return this.listSourceFolders(input);
    });

    ipcMain.handle(ipcChannels.listSourceRepositories, async (_event, remoteConnectionId?: string) => {
      return this.listSourceRepositories(remoteConnectionId);
    });

    ipcMain.handle(ipcChannels.listSourceWorktrees, async (_event, repoPath: string, remoteConnectionId?: string) => {
      return this.listSourceWorktrees(repoPath, remoteConnectionId);
    });

    ipcMain.handle(ipcChannels.suggestSourceWorktreePath, async (_event, input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>) => {
      return this.suggestSourceWorktreePath(input);
    });

    ipcMain.handle(ipcChannels.chooseSourceWorktreeDestination, async (_event, defaultPath: string) => {
      return this.chooseSourceWorktreeDestination(defaultPath);
    });

    ipcMain.handle(ipcChannels.createSourceWorktree, async (_event, input: CreateSourceWorktreeInput) => {
      return this.createSourceWorktree(input);
    });

    ipcMain.handle(ipcChannels.createTeam, async (_event, input: CreateTeamInput) => {
      return this.createTeam(input);
    });

    ipcMain.handle(ipcChannels.updateTeam, async (_event, input: UpdateTeamInput) => {
      return this.updateTeam(input);
    });

    ipcMain.handle(ipcChannels.reorderTeams, async (_event, input: ReorderTeamsInput) => {
      return this.reorderTeams(input);
    });

    ipcMain.handle(ipcChannels.closeTeam, async (_event, teamId: string) => {
      return this.closeTeam(teamId);
    });

    ipcMain.handle(ipcChannels.disconnectTeam, async (_event, teamId: string) => {
      return this.disconnectTeam(teamId);
    });

    ipcMain.handle(ipcChannels.selectTeam, async (_event, teamId: string) => {
      return this.selectTeam(teamId);
    });

    ipcMain.handle(ipcChannels.getBenchSnapshot, async (_event, location?: BenchLocation) => {
      return this.getBenchSnapshot(location);
    });

    ipcMain.handle(ipcChannels.getLoopSnapshot, async (_event, location?: LoopLocation) => {
      return this.getLoopSnapshot(location);
    });

    ipcMain.handle(ipcChannels.createLoop, async (_event, input: CreateLoopInput, location?: LoopLocation) => {
      return this.createLoop(input, location);
    });

    ipcMain.handle(ipcChannels.updateLoop, async (_event, input: UpdateLoopInput, location?: LoopLocation) => {
      return this.updateLoop(input, location);
    });

    ipcMain.handle(ipcChannels.runLoop, async (_event, loopId: string, location?: LoopLocation) => {
      return this.runLoop(loopId, location);
    });

    ipcMain.handle(ipcChannels.clearLoopHistory, async (_event, loopId: string, location?: LoopLocation) => {
      return this.clearLoopHistory(loopId, location);
    });

    ipcMain.handle(ipcChannels.deleteLoopExecution, async (_event, loopId: string, executionId: string, location?: LoopLocation) => {
      return this.deleteLoopExecution(loopId, executionId, location);
    });

    ipcMain.handle(ipcChannels.deleteLoop, async (_event, loopId: string, location?: LoopLocation) => {
      return this.deleteLoop(loopId, location);
    });

    ipcMain.handle(ipcChannels.listAgentConversations, async (_event, agentId: string) => {
      return this.listAgentConversations(agentId);
    });

    ipcMain.handle(ipcChannels.resumeAgentConversation, async (_event, agentId: string, ref: unknown) => {
      return this.resumeAgentConversation(agentId, ref);
    });

    ipcMain.handle(ipcChannels.readConversationMessages, async (_event, ref: unknown, agentId: string, location?: LoopLocation) => {
      return this.readConversationMessages(ref, agentId, location);
    });

    ipcMain.handle(ipcChannels.createAgent, async (_event, input: CreateAgentInput) => {
      return this.createAgent(input);
    });

    ipcMain.handle(ipcChannels.updateAgent, async (_event, input: UpdateAgentInput) => {
      return this.updateAgent(input);
    });

    ipcMain.handle(ipcChannels.assignWorkItemToAgent, async (_event, agentId: string, item: unknown) => {
      return this.assignWorkItemToAgent(agentId, item);
    });

    ipcMain.handle(ipcChannels.removeWorkItemAssignment, async (_event, item: unknown) => {
      return this.removeWorkItemAssignment(item);
    });

    ipcMain.handle(ipcChannels.duplicateAgent, async (_event, agentId: string) => {
      return this.duplicateAgent(agentId);
    });

    ipcMain.handle(ipcChannels.moveAgentToTeam, async (_event, input: MoveAgentToTeamInput) => {
      return this.moveAgentToTeam(input);
    });

    ipcMain.handle(ipcChannels.reorderAgents, async (_event, input: ReorderAgentsInput) => {
      return this.reorderAgents(input);
    });

    ipcMain.handle(ipcChannels.saveAgentToBench, async (_event, agentId: string) => {
      return this.saveAgentToBench(agentId);
    });

    ipcMain.handle(ipcChannels.deployBenchTemplate, async (_event, templateId: string, teamId?: string, location?: BenchLocation) => {
      return this.deployBenchTemplate(templateId, teamId, location);
    });

    ipcMain.handle(ipcChannels.removeBenchTemplate, async (_event, templateId: string, location?: BenchLocation) => {
      return this.removeBenchTemplate(templateId, location);
    });

    ipcMain.handle(ipcChannels.restartAgent, async (_event, agentId: string) => {
      return this.restartAgent(agentId);
    });

    ipcMain.handle(ipcChannels.hydrateAgentHistory, async (_event, agentId: string) => {
      return this.hydrateAgentHistory(agentId);
    });

    ipcMain.handle(ipcChannels.closeAgent, async (_event, agentId: string) => {
      return this.closeAgent(agentId);
    });

    ipcMain.handle(ipcChannels.selectAgent, async (_event, agentId: string) => {
      return this.selectAgent(agentId);
    });

    ipcMain.handle(ipcChannels.updateSettings, async (_event, input: UpdateSettingsInput) => {
      return this.updateSettings(input);
    });

    ipcMain.handle(ipcChannels.getDaemonStatus, () => this.getDaemonStatus());

    ipcMain.handle(ipcChannels.setDaemonEnabled, async (_event, enabled: boolean) => {
      return this.setDaemonEnabled(enabled);
    });

    ipcMain.handle(ipcChannels.getSystemPermissions, () => this.getSystemPermissions());

    ipcMain.handle(ipcChannels.openAccessibilitySettings, () => this.openAccessibilitySettings());

    ipcMain.handle(ipcChannels.transcribeAppleSpeech, async (_event, audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions) => {
      return this.transcribeAppleSpeech(audioData, options);
    });

    ipcMain.handle(ipcChannels.quit, () => {
      this.appLifecycle.quit();
    });

    ipcMain.handle(ipcChannels.restartApp, () => {
      this.restartApp();
    });

    ipcMain.handle(ipcChannels.setAgentGoal, (_event, agentId: string, objective: string) => {
      return this.setAgentGoal(agentId, objective);
    });

    ipcMain.handle(ipcChannels.clearAgentGoal, (_event, agentId: string) => {
      return this.clearAgentGoal(agentId);
    });

    ipcMain.handle(ipcChannels.setAgentApprovalPreset, (_event, agentId: string, preset: ApprovalPreset) => {
      return this.setAgentApprovalPreset(agentId, preset);
    });

    ipcMain.handle(ipcChannels.sendPrompt, (_event, agentId: string, prompt: string, options?: SendPromptOptions) => {
      return this.sendPrompt(agentId, prompt, options);
    });

    ipcMain.handle(ipcChannels.steerPrompt, (_event, agentId: string, prompt: string) => {
      return this.steerPrompt(agentId, prompt);
    });

    ipcMain.handle(ipcChannels.interruptAgent, (_event, agentId: string) => {
      return this.interruptAgent(agentId);
    });

    ipcMain.handle(ipcChannels.deleteMessage, (_event, agentId: string, messageId: string) => {
      return this.deleteMessage(agentId, messageId);
    });

    ipcMain.handle(ipcChannels.editMessage, (_event, agentId: string, messageId: string, prompt: string) => {
      return this.editMessage(agentId, messageId, prompt);
    });

    ipcMain.handle(ipcChannels.retryMessage, (_event, agentId: string, messageId: string) => {
      return this.retryMessage(agentId, messageId);
    });

    ipcMain.handle(ipcChannels.respondToClientRequest, async (_event, response: ClientRequestResponse) => {
      return this.respondToClientRequest(response);
    });
  }

  createWindow(): void {
    this.mainWindow = createMainWindow();
  }

  async shutdown(): Promise<void> {
    this.powerSaveBlocker.stop();
    this.backendClientEventUnsubscribe?.();
    this.backendClientEventUnsubscribe = null;
    await this.backendClient?.close();
  }

  private async initializeBackendClient(): Promise<void> {
    if (!this.backendClient) {
      return;
    }

    try {
      await this.backendClient.start();
      const health = await this.backendClient.health();
      this.backendClientEventUnsubscribe?.();
      this.backendClientEventUnsubscribe = this.backendClient.onEvent((event) => this.emitBackendEvent(event));
      await this.refreshSnapshotFromBackend();
      logMain('clawd', 'connected to backend', { version: health.version, pid: health.pid });
    } catch (error) {
      warnMain('clawd', 'failed to connect to backend process', {
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async connectWorkProvider(provider: WorkProviderKind): Promise<WorkProviderConnectResult> {
    const result = await this.requireBackendClient().request<WorkProviderConnectResult>(backendMethods.workProviderConnect, { provider });
    await this.adoptBackendSnapshot(result.snapshot);
    return result;
  }

  private async listSshHosts(): Promise<SshHostCandidate[]> {
    return this.requireBackendClient().request(backendMethods.connectionsSshHostsList);
  }

  private async addSshConnection(input: AddSshConnectionInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.connectionsSshCreate, { input }));
  }

  private async checkRemoteConnection(connectionId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.connectionsSync, { connectionId }));
  }

  private async updateRemoteConnection(connectionId: string, input: UpdateRemoteConnectionInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.connectionsUpdate, { connectionId, input }));
  }

  private async removeRemoteConnection(connectionId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.connectionsDelete, { connectionId }));
  }

  private async openWorkProviderAuthorization(provider: WorkProviderKind): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.workProviderAuthorizationOpen, { provider }));
  }

  private async completeWorkProviderConnection(provider: WorkProviderKind): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.workProviderConnectionComplete, { provider }));
  }

  private async disconnectWorkProvider(provider: WorkProviderKind): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.workProviderDisconnect, { provider }));
  }

  private async listWorkRepositories(provider: WorkProviderKind, location?: LoopLocation): Promise<WorkRepository[]> {
    return this.requireBackendClient().request(backendMethods.workProviderRepositoriesList, {
      provider,
      ...(location ? { location } : {}),
    });
  }

  private async configureWorkBacklog(input: WorkBacklogConfigurationInput, location?: LoopLocation): Promise<AppSnapshot> {
    const snapshot = await this.requireBackendClient().request<AppSnapshot>(backendMethods.workProviderBacklogConfigure, {
      input,
      ...(location ? { location } : {}),
    });
    return location?.kind === 'remote' ? snapshot : this.adoptBackendSnapshot(snapshot);
  }

  private async listWorkItems(provider: WorkProviderKind, repositoryId: string, location?: LoopLocation): Promise<WorkItem[]> {
    return this.requireBackendClient().request(backendMethods.workProviderItemsList, {
      provider,
      repositoryId,
      ...(location ? { location } : {}),
    });
  }

  private async createAgent(input: CreateAgentInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentCreate, { input }));
  }

  private async updateAgent(input: UpdateAgentInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentUpdate, { input }));
  }

  private async duplicateAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentDuplicate, { agentId }));
  }

  private async moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentTeamMove, { input }));
  }

  private async reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentReorder, { input }));
  }

  private async closeAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentDelete, { agentId }));
  }

  private async selectAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentSelect, { agentId }));
  }

  private async updateAgentFolder(agentId: string, folder: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentFolderUpdate, { agentId, folder }));
  }

  private async assignWorkItemToAgent(agentId: string, item: unknown): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentWorkItemAssign, { agentId, item }));
  }

  private async removeWorkItemAssignment(item: unknown): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentWorkItemAssignmentDelete, { item }));
  }

  private async createTeam(input: CreateTeamInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.teamCreate, { input }));
  }

  private async updateTeam(input: UpdateTeamInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.teamUpdate, { input }));
  }

  private async reorderTeams(input: ReorderTeamsInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.teamReorder, { input }));
  }

  private async closeTeam(teamId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.teamDelete, { teamId }));
  }

  private async disconnectTeam(teamId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.teamDisconnect, { teamId }));
  }

  private async selectTeam(teamId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.teamSelect, { teamId }));
  }

  private async getBenchSnapshot(location?: BenchLocation): Promise<AppSnapshot> {
    if (isRemoteBenchLocation(location)) {
      return this.requireBackendClient().request<AppSnapshot>(backendMethods.snapshotBenchGet, { location });
    }
    return this.getSnapshot();
  }

  private async saveAgentToBench(agentId: string): Promise<AppSnapshot> {
    const location = this.benchLocationForAgent(agentId);
    const snapshot = await this.requireBackendClient().request<AppSnapshot>(backendMethods.benchAgentTemplateCreate, { agentId });
    if (isRemoteBenchLocation(location)) {
      return snapshot;
    }
    return this.adoptBackendSnapshot(snapshot);
  }

  private async deployBenchTemplate(templateId: string, teamId?: string, location?: BenchLocation): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.benchTemplateDeploy, {
      templateId,
      teamId,
      ...(location ? { location } : {}),
    }));
  }

  private async removeBenchTemplate(templateId: string, location?: BenchLocation): Promise<AppSnapshot> {
    const snapshot = await this.requireBackendClient().request<AppSnapshot>(backendMethods.benchTemplateDelete, {
      templateId,
      ...(location ? { location } : {}),
    });
    if (isRemoteBenchLocation(location)) {
      return snapshot;
    }
    return this.adoptBackendSnapshot(snapshot);
  }

  private benchLocationForAgent(agentId: string): BenchLocation | undefined {
    const agent = this.snapshot?.agents.find((candidate) => candidate.id === agentId) ?? null;
    const team = agent?.teamId
      ? this.snapshot?.teams.find((candidate) => candidate.id === agent.teamId) ?? null
      : null;
    return benchLocationForRemoteConnectionId(team?.remoteConnectionId);
  }

  private async updateSettings(input: UpdateSettingsInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.settingsUpdate, { input }));
  }

  private async getDaemonStatus(): Promise<ClawdDaemonStatus> {
    return getClawdDaemonStatus();
  }

  private async setDaemonEnabled(enabled: boolean): Promise<ClawdDaemonStatus> {
    return setClawdDaemonEnabled(enabled);
  }

  private restartApp(): void {
    this.appLifecycle.relaunch();
    this.appLifecycle.exit(0);
  }

  private async getLoopSnapshot(location?: LoopLocation): Promise<AppSnapshot> {
    if (isRemoteLoopLocation(location)) {
      return this.requireBackendClient().request<AppSnapshot>(backendMethods.snapshotLoopsGet, { location });
    }
    return this.getSnapshot();
  }

  private async createLoop(input: CreateLoopInput, location?: LoopLocation): Promise<AppSnapshot> {
    return this.adoptLoopSnapshot(location, await this.requireBackendClient().request<AppSnapshot>(backendMethods.loopCreate, {
      input,
      ...(location ? { location } : {}),
    }));
  }

  private async updateLoop(input: UpdateLoopInput, location?: LoopLocation): Promise<AppSnapshot> {
    return this.adoptLoopSnapshot(location, await this.requireBackendClient().request<AppSnapshot>(backendMethods.loopUpdate, {
      input,
      ...(location ? { location } : {}),
    }));
  }

  private async runLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot> {
    return this.adoptLoopSnapshot(location, await this.requireBackendClient().request<AppSnapshot>(backendMethods.loopRun, {
      loopId,
      ...(location ? { location } : {}),
    }));
  }

  private async clearLoopHistory(loopId: string, location?: LoopLocation): Promise<AppSnapshot> {
    return this.adoptLoopSnapshot(location, await this.requireBackendClient().request<AppSnapshot>(backendMethods.loopHistoryClear, {
      loopId,
      ...(location ? { location } : {}),
    }));
  }

  private async deleteLoopExecution(loopId: string, executionId: string, location?: LoopLocation): Promise<AppSnapshot> {
    return this.adoptLoopSnapshot(location, await this.requireBackendClient().request<AppSnapshot>(backendMethods.loopExecutionDelete, {
      loopId,
      executionId,
      ...(location ? { location } : {}),
    }));
  }

  private async deleteLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot> {
    return this.adoptLoopSnapshot(location, await this.requireBackendClient().request<AppSnapshot>(backendMethods.loopDelete, {
      loopId,
      ...(location ? { location } : {}),
    }));
  }

  private async adoptLoopSnapshot(location: LoopLocation | undefined, snapshot: AppSnapshot): Promise<AppSnapshot> {
    if (isRemoteLoopLocation(location)) {
      return snapshot;
    }
    return this.adoptBackendSnapshot(snapshot);
  }

  private async adoptBackendSnapshot(snapshot: AppSnapshot): Promise<AppSnapshot> {
    this.snapshot = snapshot;
    await this.refreshClientStateFromBackend();
    return snapshot;
  }

  private async getSnapshot(): Promise<AppSnapshot> {
    if (this.backendClient) {
      await this.refreshSnapshotFromBackend();
    }
    if (!this.snapshot) {
      throw new Error('clawd snapshot is not available.');
    }
    return this.snapshot;
  }

  private async sendPrompt(
    agentId: string,
    prompt: string,
    options?: SendPromptOptions,
  ): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentPromptSend, { agentId, prompt, options }));
  }

  private async restartAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentRestart, { agentId }));
  }

  private async hydrateAgentHistory(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentHistoryHydrate, { agentId }));
  }

  private async listAgentConversations(agentId: string): Promise<ConversationSummary[]> {
    return this.requireBackendClient().request(backendMethods.agentConversationsList, { agentId });
  }

  private async resumeAgentConversation(agentId: string, ref: unknown): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentConversationResume, { agentId, ref }));
  }

  private async readConversationMessages(ref: unknown, agentId: string, location?: LoopLocation): Promise<RendererMessage[]> {
    return this.requireBackendClient().request(backendMethods.agentConversationMessagesGet, {
      ref,
      agentId,
      ...(location ? { location } : {}),
    });
  }

  private async setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentGoalUpdate, { agentId, objective }));
  }

  private async clearAgentGoal(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentGoalClear, { agentId }));
  }

  private async setAgentApprovalPreset(agentId: string, preset: ApprovalPreset): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentApprovalPresetUpdate, { agentId, preset }));
  }

  private async listBackendModels(agentId: string): Promise<BackendModelOption[]> {
    return this.requireBackendClient().request(backendMethods.agentModelsList, { agentId });
  }

  private async listBackendSkills(agentId: string): Promise<BackendSkillSummary[]> {
    return this.requireBackendClient().request(backendMethods.agentSkillsList, { agentId });
  }

  private async listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]> {
    return this.requireBackendClient().request(backendMethods.agentFilesList, {
      agentId,
    });
  }

  private async previewAgentFile(agentId: string, filePath: string): Promise<AgentFilePreviewResult> {
    return this.requireBackendClient().request(backendMethods.agentFilePreview, {
      agentId,
      filePath,
    });
  }

  private async openAgentGitDiff(agentId: string): Promise<void> {
    await this.requireBackendClient().request(backendMethods.agentGitDiffOpen, { agentId });
  }

  private async steerPrompt(agentId: string, prompt: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentPromptSteer, { agentId, prompt }));
  }

  private async interruptAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentInterrupt, { agentId }));
  }

  private async deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentMessageDelete, { agentId, messageId }));
  }

  private async editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentMessageUpdate, { agentId, messageId, prompt }));
  }

  private async retryMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentMessageRetry, { agentId, messageId }));
  }

  private async chooseAgentFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select agent folder',
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  private async chooseSourceFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select source folder',
      message: 'Select your source folder containing git repositories',
      defaultPath: this.clientState.sourceFolderPath || undefined,
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  private async chooseSourceWorktreeDestination(defaultPath: string): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: 'Choose worktree folder',
      message: 'Choose location for the worktree',
      defaultPath,
      properties: ['createDirectory'],
    });

    return result.canceled ? null : result.filePath ?? null;
  }

  private async listSourceRepositories(remoteConnectionId?: string): Promise<SourceRepository[]> {
    return this.requireBackendClient().request(backendMethods.sourceRepositoriesList, remoteConnectionId ? { remoteConnectionId } : undefined);
  }

  private async listSourceFolders(input?: SourceFolderListInput): Promise<SourceFolderListing> {
    return this.requireBackendClient().request(backendMethods.sourceFoldersList, input);
  }

  private async listSourceWorktrees(repoPath: string, remoteConnectionId?: string): Promise<SourceWorktree[]> {
    return this.requireBackendClient().request(backendMethods.sourceWorktreesList, {
      repoPath,
      ...(remoteConnectionId ? { remoteConnectionId } : {}),
    });
  }

  private async suggestSourceWorktreePath(input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>): Promise<string> {
    return this.requireBackendClient().request(backendMethods.sourceWorktreePathSuggest, { input });
  }

  private async createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    return this.requireBackendClient().request<SourceWorktree>(backendMethods.sourceWorktreeCreate, {
      input,
    });
  }

  private async transcribeAppleSpeech(
    audioData: ArrayBuffer,
    options?: AppleSpeechTranscriptionOptions,
  ): Promise<AppleSpeechTranscriptionResult> {
    return this.requireBackendClient().request(backendMethods.transcriptionAppleSpeechCreate, {
      audioBase64: Buffer.from(audioData).toString('base64'),
      options,
    });
  }

  private async getSystemPermissions(): Promise<SystemPermissionsStatus> {
    return this.requireBackendClient().request(backendMethods.systemPermissionsGet);
  }

  private async openAccessibilitySettings(): Promise<SystemPermissionsStatus> {
    return this.requireBackendClient().request(backendMethods.systemPermissionsAccessibilityOpen);
  }

  private async refreshSnapshotFromBackend(): Promise<void> {
    const backendState = await this.requireBackendClient().request<unknown>(backendMethods.snapshotGet);
    if (isClawSnapshotGetResult(backendState)) {
      this.snapshot = backendState.snapshot;
      this.clientState = backendState.clientState;
      this.seq = Math.max(this.seq, backendState.lastEventSeq);
      this.syncPowerSaveBlocker();
    }
  }

  private async refreshClientStateFromBackend(): Promise<void> {
    this.clientState = await this.requireBackendClient().request<ClientState>(backendMethods.clientStateGet);
    this.syncPowerSaveBlocker();
  }

  private requireBackendClient(): ClawBackendClientPort {
    if (!this.backendClient) {
      throw new Error('clawd backend is not connected.');
    }
    return this.backendClient;
  }

  private async respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.clientRequestRespond, { response }));
  }

  private emitBackendEvent(event: ClawBackendEvent): void {
    const rendererEvent = eventForRenderer(event);
    if (isAppSnapshot(event.snapshot)) {
      this.snapshot = event.snapshot;
    }
    if (isClientState(event.clientState)) {
      this.clientState = event.clientState;
    }

    this.seq = Math.max(this.seq, rendererEvent.seq);
    this.syncPowerSaveBlocker();
    this.mainWindow?.webContents.send(ipcChannels.event, rendererEvent);
  }

  private syncPowerSaveBlocker(): void {
    this.powerSaveBlocker.sync(this.clientState.shouldPreventDisplaySleep);
  }

}

export function startMainApp(): void {
  const controller = new AppController(null, createRuntimeClawBackendClient(), app, ensureCurrentClawdDaemonForStartup);
  controller.registerIpcHandlers();

  void app.whenReady().then(async () => {
    await controller.initialize();
    controller.createWindow();
  });

  app.on('before-quit', () => {
    void controller.shutdown();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      controller.createWindow();
    }
  });
}

function createEmptyClientState(): ClientState {
  return {
    sourceFolderPath: '',
    shouldPreventDisplaySleep: false,
  };
}

function isRemoteLoopLocation(location: LoopLocation | undefined): location is Extract<LoopLocation, { kind: 'remote' }> {
  return location?.kind === 'remote' && location.remoteConnectionId.trim().length > 0;
}

function isRemoteBenchLocation(location: BenchLocation | undefined): location is Extract<BenchLocation, { kind: 'remote' }> {
  return location?.kind === 'remote' && location.remoteConnectionId.trim().length > 0;
}

function benchLocationForRemoteConnectionId(remoteConnectionId: string | undefined): BenchLocation | undefined {
  const normalized = remoteConnectionId?.trim() ?? '';
  return normalized ? { kind: 'remote', remoteConnectionId: normalized } : { kind: 'local' };
}

function eventForRenderer(event: ClawBackendEvent): MainToRendererEvent {
  return event;
}
