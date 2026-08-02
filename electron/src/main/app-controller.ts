import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { registerCodexNativeIpc, TypedIpcMain } from 'codex-app-sdk/electron';
import { AgentActivityPowerSaveBlocker } from './agent-activity-power-save-blocker';
import { logMain, warnMain } from './log';
import { createMainWindow } from './main-window';
import { createRuntimeClawBackendClient, type ClawBackendClientPort } from './backend-client';
import { getClawdDaemonStatus, setClawdDaemonEnabled } from './daemon-launch-agent';
import { ensureCurrentClawdDaemonForStartup } from './daemon-startup-maintenance';
import { isClawSnapshotGetResult, type ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { isAppSnapshot, isClientState } from '@codex-claw/shared/snapshot-guards';
import { applyMainEventToSnapshot } from '@codex-claw/shared/snapshot';
import type { AddSshConnectionInput, AgentFilePreviewResult, AgentFileSearchItem, ApprovalPreset, AppCommand, AppSnapshot, BackendConnectionState, BackendConversationRef, BenchLocation, BackendModelOption, BackendSkillSummary, BrowserAnnotation, BrowserBounds, BrowserState, ClawdDaemonStatus, ClientRequestResponse, CodexAuthentication, CodexChatGptLogin, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingSession, DevicePairingStatus, LoopLocation, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, RendererMessage, RendererSnapshotState, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, SystemPermissionsStatus, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import { ipcChannels, type CodexClawIpcRequests } from '@codex-claw/shared/ipc';
import { sendAppCommand, sendRendererEvent } from './ipc-events';
import { BrowserPane, browserPaneKey } from './browser-pane';
import { launchChatGptApp } from './chatgpt-app';
import { appCommandFromDeepLink, codexClawDeepLinkScheme, deepLinksFromArgv } from './deep-links';

type AppLifecycle = Pick<typeof app, 'exit' | 'quit' | 'relaunch'>;
type StartupMaintenance = () => Promise<void>;
type PendingBrowserOpen = {
  agentId: string;
  browserId: string;
  resolve(state: BrowserState): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private snapshot: AppSnapshot | null = null;
  private clientState: ClientState = createEmptyClientState();
  private backendClientEventUnsubscribe: (() => void) | null = null;
  private backendClientConnectionUnsubscribe: (() => void) | null = null;
  private nativeIpcUnregister: (() => void) | null = null;
  private lastBackendEventSeq = 0;
  private clientEventSeq = 0;
  private backendEventBuffer: ClawBackendEvent[] | null = null;
  private backendSynchronization: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private shuttingDown = false;
  private connectionState: BackendConnectionState = { status: 'connecting' };
  private rendererReady = false;
  private readonly pendingDeepLinkCommands: AppCommand[] = [];
  private readonly pendingBrowserOpens = new Map<string, PendingBrowserOpen>();

  private readonly browserPane = new BrowserPane({
    onAnnotation: (annotation) => this.emitBrowserAnnotation(annotation),
  });

  private readonly powerSaveBlocker = new AgentActivityPowerSaveBlocker();
  private readonly backendClient: ClawBackendClientPort | null;

  constructor(
    initialSnapshot: AppSnapshot | null = null,
    backendClient: ClawBackendClientPort | null | undefined = undefined,
    private readonly appLifecycle: AppLifecycle = app,
    private readonly startupMaintenance: StartupMaintenance = async () => undefined,
    private readonly openExternal: (url: string) => Promise<unknown> = (url) => shell.openExternal(url),
  ) {
    this.snapshot = initialSnapshot;
    this.backendClient = backendClient ?? createRuntimeClawBackendClient({
      browserOpen: (agentId, browserId, url) => this.requestBrowserOpen(agentId, browserId, url),
      browserExecute: (agentId, browserId, command, arguments_) => this.browserPane.execute(agentId, browserId, command, arguments_),
    });
  }

  async initialize(): Promise<void> {
    await this.startupMaintenance();
    await this.initializeBackendClient();
    this.syncPowerSaveBlocker();
  }

  registerIpcHandlers(): void {
    this.nativeIpcUnregister?.();
    this.nativeIpcUnregister = registerCodexNativeIpc({ clipboard, dialog, ipcMain, shell });
    const ipc = new TypedIpcMain<CodexClawIpcRequests>(ipcMain);
    ipc.handle(ipcChannels.getSnapshot, () => this.getSnapshot());
    ipc.handle(ipcChannels.getSnapshotState, () => this.getSnapshotState());

    ipc.handle(ipcChannels.listSshHosts, () => {
      return this.listSshHosts();
    });

    ipc.handle(ipcChannels.addSshConnection, async (_event, input: AddSshConnectionInput) => {
      return this.addSshConnection(input);
    });

    ipc.handle(ipcChannels.checkRemoteConnection, async (_event, connectionId: string) => {
      return this.checkRemoteConnection(connectionId);
    });

    ipc.handle(ipcChannels.updateRemoteConnection, async (_event, connectionId: string, input: UpdateRemoteConnectionInput) => {
      return this.updateRemoteConnection(connectionId, input);
    });

    ipc.handle(ipcChannels.removeRemoteConnection, async (_event, connectionId: string) => {
      return this.removeRemoteConnection(connectionId);
    });

    ipc.handle(ipcChannels.getDevicePairingStatus, () => this.getDevicePairingStatus());
    ipc.handle(ipcChannels.enableDevicePairing, () => this.enableDevicePairing());
    ipc.handle(ipcChannels.disableDevicePairing, () => this.disableDevicePairing());
    ipc.handle(ipcChannels.startDevicePairing, () => this.startDevicePairing());
    ipc.handle(ipcChannels.checkDevicePairing, (_event, session: DevicePairingSession) => this.checkDevicePairing(session));
    ipc.handle(ipcChannels.listPairedDevices, (_event, environmentId: string) => this.listPairedDevices(environmentId));
    ipc.handle(ipcChannels.revokePairedDevice, (_event, environmentId: string, clientId: string) => this.revokePairedDevice(environmentId, clientId));

    ipc.handle(ipcChannels.connectWorkProvider, async (_event, provider: WorkProviderKind) => {
      return this.connectWorkProvider(provider);
    });

    ipc.handle(ipcChannels.openWorkProviderAuthorization, async (_event, provider: WorkProviderKind) => {
      return this.openWorkProviderAuthorization(provider);
    });

    ipc.handle(ipcChannels.completeWorkProviderConnection, async (_event, provider: WorkProviderKind) => {
      return this.completeWorkProviderConnection(provider);
    });

    ipc.handle(ipcChannels.disconnectWorkProvider, async (_event, provider: WorkProviderKind) => {
      return this.disconnectWorkProvider(provider);
    });

    ipc.handle(ipcChannels.listWorkRepositories, async (_event, provider: WorkProviderKind, location?: LoopLocation) => {
      return this.listWorkRepositories(provider, location);
    });

    ipc.handle(ipcChannels.configureWorkBacklog, async (_event, input: WorkBacklogConfigurationInput, location?: LoopLocation) => {
      return this.configureWorkBacklog(input, location);
    });

    ipc.handle(ipcChannels.listWorkItems, async (_event, provider: WorkProviderKind, repositoryId: string, location?: LoopLocation) => {
      return this.listWorkItems(provider, repositoryId, location);
    });

    ipc.handle(ipcChannels.listBackendModels, async (_event, agentId: string) => {
      return this.listBackendModels(agentId);
    });

    ipc.handle(ipcChannels.listBackendSkills, async (_event, agentId: string) => {
      return this.listBackendSkills(agentId);
    });

    ipc.handle(ipcChannels.listAgentFiles, async (_event, agentId: string) => {
      return this.listAgentFiles(agentId);
    });

    ipc.handle(ipcChannels.previewAgentFile, async (_event, agentId: string, filePath: string) => {
      return this.previewAgentFile(agentId, filePath);
    });

    ipc.handle(ipcChannels.openAgentGitDiff, async (_event, agentId: string) => {
      return this.openAgentGitDiff(agentId);
    });

    ipc.handle(ipcChannels.chooseAgentFolder, async () => {
      return this.chooseAgentFolder();
    });

    ipc.handle(ipcChannels.chooseCodexBinary, async () => {
      return this.chooseCodexBinary();
    });

    ipc.handle(ipcChannels.chooseSourceFolder, async () => {
      return this.chooseSourceFolder();
    });

    ipc.handle(ipcChannels.listSourceFolders, async (_event, input?: SourceFolderListInput) => {
      return this.listSourceFolders(input);
    });

    ipc.handle(ipcChannels.listSourceRepositories, async (_event, remoteConnectionId?: string) => {
      return this.listSourceRepositories(remoteConnectionId);
    });

    ipc.handle(ipcChannels.listSourceWorktrees, async (_event, repoPath: string, remoteConnectionId?: string) => {
      return this.listSourceWorktrees(repoPath, remoteConnectionId);
    });

    ipc.handle(ipcChannels.suggestSourceWorktreePath, async (_event, input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>) => {
      return this.suggestSourceWorktreePath(input);
    });

    ipc.handle(ipcChannels.chooseSourceWorktreeDestination, async (_event, defaultPath: string) => {
      return this.chooseSourceWorktreeDestination(defaultPath);
    });

    ipc.handle(ipcChannels.createSourceWorktree, async (_event, input: CreateSourceWorktreeInput) => {
      return this.createSourceWorktree(input);
    });

    ipc.handle(ipcChannels.createTeam, async (_event, input: CreateTeamInput) => {
      return this.createTeam(input);
    });

    ipc.handle(ipcChannels.updateTeam, async (_event, input: UpdateTeamInput) => {
      return this.updateTeam(input);
    });

    ipc.handle(ipcChannels.reorderTeams, async (_event, input: ReorderTeamsInput) => {
      return this.reorderTeams(input);
    });

    ipc.handle(ipcChannels.closeTeam, async (_event, teamId: string) => {
      return this.closeTeam(teamId);
    });

    ipc.handle(ipcChannels.disconnectTeam, async (_event, teamId: string) => {
      return this.disconnectTeam(teamId);
    });

    ipc.handle(ipcChannels.selectTeam, async (_event, teamId: string) => {
      return this.selectTeam(teamId);
    });

    ipc.handle(ipcChannels.getBenchSnapshot, async (_event, location?: BenchLocation) => {
      return this.getBenchSnapshot(location);
    });

    ipc.handle(ipcChannels.getLoopSnapshot, async (_event, location?: LoopLocation) => {
      return this.getLoopSnapshot(location);
    });

    ipc.handle(ipcChannels.createLoop, async (_event, input: CreateLoopInput, location?: LoopLocation) => {
      return this.createLoop(input, location);
    });

    ipc.handle(ipcChannels.updateLoop, async (_event, input: UpdateLoopInput, location?: LoopLocation) => {
      return this.updateLoop(input, location);
    });

    ipc.handle(ipcChannels.runLoop, async (_event, loopId: string, location?: LoopLocation) => {
      return this.runLoop(loopId, location);
    });

    ipc.handle(ipcChannels.clearLoopHistory, async (_event, loopId: string, location?: LoopLocation) => {
      return this.clearLoopHistory(loopId, location);
    });

    ipc.handle(ipcChannels.deleteLoopExecution, async (_event, loopId: string, executionId: string, location?: LoopLocation) => {
      return this.deleteLoopExecution(loopId, executionId, location);
    });

    ipc.handle(ipcChannels.deleteLoop, async (_event, loopId: string, location?: LoopLocation) => {
      return this.deleteLoop(loopId, location);
    });

    ipc.handle(ipcChannels.listAgentConversations, async (_event, agentId: string) => {
      return this.listAgentConversations(agentId);
    });

    ipc.handle(ipcChannels.resumeAgentConversation, async (_event, agentId: string, ref: unknown) => {
      return this.resumeAgentConversation(agentId, ref);
    });

    ipc.handle(ipcChannels.readConversationMessages, async (_event, ref: unknown, agentId: string, location?: LoopLocation) => {
      return this.readConversationMessages(ref, agentId, location);
    });

    ipc.handle(ipcChannels.createAgent, async (_event, input: CreateAgentInput) => {
      return this.createAgent(input);
    });

    ipc.handle(ipcChannels.updateAgent, async (_event, input: UpdateAgentInput) => {
      return this.updateAgent(input);
    });

    ipc.handle(ipcChannels.assignWorkItemToAgent, async (_event, agentId: string, item: unknown) => {
      return this.assignWorkItemToAgent(agentId, item);
    });

    ipc.handle(ipcChannels.removeWorkItemAssignment, async (_event, item: unknown) => {
      return this.removeWorkItemAssignment(item);
    });

    ipc.handle(ipcChannels.duplicateAgent, async (_event, agentId: string) => {
      return this.duplicateAgent(agentId);
    });

    ipc.handle(ipcChannels.moveAgentToTeam, async (_event, input: MoveAgentToTeamInput) => {
      return this.moveAgentToTeam(input);
    });

    ipc.handle(ipcChannels.reorderAgents, async (_event, input: ReorderAgentsInput) => {
      return this.reorderAgents(input);
    });

    ipc.handle(ipcChannels.saveAgentToBench, async (_event, agentId: string) => {
      return this.saveAgentToBench(agentId);
    });

    ipc.handle(ipcChannels.deployBenchTemplate, async (_event, templateId: string, teamId?: string, location?: BenchLocation) => {
      return this.deployBenchTemplate(templateId, teamId, location);
    });

    ipc.handle(ipcChannels.removeBenchTemplate, async (_event, templateId: string, location?: BenchLocation) => {
      return this.removeBenchTemplate(templateId, location);
    });

    ipc.handle(ipcChannels.restartAgent, async (_event, agentId: string) => {
      return this.restartAgent(agentId);
    });

    ipc.handle(ipcChannels.hydrateAgentHistory, async (_event, agentId: string) => {
      return this.hydrateAgentHistory(agentId);
    });

    ipc.handle(ipcChannels.closeAgent, async (_event, agentId: string) => {
      return this.closeAgent(agentId);
    });

    ipc.handle(ipcChannels.selectAgent, async (_event, agentId: string) => {
      return this.selectAgent(agentId);
    });

    ipc.handle(ipcChannels.updateSettings, async (_event, input: UpdateSettingsInput) => {
      return this.updateSettings(input);
    });
    ipc.handle(ipcChannels.getCodexAuthentication, () => this.getCodexAuthentication());
    ipc.handle(ipcChannels.cancelCodexChatGptLogin, () => this.cancelCodexChatGptLogin());
    ipc.handle(ipcChannels.startCodexChatGptLogin, () => this.startCodexChatGptLogin());
    ipc.handle(ipcChannels.logoutCodex, () => this.logoutCodex());

    ipc.handle(ipcChannels.getDaemonStatus, () => this.getDaemonStatus());

    ipc.handle(ipcChannels.setDaemonEnabled, async (_event, enabled: boolean) => {
      return this.setDaemonEnabled(enabled);
    });

    ipc.handle(ipcChannels.getSystemPermissions, () => this.getSystemPermissions());

    ipc.handle(ipcChannels.openAccessibilitySettings, () => this.openAccessibilitySettings());

    ipc.handle(ipcChannels.launchChatGptApp, () => launchChatGptApp());

    ipc.handle(ipcChannels.quit, () => {
      this.appLifecycle.quit();
    });

    ipc.handle(ipcChannels.restartApp, () => this.restartApp());

    ipc.handle(ipcChannels.setAgentGoal, (_event, agentId: string, objective: string) => {
      return this.setAgentGoal(agentId, objective);
    });

    ipc.handle(ipcChannels.clearAgentGoal, (_event, agentId: string) => {
      return this.clearAgentGoal(agentId);
    });

    ipc.handle(ipcChannels.setAgentApprovalPreset, (_event, agentId: string, preset: ApprovalPreset) => {
      return this.setAgentApprovalPreset(agentId, preset);
    });

    ipc.handle(ipcChannels.sendPrompt, (_event, agentId: string, prompt: string, options?: SendPromptOptions) => {
      return this.sendPrompt(agentId, prompt, options);
    });

    ipc.handle(ipcChannels.steerPrompt, (_event, agentId: string, prompt: string, options?: SendPromptOptions) => {
      return this.steerPrompt(agentId, prompt, options);
    });

    ipc.handle(ipcChannels.deleteQueuedPrompt, (_event, agentId: string, promptId: string) => {
      return this.deleteQueuedPrompt(agentId, promptId);
    });

    ipc.handle(ipcChannels.steerQueuedPrompt, (_event, agentId: string, promptId: string) => {
      return this.steerQueuedPrompt(agentId, promptId);
    });

    ipc.handle(ipcChannels.interruptAgent, (_event, agentId: string) => {
      return this.interruptAgent(agentId);
    });

    ipc.handle(ipcChannels.deleteMessage, (_event, agentId: string, messageId: string) => {
      return this.deleteMessage(agentId, messageId);
    });

    ipc.handle(ipcChannels.editMessage, (_event, agentId: string, messageId: string, prompt: string) => {
      return this.editMessage(agentId, messageId, prompt);
    });

    ipc.handle(ipcChannels.retryMessage, (_event, agentId: string, messageId: string) => {
      return this.retryMessage(agentId, messageId);
    });

    ipc.handle(ipcChannels.browserOpen, (_event, agentId: string, browserId: string, url: string) => this.browserOpen(agentId, browserId, url));
    ipc.handle(ipcChannels.browserNavigate, (_event, agentId: string, browserId: string, url: string) => this.browserNavigate(agentId, browserId, url));
    ipc.handle(ipcChannels.browserGoBack, (_event, agentId: string, browserId: string) => this.browserPane.goBack(agentId, browserId));
    ipc.handle(ipcChannels.browserGoForward, (_event, agentId: string, browserId: string) => this.browserPane.goForward(agentId, browserId));
    ipc.handle(ipcChannels.browserReload, (_event, agentId: string, browserId: string) => this.browserPane.reload(agentId, browserId));
    ipc.handle(ipcChannels.browserSetBounds, (_event, agentId: string, browserId: string, bounds: BrowserBounds) => this.browserPane.setBounds(agentId, browserId, bounds));
    ipc.handle(ipcChannels.browserSetVisible, (_event, agentId: string, browserId: string, visible: boolean) => this.browserPane.setVisible(agentId, browserId, visible));
    ipc.handle(ipcChannels.browserSetAnnotationMode, (_event, agentId: string, browserId: string, enabled: boolean) => this.browserPane.setAnnotationMode(agentId, browserId, enabled));
    ipc.handle(ipcChannels.browserClearAnnotations, (_event, agentId: string, browserId: string) => this.browserPane.clearAnnotations(agentId, browserId));
    ipc.handle(ipcChannels.browserClose, (_event, agentId: string, browserId: string) => this.browserPane.close(agentId, browserId));

    ipc.handle(ipcChannels.respondToClientRequest, async (_event, response: ClientRequestResponse) => {
      return this.respondToClientRequest(response);
    });
  }

  createWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.focusMainWindow();
      return;
    }
    this.mainWindow = createMainWindow(this.snapshot?.general.agentListCompact ?? false);
    this.rendererReady = false;
    this.mainWindow.webContents.on('did-start-loading', () => {
      this.rendererReady = false;
    });
    this.mainWindow.webContents.on('did-finish-load', () => {
      this.rendererReady = true;
      this.flushPendingDeepLinkCommands();
    });
  }

  openDeepLink(value: string): boolean {
    const command = appCommandFromDeepLink(value);
    if (!command) return false;
    if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.rendererReady) {
      this.pendingDeepLinkCommands.push(command);
    } else {
      sendAppCommand(this.mainWindow.webContents, command);
    }
    this.focusMainWindow();
    return true;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.rejectAllPendingBrowserOpens(new Error('Application is shutting down.'));
    await this.browserPane.closeAll();
    this.powerSaveBlocker.stop();
    this.nativeIpcUnregister?.();
    this.nativeIpcUnregister = null;
    this.backendClientEventUnsubscribe?.();
    this.backendClientEventUnsubscribe = null;
    this.backendClientConnectionUnsubscribe?.();
    this.backendClientConnectionUnsubscribe = null;
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
      this.backendClientConnectionUnsubscribe?.();
      this.backendClientConnectionUnsubscribe = this.backendClient.onConnectionState?.((state, error) => {
        if (state === 'disconnected') this.handleBackendDisconnect(error);
      }) ?? null;
      await this.synchronizeBackendState();
      this.setConnectionState({ status: 'connected' });
      logMain('clawd', 'connected to backend', { version: health.version, pid: health.pid });
    } catch (error) {
      this.handleBackendDisconnect(error instanceof Error ? error : new Error(String(error)));
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

  private getDevicePairingStatus(): Promise<DevicePairingStatus> {
    return this.requireBackendClient().request(backendMethods.devicePairingStatusGet);
  }

  private enableDevicePairing(): Promise<DevicePairingStatus> {
    return this.requireBackendClient().request(backendMethods.devicePairingEnable);
  }

  private disableDevicePairing(): Promise<DevicePairingStatus> {
    return this.requireBackendClient().request(backendMethods.devicePairingDisable);
  }

  private startDevicePairing(): Promise<DevicePairingSession> {
    return this.requireBackendClient().request(backendMethods.devicePairingStart);
  }

  private checkDevicePairing(session: DevicePairingSession): Promise<boolean> {
    return this.requireBackendClient().request(backendMethods.devicePairingStatus, { session });
  }

  private listPairedDevices(environmentId: string): Promise<PairedDevice[]> {
    return this.requireBackendClient().request(backendMethods.devicePairingClientsList, { environmentId });
  }

  private async revokePairedDevice(environmentId: string, clientId: string): Promise<void> {
    await this.requireBackendClient().request(backendMethods.devicePairingClientRevoke, { environmentId, clientId });
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
    const previousCodexBinaryPath = this.snapshot?.general.codexBinaryPath ?? '';
    const snapshot = await this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.settingsUpdate, { input }));
    if (previousCodexBinaryPath !== snapshot.general.codexBinaryPath) {
      await this.restartApp();
    }
    return snapshot;
  }

  private getCodexAuthentication(): Promise<CodexAuthentication> {
    return this.requireBackendClient().request(backendMethods.codexAuthenticationGet);
  }

  private cancelCodexChatGptLogin(): Promise<CodexAuthentication> {
    return this.requireBackendClient().request(backendMethods.codexChatGptLoginCancel);
  }

  private async startCodexChatGptLogin(): Promise<CodexChatGptLogin> {
    const login = await this.requireBackendClient().request<CodexChatGptLogin>(
      backendMethods.codexChatGptLoginStart,
    );
    await this.openExternal(login.authUrl);
    return login;
  }

  private logoutCodex(): Promise<CodexAuthentication> {
    return this.requireBackendClient().request(backendMethods.codexLogout);
  }

  private async getDaemonStatus(): Promise<ClawdDaemonStatus> {
    return getClawdDaemonStatus();
  }

  private async setDaemonEnabled(enabled: boolean): Promise<ClawdDaemonStatus> {
    return setClawdDaemonEnabled(enabled);
  }

  private async restartApp(): Promise<void> {
    await this.shutdown();
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
    return this.snapshot;
  }

  private async getSnapshot(): Promise<AppSnapshot> {
    if (!this.snapshot) {
      throw new Error('clawd snapshot is not available.');
    }
    return this.snapshot;
  }

  private async getSnapshotState(): Promise<RendererSnapshotState> {
    return {
      snapshot: await this.getSnapshot(),
      lastBackendEventSeq: this.lastBackendEventSeq,
      connection: { ...this.connectionState },
    };
  }

  private async sendPrompt(
    agentId: string,
    prompt: string,
    options?: SendPromptOptions,
  ): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentPromptSend, { agentId, prompt, options }));
  }

  private async browserOpen(agentId: string, browserId: string, url: string): Promise<BrowserState> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('Browser window is not available.');
    }
    try {
      const state = await this.browserPane.open(this.mainWindow, agentId, browserId, url);
      this.resolvePendingBrowserOpen(agentId, browserId, state);
      return state;
    } catch (error) {
      this.rejectPendingBrowserOpen(agentId, browserId, error);
      throw error;
    }
  }

  private async browserNavigate(agentId: string, browserId: string, url: string): Promise<BrowserState> {
    try {
      const state = await this.browserPane.navigate(agentId, browserId, url);
      this.resolvePendingBrowserOpen(agentId, browserId, state);
      return state;
    } catch (error) {
      this.rejectPendingBrowserOpen(agentId, browserId, error);
      throw error;
    }
  }

  private requestBrowserOpen(agentId: string, browserId: string, url: string): Promise<BrowserState> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return Promise.reject(new Error('Browser window is not available.'));
    }

    this.rejectPendingBrowserOpen(agentId, browserId, new Error('Browser open request was superseded.'));
    return new Promise<BrowserState>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectPendingBrowserOpen(agentId, browserId, new Error('Timed out opening the in-app browser.'));
      }, 30_000);
      this.pendingBrowserOpens.set(browserPaneKey(agentId, browserId), { agentId, browserId, resolve, reject, timeout });
      sendAppCommand(this.mainWindow!.webContents, { type: 'open-browser', agentId, browserId, url });
    });
  }

  private resolvePendingBrowserOpen(agentId: string, browserId: string, state: BrowserState): void {
    const key = browserPaneKey(agentId, browserId);
    const pending = this.pendingBrowserOpens.get(key);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingBrowserOpens.delete(key);
    pending.resolve(state);
  }

  private rejectPendingBrowserOpen(agentId: string, browserId: string, reason: unknown): void {
    const key = browserPaneKey(agentId, browserId);
    const pending = this.pendingBrowserOpens.get(key);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingBrowserOpens.delete(key);
    pending.reject(reason instanceof Error ? reason : new Error(String(reason)));
  }

  private rejectAllPendingBrowserOpens(reason: unknown): void {
    for (const pending of [...this.pendingBrowserOpens.values()]) {
      this.rejectPendingBrowserOpen(pending.agentId, pending.browserId, reason);
    }
  }

  private emitBrowserAnnotation(annotation: BrowserAnnotation): void {
    this.emitClientEvent('browser.annotationCreated', annotation);
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

  private async steerPrompt(agentId: string, prompt: string, options?: SendPromptOptions): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(
      backendMethods.agentPromptSteer,
      options ? { agentId, prompt, options } : { agentId, prompt },
    ));
  }

  private async deleteQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentQueuedPromptDelete, { agentId, promptId }));
  }

  private async steerQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot> {
    return this.adoptBackendSnapshot(await this.requireBackendClient().request<AppSnapshot>(backendMethods.agentQueuedPromptSteer, { agentId, promptId }));
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

  private async chooseCodexBinary(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select Codex executable',
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

  private async getSystemPermissions(): Promise<SystemPermissionsStatus> {
    return this.requireBackendClient().request(backendMethods.systemPermissionsGet);
  }

  private async openAccessibilitySettings(): Promise<SystemPermissionsStatus> {
    return this.requireBackendClient().request(backendMethods.systemPermissionsAccessibilityOpen);
  }

  private synchronizeBackendState(): Promise<void> {
    if (this.backendSynchronization) return this.backendSynchronization;
    this.backendSynchronization = this.performBackendSynchronization()
      .catch((error) => {
        this.backendEventBuffer = null;
        throw error;
      })
      .finally(() => {
        this.backendSynchronization = null;
      });
    return this.backendSynchronization;
  }

  private async performBackendSynchronization(): Promise<void> {
    this.backendEventBuffer ??= [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const backendState = await this.requireBackendClient().request<unknown>(backendMethods.snapshotGet);
      if (!isClawSnapshotGetResult(backendState)) throw new Error('clawd returned an invalid snapshot.');

      this.snapshot = backendState.snapshot;
      this.clientState = backendState.clientState;
      this.lastBackendEventSeq = backendState.lastEventSeq;
      const buffered = this.backendEventBuffer;
      this.backendEventBuffer = [];
      let gap = false;
      for (const event of buffered) {
        if (event.seq <= this.lastBackendEventSeq) continue;
        if (event.seq !== this.lastBackendEventSeq + 1) {
          gap = true;
          break;
        }
        this.applyBackendEvent(event, true);
      }
      if (!gap) {
        this.backendEventBuffer = null;
        this.syncPowerSaveBlocker();
        return;
      }
      warnMain('clawd', 'backend event gap detected while synchronizing', {
        attempt: attempt + 1,
        lastEventSeq: this.lastBackendEventSeq,
      });
    }
    this.backendEventBuffer = null;
    throw new Error('Unable to obtain a consistent clawd snapshot after repeated event gaps.');
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
    if (this.backendEventBuffer) {
      this.backendEventBuffer.push(event);
      return;
    }
    if (event.seq <= this.lastBackendEventSeq) return;
    if (event.seq !== this.lastBackendEventSeq + 1) {
      this.backendEventBuffer = [event];
      void this.synchronizeBackendState()
        .then(() => this.emitSnapshotToRenderer())
        .catch((error) => this.handleBackendDisconnect(error instanceof Error ? error : new Error(String(error))));
      return;
    }
    this.applyBackendEvent(event, true);
  }

  private applyBackendEvent(event: ClawBackendEvent, notifyRenderer: boolean): void {
    const rendererEvent = eventForRenderer(event);
    if (isAppSnapshot(event.snapshot)) {
      this.snapshot = event.snapshot;
    } else if (this.snapshot) {
      applyMainEventToSnapshot(this.snapshot, rendererEvent);
    }
    if (isClientState(event.clientState)) {
      this.clientState = event.clientState;
    }

    this.lastBackendEventSeq = event.seq;
    this.syncPowerSaveBlocker();
    if (notifyRenderer && this.mainWindow && !this.mainWindow.isDestroyed()) {
      sendRendererEvent(this.mainWindow.webContents, rendererEvent);
    }
  }

  private handleBackendDisconnect(error?: Error): void {
    if (this.shuttingDown) return;
    this.setConnectionState({ status: 'reconnecting', ...(error?.message ? { detail: error.message } : {}) });
    this.scheduleBackendReconnect();
  }

  private scheduleBackendReconnect(): void {
    if (this.reconnectTimer || this.shuttingDown) return;
    const delay = Math.min(10_000, 250 * (2 ** this.reconnectAttempt));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnectBackend();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private async reconnectBackend(): Promise<void> {
    if (this.shuttingDown || !this.backendClient) return;
    try {
      await this.backendClient.start();
      const health = await this.backendClient.health();
      await this.synchronizeBackendState();
      this.reconnectAttempt = 0;
      this.setConnectionState({ status: 'connected' });
      this.emitSnapshotToRenderer();
      logMain('clawd', 'reconnected to backend', { version: health.version, pid: health.pid });
    } catch (error) {
      this.reconnectAttempt += 1;
      this.setConnectionState({ status: 'reconnecting', detail: error instanceof Error ? error.message : String(error) });
      this.scheduleBackendReconnect();
    }
  }

  private setConnectionState(state: BackendConnectionState): void {
    this.connectionState = state;
    this.emitClientEvent('client.connectionChanged', state);
  }

  private emitSnapshotToRenderer(): void {
    if (this.snapshot) this.emitClientEvent('snapshot.updated', this.snapshot, this.snapshot);
  }

  private emitClientEvent(type: MainToRendererEvent['type'], payload: unknown, snapshot?: AppSnapshot): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.clientEventSeq += 1;
    sendRendererEvent(this.mainWindow.webContents, {
      seq: this.clientEventSeq,
      source: 'client',
      type,
      payload,
      occurredAt: new Date().toISOString(),
      ...(snapshot ? { snapshot } : {}),
    });
  }

  private syncPowerSaveBlocker(): void {
    this.powerSaveBlocker.sync(this.clientState.shouldPreventDisplaySleep);
  }

  private flushPendingDeepLinkCommands(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.rendererReady) return;
    for (const command of this.pendingDeepLinkCommands.splice(0)) {
      sendAppCommand(this.mainWindow.webContents, command);
    }
  }

  private focusMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

}

