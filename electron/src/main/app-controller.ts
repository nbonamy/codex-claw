import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { AgentActivityPowerSaveBlocker } from './agent-activity-power-save-blocker';
import { sendAgentPrompt, type SendAgentPromptHooks } from '@codex-claw/shared/agent-chat-service';
import { ClawBackendProxyDriver } from './backend-proxy-driver';
import { logMain, warnMain } from './log';
import { createMainWindow } from './main-window';
import { getSystemPermissionsStatus, openAccessibilitySettings } from './system-permissions';
import {
  assignWorkItemToAgentInSnapshot,
  closeAgentInSnapshot,
  duplicateAgentInSnapshot,
  moveAgentToTeamInSnapshot,
  removeWorkItemAssignmentFromSnapshot,
  reorderAgentInTeam,
  restartAgentConversation,
  resumeAgentConversationInSnapshot,
} from '@codex-claw/shared/agent-manager';
import {
  applyMainEventToSnapshot,
  createAgentInSnapshot,
  createEmptySnapshot,
  selectAgent,
  updateAgentFromInput,
  updateAgentFolder,
} from './snapshot-service';
import { AppStatePersistence } from '@codex-claw/shared/state-persistence';
import { createRuntimeClawBackendClient, type ClawBackendProcessClient } from './backend-process-client';
import type { Agent, AgentBackend, AgentFileReadResult, AgentFileSearchItem, AppleSpeechTranscriptionOptions, AppleSpeechTranscriptionResult, ApprovalPreset, AppSnapshot, BackendConversationRef, BackendModelOption, BackendSkillSummary, ClientRequest, ClientRequestResponse, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SourceRepository, SourceWorktree, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { approvalBackendDefaultsWithPreset, isApprovalPreset } from '@codex-claw/shared/approval-presets';
import { ipcChannels } from '@codex-claw/shared/ipc';
import { sanitizeWorkItemAssignmentSource } from '@codex-claw/shared/work-assignments';
import type { AgentBackendDriver, BackendSendResult } from './backends/types';
import { backendDisplayName, unsupportedBackendFeature } from './backends/types';
import { formatConversationTitle } from '@codex-claw/shared/conversation-title';
import { defaultUserDataPath } from './user-data';

type ClawBackendClientPort = Pick<ClawBackendProcessClient, 'start' | 'health' | 'request' | 'onEvent' | 'close'>;

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private snapshot = createEmptySnapshot();
  private readonly persistence: AppStatePersistence;
  private readonly backendDrivers = new Map<AgentBackend, AgentBackendDriver>();
  private readonly backendDriverEventUnsubscribes = new Map<AgentBackend, () => void>();
  private backendClientEventUnsubscribe: (() => void) | null = null;
  private readonly clientRequestBackends = new Map<string, AgentBackend>();
  private seq = 0;

  private readonly powerSaveBlocker = new AgentActivityPowerSaveBlocker();
  private readonly backendClient: ClawBackendClientPort | null;

  constructor(
    persistence = new AppStatePersistence(path.join(defaultUserDataPath(), 'state.json')),
    _workIntegrations?: unknown,
    backendClient: ClawBackendClientPort | null = createRuntimeClawBackendClient(),
  ) {
    this.persistence = persistence;
    this.backendClient = backendClient;
  }

  async initialize(): Promise<void> {
    this.snapshot = await this.persistence.load();
    await this.initializeBackendClient();
    await this.initializeSourceFolderIfNeeded();
    this.syncPowerSaveBlocker();
  }

  registerIpcHandlers(): void {
    ipcMain.handle(ipcChannels.getSnapshot, () => this.snapshot);

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

    ipcMain.handle(ipcChannels.readAgentFile, async (_event, agentId: string, filePath: string) => {
      return this.readAgentFile(agentId, filePath);
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
      await this.validateAgentInput(input);
      createAgentInSnapshot(this.snapshot, input);
      await this.persistSnapshot();
      if (this.snapshot.activeAgentId) {
        await this.refreshAgentGitStatus(this.snapshot.activeAgentId);
      }
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.updateAgent, async (_event, input: UpdateAgentInput) => {
      await this.validateAgentInput(input);
      const agent = updateAgentFromInput(this.snapshot, input);
      if (!agent) {
        throw new Error(`Agent not found: ${input.id}`);
      }
      await this.persistSnapshot();
      await this.refreshAgentGitStatus(agent.id);
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.assignWorkItemToAgent, async (_event, agentId: string, item: unknown) => {
      const assignmentSource = sanitizeWorkItemAssignmentSource(item);
      if (!assignmentSource) {
        throw new Error('Invalid work item assignment.');
      }

      const agent = assignWorkItemToAgentInSnapshot(this.snapshot, agentId, assignmentSource);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.removeWorkItemAssignment, async (_event, item: unknown) => {
      const assignmentSource = sanitizeWorkItemAssignmentSource(item);
      if (!assignmentSource) {
        throw new Error('Invalid work item assignment.');
      }

      if (removeWorkItemAssignmentFromSnapshot(this.snapshot, assignmentSource)) {
        await this.persistSnapshot();
      }
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.duplicateAgent, async (_event, agentId: string) => {
      const agent = duplicateAgentInSnapshot(this.snapshot, agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.moveAgentToTeam, async (_event, input: MoveAgentToTeamInput) => {
      const agent = moveAgentToTeamInSnapshot(this.snapshot, input.agentId, input.teamId);
      if (!agent) {
        throw new Error(`Agent or team not found: ${input.agentId} -> ${input.teamId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.reorderAgents, async (_event, input: ReorderAgentsInput) => {
      const agent = reorderAgentInTeam(this.snapshot, input.teamId, input.agentId, input.beforeAgentId);
      if (!agent) {
        throw new Error(`Agent reorder target not found: ${input.agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
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
      const agent = closeAgentInSnapshot(this.snapshot, agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.selectAgent, async (_event, agentId: string) => {
      const snapshot = selectAgent(this.snapshot, agentId);
      await this.persistSnapshot();
      await this.hydrateAgentHistory(agentId);
      await this.refreshAgentGitStatus(agentId);
      return snapshot;
    });

    ipcMain.handle(ipcChannels.selectAgentFolder, async (_event, agentId: string) => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select agent folder',
      });

      if (result.canceled || !result.filePaths[0]) {
        return null;
      }

      updateAgentFolder(this.snapshot, agentId, result.filePaths[0]);
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.updateSettings, async (_event, input: UpdateSettingsInput) => {
      return this.updateSettings(input);
    });

    ipcMain.handle(ipcChannels.getSystemPermissions, () => getSystemPermissionsStatus());

    ipcMain.handle(ipcChannels.openAccessibilitySettings, () => openAccessibilitySettings());

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
      const backend = this.clientRequestBackends.get(response.id);
      if (!backend) {
        throw new Error(`No backend owns client request '${response.id}'.`);
      }

      await (await this.getBackendDriver(backend)).respondToRequest(response);
      this.clientRequestBackends.delete(response.id);
      return this.snapshot;
    });
  }

  createWindow(): void {
    this.mainWindow = createMainWindow();
  }

  async shutdown(): Promise<void> {
    this.powerSaveBlocker.stop();
    this.backendClientEventUnsubscribe?.();
    this.backendClientEventUnsubscribe = null;
    for (const unsubscribe of this.backendDriverEventUnsubscribes.values()) {
      unsubscribe();
    }
    this.backendDriverEventUnsubscribes.clear();
    await this.backendClient?.close();
    await Promise.all([...this.backendDrivers.values()].map((driver) => driver.close()));
  }

  private async initializeBackendClient(): Promise<void> {
    if (!this.backendClient) {
      return;
    }

    try {
      await this.backendClient.start();
      const health = await this.backendClient.health();
      const backendState = await this.backendClient.request<unknown>('snapshot/get');
      if (isBackendSnapshotState(backendState)) {
        this.snapshot = backendState.snapshot;
        this.seq = Math.max(this.seq, backendState.lastEventSeq);
      }
      this.backendClientEventUnsubscribe = this.backendClient.onEvent((event) => this.emitAndApply(event));
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

  private async sendPrompt(
    agentId: string,
    prompt: string,
    options?: SendPromptOptions,
    hooks?: SendAgentPromptHooks,
  ): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return this.snapshot;
    }

    const driver = await this.getBackendDriverForAgent(agent);
    return sendAgentPrompt(this.snapshot, driver, agentId, prompt, options, (event) => {
      this.emitAndApply(event);
    }, {
      ...hooks,
      onBackendSessionUpdated: async (result, wasNewSession) => {
        await hooks?.onBackendSessionUpdated?.(result, wasNewSession);
        await this.setNewConversationTitle(agent, driver, wasNewSession);
      },
    });
  }

  private async restartAgent(agentId: string): Promise<AppSnapshot> {
    const backend = this.snapshot.agents.find((candidate) => candidate.id === agentId)?.backend;
    const agent = restartAgentConversation(this.snapshot, agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (backend) {
      this.getExistingBackendDriver(backend)?.forgetAgentSession?.(agentId);
    }
    await this.persistSnapshot();
    return this.snapshot;
  }

  private async listAgentConversations(agentId: string): Promise<ConversationSummary[]> {
    if (typeof agentId !== 'string' || !agentId.trim()) {
      throw new Error('Invalid agent id.');
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const driver = await this.getBackendDriverForAgent(agent);
    return driver.listConversations ? driver.listConversations(agent) : [];
  }

  private async resumeAgentConversation(agentId: string, ref: unknown): Promise<AppSnapshot> {
    if (typeof agentId !== 'string' || !agentId.trim() || !isBackendConversationRef(ref)) {
      throw new Error('Invalid conversation reference.');
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    if (ref.backend !== agent.backend) {
      throw new Error('Conversation backend does not match the agent backend.');
    }
    if (agent.status.type !== 'idle') {
      throw new Error('Agent must be idle before resuming a conversation.');
    }

    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.resumeConversation) {
      throw new Error(`${backendDisplayName(agent.backend)} does not support conversation resume.`);
    }

    const result = await driver.resumeConversation(agent, ref);
    const resumedAgent = resumeAgentConversationInSnapshot(this.snapshot, agentId, result.backendSession, result.messages);
    if (!resumedAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    await this.persistSnapshot();
    return this.snapshot;
  }

  private async readConversationMessages(ref: unknown, agentId: string): Promise<RendererMessage[]> {
    if (!isBackendConversationRef(ref) || typeof agentId !== 'string' || !agentId.trim()) {
      throw new Error('Invalid conversation reference.');
    }
    if (!this.isStoredConversationRef(ref, agentId)) {
      throw new Error('Conversation reference is not available.');
    }

    const driver = await this.getBackendDriver(ref.backend);
    if (!driver.readConversationMessages) {
      throw new Error(`${backendDisplayName(ref.backend)} does not support conversation history.`);
    }
    return driver.readConversationMessages(ref, agentId);
  }

  private async setNewConversationTitle(agent: Agent, driver: AgentBackendDriver, wasNewSession: boolean): Promise<void> {
    if (!wasNewSession || !driver.setConversationTitle) {
      return;
    }

    try {
      await driver.setConversationTitle(agent, formatConversationTitle(agent));
    } catch (error) {
      warnMain('conversation-title', 'failed', {
        agentId: agent.id,
        backend: driver.backend,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    const trimmedObjective = objective.trim();
    if (!agent || !trimmedObjective) {
      return this.snapshot;
    }

    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.setGoal) {
      throw new Error(`${agent.backend} does not support goals.`);
    }

    const wasNewSession = !agent.backendSession;
    const result = await driver.setGoal(agent, trimmedObjective);
    agent.backendSession = result.backendSession;
    await this.setNewConversationTitle(agent, driver, wasNewSession);
    if (result.goal) {
      this.emitAndApply({
        agentId,
        threadId: result.goal.threadId,
        type: 'thread.goalUpdated',
        payload: { goal: result.goal },
      });
    }
    await this.persistSnapshot();

    return this.snapshot;
  }

  private async clearAgentGoal(agentId: string): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return this.snapshot;
    }

    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.clearGoal) {
      throw new Error(`${agent.backend} does not support goals.`);
    }

    const wasNewSession = !agent.backendSession;
    const result = await driver.clearGoal(agent);
    agent.backendSession = result.backendSession;
    await this.setNewConversationTitle(agent, driver, wasNewSession);
    if (result.cleared) {
      this.emitAndApply({
        agentId,
        threadId: result.backendSession.kind === 'codex' ? result.backendSession.threadId : undefined,
        type: 'thread.goalCleared',
        payload: {},
      });
    }
    await this.persistSnapshot();

    return this.snapshot;
  }

  private async setAgentApprovalPreset(agentId: string, preset: ApprovalPreset): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent || !isApprovalPreset(preset)) {
      return this.snapshot;
    }

    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.setApprovalPreset) {
      throw unsupportedBackendFeature(agent, 'approval presets');
    }

    const wasNewSession = !agent.backendSession;
    const result = await driver.setApprovalPreset(agent, preset);
    agent.backendSession = result.backendSession;
    await this.setNewConversationTitle(agent, driver, wasNewSession);
    agent.backendDefaults = approvalBackendDefaultsWithPreset(agent.backendDefaults, result.approvalPreset);
    await this.persistSnapshot();

    return this.snapshot;
  }

  private async listBackendModels(agentId: string): Promise<BackendModelOption[]> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.listModels) {
      return [];
    }

    return driver.listModels(agent);
  }

  private async listBackendSkills(agentId: string): Promise<BackendSkillSummary[]> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.listSkills) {
      return [];
    }

    return driver.listSkills(agent);
  }

  private async listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return this.requireBackendClient().request('agent/listFiles', {
      folder: agent.folder,
    });
  }

  private async readAgentFile(agentId: string, filePath: string): Promise<AgentFileReadResult> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return this.requireBackendClient().request('agent/readFile', {
      folder: agent.folder,
      filePath,
    });
  }

  private async openAgentGitDiff(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const driver = await this.getBackendDriverForAgent(agent);
    const title = 'Git Diff';
    const subtitle = agent.folder;

    if (!driver.getGitDiff) {
      this.emitAndApply({
        agentId,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          title,
          subtitle,
          diff: '',
          state: 'error',
          error: unsupportedBackendFeature(agent, 'git diff preview').message,
        },
      });
      return;
    }

    try {
      const diff = await driver.getGitDiff(agent);
      this.emitAndApply({
        agentId,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          title,
          subtitle,
          diff: diff ?? '',
        },
      });
    } catch (error) {
      this.emitAndApply({
        agentId,
        type: 'sidePanel.gitDiffRequested',
        payload: {
          kind: 'gitDiff',
          title,
          subtitle,
          diff: '',
          state: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private isStoredConversationRef(ref: BackendConversationRef, agentId: string): boolean {
    return this.snapshot.loops.some((loop) => loop.executionLog.some((entry) => (
      entry.createdAgents.some((createdAgent) => (
        createdAgent.agentId === agentId &&
        (createdAgent.conversationRef ? sameConversationRef(createdAgent.conversationRef, ref) : false)
      ))
    )));
  }

  private async steerPrompt(agentId: string, prompt: string): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    const trimmedPrompt = prompt.trim();
    if (!agent || !trimmedPrompt) {
      return this.snapshot;
    }

    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.steerPrompt) {
      throw unsupportedBackendFeature(agent, 'active-turn steering');
    }

    const result = await driver.steerPrompt(agent, trimmedPrompt);
    agent.backendSession = result.backendSession;
    this.emitAndApply({
      agentId,
      ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
      turnId: result.turnId,
      type: 'message.steer',
      payload: {
        prompt: trimmedPrompt,
      },
    });
    return this.snapshot;
  }

  private async interruptAgent(agentId: string): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return this.snapshot;
    }

    logMain('agent-interrupt', 'requested', {
      agentId,
      status: agent.status.type,
    });

    try {
      const driver = await this.getBackendDriverForAgent(agent);
      const result = await driver.interrupt(agent);
      agent.backendSession = result.backendSession;
      logMain('agent-interrupt', 'acknowledged', { agentId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnMain('agent-interrupt', 'failed', {
        agentId,
        error: message,
      });
      this.emitAndApply({
        agentId,
        type: 'error',
        payload: { message: `Failed to interrupt ${backendDisplayName(agent.backend)}: ${message}` },
      });
    }

    return this.snapshot;
  }

  private async deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    const action = this.resolveMessageAction(agentId, messageId);
    if (!action) {
      return this.snapshot;
    }

    await this.rollbackAgentToTurn(action.agent, action.turnId);
    await this.persistSnapshot();
    return this.snapshot;
  }

  private async editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot> {
    const trimmedPrompt = prompt.trim();
    const action = this.resolveMessageAction(agentId, messageId);
    if (!action || !trimmedPrompt) {
      return this.snapshot;
    }

    await this.rollbackAgentToTurn(action.agent, action.turnId);
    await this.persistSnapshot();
    return this.sendPrompt(agentId, trimmedPrompt);
  }

  private async retryMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    const action = this.resolveMessageAction(agentId, messageId);
    if (!action?.prompt) {
      return this.snapshot;
    }

    await this.rollbackAgentToTurn(action.agent, action.turnId);
    await this.persistSnapshot();
    return this.sendPrompt(agentId, action.prompt);
  }

  private async rollbackAgentToTurn(agent: Agent, turnId: string): Promise<void> {
    const driver = await this.getBackendDriverForAgent(agent);
    if (!driver.rollbackToTurn) {
      throw unsupportedBackendFeature(agent, 'message rollback');
    }

    const result = await driver.rollbackToTurn(agent, turnId);
    agent.backendSession = result.backendSession;
    this.emitAndApply({
      agentId: agent.id,
      ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
      type: 'thread.historyLoaded',
      payload: {
        messages: result.messages,
        replace: true,
      },
    });
    this.emitAndApply({
      agentId: agent.id,
      ...(result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {}),
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    });
  }

  private resolveMessageAction(agentId: string, messageId: string): { agent: Agent; message: RendererMessage; prompt: string | null; turnId: string } | null {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return null;
    }

    const messages = this.snapshot.messages.filter((message) => message.agentId === agentId);
    const index = messages.findIndex((message) => message.id === messageId);
    const message = messages[index];
    if (index === -1 || !message) {
      return null;
    }

    const turnId = this.resolveMessageTurnId(messages, index);
    if (!turnId) {
      return null;
    }

    return {
      agent,
      message,
      prompt: this.promptForMessageRetry(messages, index, turnId),
      turnId,
    };
  }

  private resolveMessageTurnId(messages: RendererMessage[], index: number): string | null {
    const message = messages[index];
    if (!message) {
      return null;
    }

    if (message.turnId) {
      return message.turnId;
    }

    const idTurnId = turnIdFromRendererMessageId(message.id);
    if (idTurnId) {
      return idTurnId;
    }

    if (message.role === 'user') {
      for (let offset = index + 1; offset < messages.length; offset += 1) {
        const candidate = messages[offset];
        if (candidate?.role === 'user') {
          break;
        }
        const candidateTurnId = candidate ? candidate.turnId ?? turnIdFromRendererMessageId(candidate.id) : null;
        if (candidateTurnId) {
          return candidateTurnId;
        }
      }
    }

    return null;
  }

  private promptForMessageRetry(messages: RendererMessage[], index: number, turnId: string): string | null {
    const message = messages[index];
    if (!message) {
      return null;
    }

    if (message.role === 'user') {
      return rendererMessageText(message);
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
      const candidate = messages[offset];
      if (!candidate || candidate.role !== 'user') {
        continue;
      }
      const candidateTurnId = candidate.turnId ?? this.resolveMessageTurnId(messages, offset);
      if (candidateTurnId === turnId) {
        return rendererMessageText(candidate);
      }
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
      const candidate = messages[offset];
      if (candidate?.role === 'user') {
        return rendererMessageText(candidate);
      }
    }

    return null;
  }

  private async hydrateAgentHistory(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent?.backendSession) {
      return;
    }

    try {
      const driver = await this.getBackendDriverForAgent(agent);
      if (!driver.hydrateAgent) {
        return;
      }

      const backendSession = await driver.hydrateAgent(agent);
      if (backendSession) {
        agent.backendSession = backendSession;
      }
    } catch (error) {
      warnMain('backend-history', 'failed to hydrate persisted session', {
        agentId,
        backend: agent.backend,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

  private async initializeSourceFolderIfNeeded(): Promise<void> {
    if (this.snapshot.sourceFolder.initialized) {
      return;
    }

    const detected = this.backendClient
      ? await this.backendClient.request<string>('source/detectFolder')
      : '';
    this.snapshot.sourceFolder = {
      ...this.snapshot.sourceFolder,
      path: detected,
      initialized: true,
    };
    await this.persistSnapshot();
  }

  private async listSourceRepositories(): Promise<SourceRepository[]> {
    const sourceFolder = this.snapshot.sourceFolder.path.trim();
    if (!sourceFolder) {
      return [];
    }
    return this.requireBackendClient().request('source/listRepositories', {
      sourceFolderPath: sourceFolder,
    });
  }

  private async createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
    const worktree = await this.requireBackendClient().request<SourceWorktree>('source/createWorktree', {
      input,
    });
    await this.addRecentSourceRepositoryByPath(input.repoPath);
    await this.persistSnapshot();
    return worktree;
  }

  private async transcribeAppleSpeech(
    audioData: ArrayBuffer,
    options?: AppleSpeechTranscriptionOptions,
  ): Promise<AppleSpeechTranscriptionResult> {
    return this.requireBackendClient().request('transcription/appleSpeech', {
      audioBase64: Buffer.from(audioData).toString('base64'),
      options,
      assetsPath: appleSpeechAssetsPath(),
    });
  }

  private requireBackendClient(): ClawBackendClientPort {
    if (!this.backendClient) {
      throw new Error('clawd backend is not connected.');
    }
    return this.backendClient;
  }

  private async addRecentSourceRepositoryByPath(repoPath: string): Promise<void> {
    const repos = await this.listSourceRepositories();
    const repoName = repos.find((repo) => repo.path === repoPath)?.name ?? path.basename(repoPath);
    this.addRecentSourceRepository(repoName);
  }

  private addRecentSourceRepository(repoName: string): void {
    const trimmed = repoName.trim();
    if (!trimmed) {
      return;
    }
    const nextNames = this.snapshot.sourceFolder.recentRepoNames.filter((name) => name !== trimmed);
    nextNames.unshift(trimmed);
    this.snapshot.sourceFolder.recentRepoNames = nextNames.slice(0, 5);
  }

  private async validateAgentInput(input: Pick<CreateAgentInput, 'name' | 'folder'>): Promise<void> {
    if (!input.name.trim()) {
      throw new Error('Agent name is required.');
    }

    const folder = input.folder.trim();
    if (!folder) {
      throw new Error('Agent folder is required.');
    }

    await this.requireBackendClient().request('agent/validateFolder', { folder });
  }

  private async getBackendDriverForAgent(agent: Agent): Promise<AgentBackendDriver> {
    if (agent.backendSession && agent.backendSession.kind !== agent.backend) {
      throw new Error(`Agent '${agent.id}' has mismatched backend session '${agent.backendSession.kind}' for backend '${agent.backend}'.`);
    }

    return this.getBackendDriver(agent.backend);
  }

  private async getBackendDriver(backend: AgentBackend): Promise<AgentBackendDriver> {
    const existingDriver = this.backendDrivers.get(backend);
    if (existingDriver) {
      return existingDriver;
    }

    if (!this.backendClient) {
      throw new Error(`${backendDisplayName(backend)} backend is not connected.`);
    }

    const driver = new ClawBackendProxyDriver(backend, this.backendClient);
    this.backendDrivers.set(backend, driver);
    return driver;
  }

  private getExistingBackendDriver(backend: AgentBackend): AgentBackendDriver | null {
    return this.backendDrivers.get(backend) ?? null;
  }

  private emitAndApply(
    event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
  ): void {
    const fullEvent: MainToRendererEvent = {
      ...event,
      seq: event.seq ?? ++this.seq,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
    };
    if (!fullEvent.backend && fullEvent.agentId) {
      fullEvent.backend = this.snapshot.agents.find((agent) => agent.id === fullEvent.agentId)?.backend;
    }

    this.recordClientRequestOwner(fullEvent);
    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.syncPowerSaveBlocker();
    this.mainWindow?.webContents.send(ipcChannels.event, fullEvent);
    if (
      fullEvent.type === 'backend.statusChanged' ||
      fullEvent.type === 'agent.updated' ||
      fullEvent.type === 'snapshot.updated' ||
      fullEvent.type === 'account.rateLimitsUpdated' ||
      fullEvent.type === 'workBacklog.assignmentUpdated' ||
      fullEvent.type === 'thread.started' ||
      fullEvent.type === 'thread.settingsUpdated' ||
      fullEvent.type === 'thread.tokenUsageUpdated' ||
      fullEvent.type === 'turn.planUpdated' ||
      fullEvent.type === 'turn.proposedPlanCompleted' ||
      this.eventCompletesSavedPlan(fullEvent)
    ) {
      void this.persistSnapshot().catch((error: unknown) => {
        warnMain('state', 'failed to persist snapshot event', {
          error: error instanceof Error ? error.message : String(error),
          eventType: fullEvent.type,
        });
      });
    }

    if (
      fullEvent.type === 'turn.planUpdated' ||
      fullEvent.type === 'turn.proposedPlanCompleted'
    ) {
      this.promptPlanPreview(fullEvent);
    }

    if (fullEvent.type === 'diff.updated') {
      this.promptGitDiffPreview(fullEvent);
    }

    if (fullEvent.type === 'turn.completed' && fullEvent.agentId) {
      this.promptPlanPreview(fullEvent);
    }

    if (
      fullEvent.agentId &&
      (fullEvent.type === 'turn.started' || fullEvent.type === 'diff.updated' || fullEvent.type === 'turn.completed')
    ) {
      void this.refreshAgentGitStatus(fullEvent.agentId).catch((error: unknown) => {
        warnMain('git-status', 'failed to refresh after event', {
          agentId: fullEvent.agentId,
          eventType: fullEvent.type,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private async refreshAgentGitStatus(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return;
    }

    const driver = await this.getBackendDriverForAgent(agent);
    const status = await driver.getGitStatus?.(agent);
    if (!status) {
      return;
    }

    this.emitAndApply({
      agentId,
      type: 'git.statusUpdated',
      payload: status,
    });
  }

  private syncPowerSaveBlocker(): void {
    this.powerSaveBlocker.sync(this.snapshot);
  }

  private eventCompletesSavedPlan(event: MainToRendererEvent): boolean {
    if (event.type !== 'turn.completed' || !event.agentId || !event.turnId) {
      return false;
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === event.agentId);
    return agent?.plan?.turnId === event.turnId && Boolean(agent.plan.markdown.trim());
  }

  private promptPlanPreview(event: MainToRendererEvent): void {
    if (
      !event.agentId ||
      !event.turnId ||
      (
        event.type !== 'turn.completed' &&
        event.type !== 'turn.planUpdated' &&
        event.type !== 'turn.proposedPlanCompleted'
      )
    ) {
      return;
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === event.agentId);
    if (!agent?.plan || agent.plan.turnId !== event.turnId || !agent.plan.markdown.trim()) {
      return;
    }

    this.emitAndApply({
      agentId: event.agentId,
      threadId: agent.plan.threadId,
      turnId: event.turnId,
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Plan',
        content: agent.plan.markdown,
      },
    });
  }

  private promptGitDiffPreview(event: MainToRendererEvent): void {
    if (!event.agentId || !isRecord(event.payload) || typeof event.payload.diff !== 'string' || !event.payload.diff.trim()) {
      return;
    }

    this.emitAndApply({
      agentId: event.agentId,
      threadId: event.threadId,
      turnId: event.turnId,
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff: event.payload.diff,
      },
    });
  }

  private recordClientRequestOwner(event: MainToRendererEvent): void {
    if (event.type !== 'approval.requested' && event.type !== 'toolInput.requested') {
      return;
    }

    const request = clientRequest(event.payload);
    if (!request) {
      return;
    }

    const backend = event.backend ?? (event.agentId ? this.snapshot.agents.find((agent) => agent.id === event.agentId)?.backend : undefined);
    if (backend) {
      this.clientRequestBackends.set(request.id, backend);
    }
  }

  private async persistSnapshot(): Promise<void> {
    await this.persistence.save(this.snapshot);
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

function rendererMessageText(message: RendererMessage): string {
  return message.parts
    .map((part) => part.type === 'text' || part.type === 'status' ? part.text : '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function isBackendConversationRef(value: unknown): value is BackendConversationRef {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.backend === 'codex') {
    return typeof candidate.threadId === 'string' && candidate.threadId.trim().length > 0;
  }

  return candidate.backend === 'claude' &&
    typeof candidate.folder === 'string' &&
    candidate.folder.trim().length > 0 &&
    typeof candidate.sessionId === 'string' &&
    candidate.sessionId.trim().length > 0;
}

function sameConversationRef(left: BackendConversationRef, right: BackendConversationRef): boolean {
  if (left.backend === 'codex') {
    return right.backend === 'codex' && left.threadId === right.threadId;
  }

  return right.backend === 'claude' && left.folder === right.folder && left.sessionId === right.sessionId;
}

function turnIdFromRendererMessageId(messageId: string): string | null {
  if (messageId.startsWith('assistant-')) {
    return messageId.slice('assistant-'.length).split('-segment-')[0] || null;
  }

  if (messageId.startsWith('compaction-')) {
    return messageId.slice('compaction-'.length) || null;
  }

  return null;
}

function clientRequest(value: unknown): ClientRequest | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('id' in value) ||
    !('kind' in value) ||
    typeof value.id !== 'string' ||
    (value.kind !== 'confirm_tool' && value.kind !== 'ask_user')
  ) {
    return null;
  }

  return value as ClientRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBackendSnapshotState(value: unknown): value is { snapshot: AppSnapshot; lastEventSeq: number } {
  return isRecord(value) && isRecord(value.snapshot) && typeof value.lastEventSeq === 'number';
}

function appleSpeechAssetsPath(): string {
  const isPackaged = Boolean((app as { isPackaged?: boolean } | undefined)?.isPackaged);
  return isPackaged ? process.resourcesPath : path.resolve(process.cwd(), 'assets');
}
