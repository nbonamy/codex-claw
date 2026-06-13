import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { AgentActivityPowerSaveBlocker } from './agent-activity-power-save-blocker';
import { logMain, warnMain } from './log';
import { createMainWindow } from './main-window';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';
import { createRuntimeClawBackendClient, type ClawBackendProcessClient } from './backend-process-client';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import type { AgentFilePreviewResult, AgentFileSearchItem, AppleSpeechTranscriptionOptions, AppleSpeechTranscriptionResult, ApprovalPreset, AppSnapshot, BackendConversationRef, BackendModelOption, BackendSkillSummary, ClientRequestResponse, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SourceRepository, SourceWorktree, SystemPermissionsStatus, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { ipcChannels } from '@codex-claw/shared/ipc';

type ClawBackendClientPort = Pick<ClawBackendProcessClient, 'start' | 'health' | 'request' | 'onEvent' | 'close'>;

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private snapshot = createEmptySnapshot();
  private backendClientEventUnsubscribe: (() => void) | null = null;
  private seq = 0;

  private readonly powerSaveBlocker = new AgentActivityPowerSaveBlocker();
  private readonly backendClient: ClawBackendClientPort | null;

  constructor(
    initialSnapshot: AppSnapshot = createEmptySnapshot(),
    backendClient: ClawBackendClientPort | null = createRuntimeClawBackendClient(),
  ) {
    this.snapshot = initialSnapshot;
    this.backendClient = backendClient;
  }

  async initialize(): Promise<void> {
    await this.initializeBackendClient();
    this.syncPowerSaveBlocker();
  }

  registerIpcHandlers(): void {
    ipcMain.handle(ipcChannels.getSnapshot, () => this.getSnapshot());

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

    ipcMain.handle(ipcChannels.listWorkRepositories, async (_event, provider: WorkProviderKind) => {
      return this.listWorkRepositories(provider);
    });

    ipcMain.handle(ipcChannels.configureWorkBacklog, async (_event, input: WorkBacklogConfigurationInput) => {
      return this.configureWorkBacklog(input);
    });

    ipcMain.handle(ipcChannels.listWorkItems, async (_event, provider: WorkProviderKind, repositoryId: string) => {
      return this.listWorkItems(provider, repositoryId);
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

    ipcMain.handle(ipcChannels.listSourceRepositories, async () => {
      return this.listSourceRepositories();
    });

    ipcMain.handle(ipcChannels.chooseSourceWorktreeDestination, async (_event, repoPath: string, suggestedName: string) => {
      return this.chooseSourceWorktreeDestination(repoPath, suggestedName);
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

    ipcMain.handle(ipcChannels.selectTeam, async (_event, teamId: string) => {
      return this.selectTeam(teamId);
    });

    ipcMain.handle(ipcChannels.createLoop, async (_event, input: CreateLoopInput) => {
      return this.createLoop(input);
    });

    ipcMain.handle(ipcChannels.updateLoop, async (_event, input: UpdateLoopInput) => {
      return this.updateLoop(input);
    });

    ipcMain.handle(ipcChannels.runLoop, async (_event, loopId: string) => {
      return this.runLoop(loopId);
    });

    ipcMain.handle(ipcChannels.clearLoopHistory, async (_event, loopId: string) => {
      return this.clearLoopHistory(loopId);
    });

    ipcMain.handle(ipcChannels.deleteLoopExecution, async (_event, loopId: string, executionId: string) => {
      return this.deleteLoopExecution(loopId, executionId);
    });

    ipcMain.handle(ipcChannels.deleteLoop, async (_event, loopId: string) => {
      return this.deleteLoop(loopId);
    });

    ipcMain.handle(ipcChannels.listAgentConversations, async (_event, agentId: string) => {
      return this.listAgentConversations(agentId);
    });

    ipcMain.handle(ipcChannels.resumeAgentConversation, async (_event, agentId: string, ref: unknown) => {
      return this.resumeAgentConversation(agentId, ref);
    });

    ipcMain.handle(ipcChannels.readConversationMessages, async (_event, ref: unknown, agentId: string) => {
      return this.readConversationMessages(ref, agentId);
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

    ipcMain.handle(ipcChannels.deployBenchTemplate, async (_event, templateId: string, teamId?: string) => {
      return this.deployBenchTemplate(templateId, teamId);
    });

    ipcMain.handle(ipcChannels.removeBenchTemplate, async (_event, templateId: string) => {
      return this.removeBenchTemplate(templateId);
    });

    ipcMain.handle(ipcChannels.restartAgent, async (_event, agentId: string) => {
      return this.restartAgent(agentId);
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

    ipcMain.handle(ipcChannels.getSystemPermissions, () => this.getSystemPermissions());

    ipcMain.handle(ipcChannels.openAccessibilitySettings, () => this.openAccessibilitySettings());

    ipcMain.handle(ipcChannels.transcribeAppleSpeech, async (_event, audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions) => {
      return this.transcribeAppleSpeech(audioData, options);
    });

    ipcMain.handle(ipcChannels.quit, () => {
      app.quit();
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
      await this.refreshSnapshotFromBackend();
      this.backendClientEventUnsubscribe = this.backendClient.onEvent((event) => this.emitBackendEvent(event));
      logMain('clawd', 'connected to backend process', { version: health.version, pid: health.pid });
    } catch (error) {
      warnMain('clawd', 'failed to connect to backend process', {
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async connectWorkProvider(provider: WorkProviderKind): Promise<WorkProviderConnectResult> {
    const result = await this.requireBackendClient().request<WorkProviderConnectResult>('workProvider/connect', { provider });
    this.snapshot = result.snapshot;
    this.syncPowerSaveBlocker();
    return result;
  }

  private async openWorkProviderAuthorization(provider: WorkProviderKind): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('workProvider/openAuthorization', { provider }));
  }

  private async completeWorkProviderConnection(provider: WorkProviderKind): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('workProvider/completeConnection', { provider }));
  }

  private async disconnectWorkProvider(provider: WorkProviderKind): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('workProvider/disconnect', { provider }));
  }

  private async listWorkRepositories(provider: WorkProviderKind): Promise<WorkRepository[]> {
    return this.requireBackendClient().request('workProvider/listRepositories', { provider });
  }

  private async configureWorkBacklog(input: WorkBacklogConfigurationInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('workProvider/configureBacklog', { input }));
  }

  private async listWorkItems(provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]> {
    return this.requireBackendClient().request('workProvider/listItems', { provider, repositoryId });
  }

  private async createAgent(input: CreateAgentInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/create', { input }));
  }

  private async updateAgent(input: UpdateAgentInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/update', { input }));
  }

  private async duplicateAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/duplicate', { agentId }));
  }

  private async moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/moveToTeam', { input }));
  }

  private async reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/reorder', { input }));
  }

  private async closeAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/close', { agentId }));
  }

  private async selectAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/select', { agentId }));
  }

  private async updateAgentFolder(agentId: string, folder: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/updateFolder', { agentId, folder }));
  }

  private async assignWorkItemToAgent(agentId: string, item: unknown): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/assignWorkItem', { agentId, item }));
  }

  private async removeWorkItemAssignment(item: unknown): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/removeWorkItemAssignment', { item }));
  }

  private async createTeam(input: CreateTeamInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('team/create', { input }));
  }

  private async updateTeam(input: UpdateTeamInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('team/update', { input }));
  }

  private async reorderTeams(input: ReorderTeamsInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('team/reorder', { input }));
  }

  private async closeTeam(teamId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('team/close', { teamId }));
  }

  private async selectTeam(teamId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('team/select', { teamId }));
  }

  private async saveAgentToBench(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('bench/saveAgent', { agentId }));
  }

  private async deployBenchTemplate(templateId: string, teamId?: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('bench/deployTemplate', { templateId, teamId }));
  }

  private async removeBenchTemplate(templateId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('bench/removeTemplate', { templateId }));
  }

  private async updateSettings(input: UpdateSettingsInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('settings/update', { input }));
  }

  private async createLoop(input: CreateLoopInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('loop/create', { input }));
  }

  private async updateLoop(input: UpdateLoopInput): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('loop/update', { input }));
  }

  private async runLoop(loopId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('loop/run', { loopId }));
  }

  private async clearLoopHistory(loopId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('loop/history/clear', { loopId }));
  }

  private async deleteLoopExecution(loopId: string, executionId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('loop/execution/delete', { loopId, executionId }));
  }

  private async deleteLoop(loopId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('loop/delete', { loopId }));
  }

  private adoptBackendSnapshot(snapshot: AppSnapshot): AppSnapshot {
    this.snapshot = snapshot;
    this.syncPowerSaveBlocker();
    return this.snapshot;
  }

  private async getSnapshot(): Promise<AppSnapshot> {
    if (this.backendClient) {
      await this.refreshSnapshotFromBackend();
    }
    return this.snapshot;
  }

  private async sendPrompt(
    agentId: string,
    prompt: string,
    options?: SendPromptOptions,
  ): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/sendPrompt', { agentId, prompt, options }));
  }

  private async restartAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/restart', { agentId }));
  }

  private async listAgentConversations(agentId: string): Promise<ConversationSummary[]> {
    return this.requireBackendClient().request('agent/listConversations', { agentId });
  }

  private async resumeAgentConversation(agentId: string, ref: unknown): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/resumeConversation', { agentId, ref }));
  }

  private async readConversationMessages(ref: unknown, agentId: string): Promise<RendererMessage[]> {
    return this.requireBackendClient().request('agent/readConversationMessages', { ref, agentId });
  }

  private async setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/setGoal', { agentId, objective }));
  }

  private async clearAgentGoal(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/clearGoal', { agentId }));
  }

  private async setAgentApprovalPreset(agentId: string, preset: ApprovalPreset): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/setApprovalPreset', { agentId, preset }));
  }

  private async listBackendModels(agentId: string): Promise<BackendModelOption[]> {
    return this.requireBackendClient().request('agent/listModels', { agentId });
  }

  private async listBackendSkills(agentId: string): Promise<BackendSkillSummary[]> {
    return this.requireBackendClient().request('agent/listSkills', { agentId });
  }

  private async listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]> {
    return this.requireBackendClient().request('agent/listFiles', {
      agentId,
    });
  }

  private async previewAgentFile(agentId: string, filePath: string): Promise<AgentFilePreviewResult> {
    return this.requireBackendClient().request('agent/previewFile', {
      agentId,
      filePath,
    });
  }

  private async openAgentGitDiff(agentId: string): Promise<void> {
    await this.requireBackendClient().request('agent/openGitDiff', { agentId });
  }

  private async steerPrompt(agentId: string, prompt: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/steer', { agentId, prompt }));
  }

  private async interruptAgent(agentId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/interrupt', { agentId }));
  }

  private async deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/deleteMessage', { agentId, messageId }));
  }

  private async editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/editMessage', { agentId, messageId, prompt }));
  }

  private async retryMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('agent/retryMessage', { agentId, messageId }));
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
      defaultPath: this.snapshot.sourceFolder.path || undefined,
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  private async chooseSourceWorktreeDestination(repoPath: string, suggestedName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: 'Choose worktree folder',
      message: 'Choose location for the worktree',
      defaultPath: path.join(path.dirname(repoPath), suggestedName),
      properties: ['createDirectory'],
    });

    return result.canceled ? null : result.filePath ?? null;
  }

  private async listSourceRepositories(): Promise<SourceRepository[]> {
    return this.requireBackendClient().request('source/listRepositories');
  }

  private async createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    return this.requireBackendClient().request<SourceWorktree>('source/createWorktree', {
      input,
    });
  }

  private async transcribeAppleSpeech(
    audioData: ArrayBuffer,
    options?: AppleSpeechTranscriptionOptions,
  ): Promise<AppleSpeechTranscriptionResult> {
    return this.requireBackendClient().request('transcription/appleSpeech', {
      audioBase64: Buffer.from(audioData).toString('base64'),
      options,
    });
  }

  private async getSystemPermissions(): Promise<SystemPermissionsStatus> {
    return this.requireBackendClient().request('system/getPermissions');
  }

  private async openAccessibilitySettings(): Promise<SystemPermissionsStatus> {
    return this.requireBackendClient().request('system/openAccessibilitySettings');
  }

  private async refreshSnapshotFromBackend(): Promise<void> {
    const backendState = await this.requireBackendClient().request<unknown>('snapshot/get');
    if (isBackendSnapshotState(backendState)) {
      this.snapshot = backendState.snapshot;
      this.seq = Math.max(this.seq, backendState.lastEventSeq);
      this.syncPowerSaveBlocker();
    }
  }

  private requireBackendClient(): ClawBackendClientPort {
    if (!this.backendClient) {
      throw new Error('clawd backend is not connected.');
    }
    return this.backendClient;
  }

  private async respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>('clientRequest/respond', { response }));
  }

  private emitBackendEvent(event: ClawBackendEvent): void {
    const rendererEvent = eventForRenderer(event);
    const eventSnapshot = snapshotFromBackendEvent(event);
    if (eventSnapshot) {
      this.snapshot = eventSnapshot;
    }

    this.seq = Math.max(this.seq, rendererEvent.seq);
    this.syncPowerSaveBlocker();
    this.mainWindow?.webContents.send(ipcChannels.event, rendererEvent);
  }

  private syncPowerSaveBlocker(): void {
    this.powerSaveBlocker.sync(this.snapshot);
  }

}

export function startMainApp(): void {
  const controller = new AppController();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBackendSnapshotState(value: unknown): value is { snapshot: AppSnapshot; lastEventSeq: number } {
  return isRecord(value) && isRecord(value.snapshot) && typeof value.lastEventSeq === 'number';
}

function isAppSnapshot(value: unknown): value is AppSnapshot {
  return isRecord(value) && Array.isArray(value.teams) && Array.isArray(value.agents);
}

function eventForRenderer(event: ClawBackendEvent): MainToRendererEvent {
  const { snapshot: _snapshot, ...rendererEvent } = event;
  return rendererEvent;
}

function snapshotFromBackendEvent(event: ClawBackendEvent): AppSnapshot | null {
  if (isAppSnapshot(event.snapshot)) {
    return event.snapshot;
  }

  if (event.type === 'snapshot.updated' && isAppSnapshot(event.payload)) {
    return event.payload;
  }

  return null;
}