export function startMainApp(): void {
  const controller = new AppController(null, undefined, app, ensureCurrentClawdDaemonForStartup);
  let shutdownStarted = false;
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const openDeepLinks = (values: readonly string[]): void => {
    let accepted = false;
    for (const value of values) accepted = controller.openDeepLink(value) || accepted;
    if (accepted && app.isReady() && BrowserWindow.getAllWindows().length === 0) {
      controller.createWindow();
    }
  };
  app.on('open-url', (event, url) => {
    event.preventDefault();
    openDeepLinks([url]);
  });
  app.on('second-instance', (_event, argv) => {
    openDeepLinks(deepLinksFromArgv(argv));
  });
  openDeepLinks(deepLinksFromArgv(process.argv));
  controller.registerIpcHandlers();

  void app.whenReady().then(async () => {
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(codexClawDeepLinkScheme);
    } else if (process.argv[1]) {
      app.setAsDefaultProtocolClient(codexClawDeepLinkScheme, process.execPath, [path.resolve(process.argv[1])]);
    }
    try {
      await controller.initialize();
    } catch (error) {
      warnMain('startup', 'initialization failed; opening the recovery UI', {
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      controller.createWindow();
    }
  });

  app.on('before-quit', (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    void controller.shutdown()
      .catch((error) => {
        warnMain('shutdown', 'failed to close app resources cleanly', {
          detail: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => app.exit(0));
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
  return { ...event, source: 'backend' };
}
