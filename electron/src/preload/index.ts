import { contextBridge, ipcRenderer } from 'electron';
import type { AddSshConnectionInput, AppleSpeechTranscriptionOptions, AppCommand, ApprovalPreset, BackendConversationRef, BenchLocation, ClientRequestResponse, CodexClawApi, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, LoopLocation, MainToRendererEvent, MoveAgentToTeamInput, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, SourceFolderListInput, UpdateAgentInput, UpdateLoopInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderKind } from '@codex-claw/shared/contracts';
import { ipcChannels } from '@codex-claw/shared/ipc';

const api: CodexClawApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  listSshHosts: () => ipcRenderer.invoke(ipcChannels.listSshHosts),
  addSshConnection: (input: AddSshConnectionInput) => ipcRenderer.invoke(ipcChannels.addSshConnection, input),
  checkRemoteConnection: (connectionId: string) => ipcRenderer.invoke(ipcChannels.checkRemoteConnection, connectionId),
  updateRemoteConnection: (connectionId: string, input: UpdateRemoteConnectionInput) => ipcRenderer.invoke(ipcChannels.updateRemoteConnection, connectionId, input),
  removeRemoteConnection: (connectionId: string) => ipcRenderer.invoke(ipcChannels.removeRemoteConnection, connectionId),
  connectWorkProvider: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.connectWorkProvider, provider),
  openWorkProviderAuthorization: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.openWorkProviderAuthorization, provider),
  completeWorkProviderConnection: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.completeWorkProviderConnection, provider),
  disconnectWorkProvider: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.disconnectWorkProvider, provider),
  listWorkRepositories: (provider: WorkProviderKind, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.listWorkRepositories, provider, location),
  configureWorkBacklog: (input: WorkBacklogConfigurationInput) => ipcRenderer.invoke(ipcChannels.configureWorkBacklog, input),
  listWorkItems: (provider: WorkProviderKind, repositoryId: string, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.listWorkItems, provider, repositoryId, location),
  listBackendModels: (agentId: string) => ipcRenderer.invoke(ipcChannels.listBackendModels, agentId),
  listBackendSkills: (agentId: string) => ipcRenderer.invoke(ipcChannels.listBackendSkills, agentId),
  listAgentFiles: (agentId: string) => ipcRenderer.invoke(ipcChannels.listAgentFiles, agentId),
  previewAgentFile: (agentId: string, filePath: string) => ipcRenderer.invoke(ipcChannels.previewAgentFile, agentId, filePath),
  openAgentGitDiff: (agentId: string) => ipcRenderer.invoke(ipcChannels.openAgentGitDiff, agentId),
  chooseAgentFolder: () => ipcRenderer.invoke(ipcChannels.chooseAgentFolder),
  chooseSourceFolder: () => ipcRenderer.invoke(ipcChannels.chooseSourceFolder),
  listSourceFolders: (input?: SourceFolderListInput) => ipcRenderer.invoke(ipcChannels.listSourceFolders, input),
  listSourceRepositories: (remoteConnectionId?: string) => ipcRenderer.invoke(ipcChannels.listSourceRepositories, remoteConnectionId),
  listSourceWorktrees: (repoPath: string, remoteConnectionId?: string) => ipcRenderer.invoke(ipcChannels.listSourceWorktrees, repoPath, remoteConnectionId),
  suggestSourceWorktreePath: (input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>) => ipcRenderer.invoke(ipcChannels.suggestSourceWorktreePath, input),
  chooseSourceWorktreeDestination: (defaultPath: string) => ipcRenderer.invoke(ipcChannels.chooseSourceWorktreeDestination, defaultPath),
  createSourceWorktree: (input: CreateSourceWorktreeInput) => ipcRenderer.invoke(ipcChannels.createSourceWorktree, input),
  createTeam: (input: CreateTeamInput) => ipcRenderer.invoke(ipcChannels.createTeam, input),
  updateTeam: (input: UpdateTeamInput) => ipcRenderer.invoke(ipcChannels.updateTeam, input),
  reorderTeams: (input: ReorderTeamsInput) => ipcRenderer.invoke(ipcChannels.reorderTeams, input),
  closeTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.closeTeam, teamId),
  selectTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.selectTeam, teamId),
  getBenchSnapshot: (location?: BenchLocation) => ipcRenderer.invoke(ipcChannels.getBenchSnapshot, location),
  getLoopSnapshot: (location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.getLoopSnapshot, location),
  createLoop: (input: CreateLoopInput, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.createLoop, input, location),
  updateLoop: (input: UpdateLoopInput, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.updateLoop, input, location),
  runLoop: (loopId: string, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.runLoop, loopId, location),
  clearLoopHistory: (loopId: string, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.clearLoopHistory, loopId, location),
  deleteLoopExecution: (loopId: string, executionId: string, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.deleteLoopExecution, loopId, executionId, location),
  deleteLoop: (loopId: string, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.deleteLoop, loopId, location),
  listAgentConversations: (agentId: string) => ipcRenderer.invoke(ipcChannels.listAgentConversations, agentId),
  resumeAgentConversation: (agentId: string, ref: BackendConversationRef) => ipcRenderer.invoke(ipcChannels.resumeAgentConversation, agentId, ref),
  readConversationMessages: (ref: BackendConversationRef, agentId: string, location?: LoopLocation) => ipcRenderer.invoke(ipcChannels.readConversationMessages, ref, agentId, location),
  createAgent: (input: CreateAgentInput) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  updateAgent: (input: UpdateAgentInput) => ipcRenderer.invoke(ipcChannels.updateAgent, input),
  assignWorkItemToAgent: (agentId: string, item: WorkItem) => ipcRenderer.invoke(ipcChannels.assignWorkItemToAgent, agentId, item),
  removeWorkItemAssignment: (item: WorkItem) => ipcRenderer.invoke(ipcChannels.removeWorkItemAssignment, item),
  duplicateAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.duplicateAgent, agentId),
  moveAgentToTeam: (input: MoveAgentToTeamInput) => ipcRenderer.invoke(ipcChannels.moveAgentToTeam, input),
  reorderAgents: (input: ReorderAgentsInput) => ipcRenderer.invoke(ipcChannels.reorderAgents, input),
  saveAgentToBench: (agentId: string) => ipcRenderer.invoke(ipcChannels.saveAgentToBench, agentId),
  deployBenchTemplate: (templateId: string, teamId?: string, location?: BenchLocation) => ipcRenderer.invoke(ipcChannels.deployBenchTemplate, templateId, teamId, location),
  removeBenchTemplate: (templateId: string, location?: BenchLocation) => ipcRenderer.invoke(ipcChannels.removeBenchTemplate, templateId, location),
  restartAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.restartAgent, agentId),
  hydrateAgentHistory: (agentId: string) => ipcRenderer.invoke(ipcChannels.hydrateAgentHistory, agentId),
  closeAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.closeAgent, agentId),
  selectAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  updateSettings: (input: UpdateSettingsInput) => ipcRenderer.invoke(ipcChannels.updateSettings, input),
  getDaemonStatus: () => ipcRenderer.invoke(ipcChannels.getDaemonStatus),
  setDaemonEnabled: (enabled: boolean) => ipcRenderer.invoke(ipcChannels.setDaemonEnabled, enabled),
  getSystemPermissions: () => ipcRenderer.invoke(ipcChannels.getSystemPermissions),
  openAccessibilitySettings: () => ipcRenderer.invoke(ipcChannels.openAccessibilitySettings),
  transcribeAppleSpeech: (audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions) => ipcRenderer.invoke(ipcChannels.transcribeAppleSpeech, audioData, options),
  quit: () => ipcRenderer.invoke(ipcChannels.quit),
  restartApp: () => ipcRenderer.invoke(ipcChannels.restartApp),
  setAgentGoal: (agentId: string, objective: string) => ipcRenderer.invoke(ipcChannels.setAgentGoal, agentId, objective),
  clearAgentGoal: (agentId: string) => ipcRenderer.invoke(ipcChannels.clearAgentGoal, agentId),
  setAgentApprovalPreset: (agentId: string, preset: ApprovalPreset) => ipcRenderer.invoke(ipcChannels.setAgentApprovalPreset, agentId, preset),
  sendPrompt: (agentId: string, prompt: string, options?: SendPromptOptions) => ipcRenderer.invoke(ipcChannels.sendPrompt, agentId, prompt, options),
  steerPrompt: (agentId: string, prompt: string) => ipcRenderer.invoke(ipcChannels.steerPrompt, agentId, prompt),
  interruptAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.interruptAgent, agentId),
  deleteMessage: (agentId: string, messageId: string) => ipcRenderer.invoke(ipcChannels.deleteMessage, agentId, messageId),
  editMessage: (agentId: string, messageId: string, prompt: string) => ipcRenderer.invoke(ipcChannels.editMessage, agentId, messageId, prompt),
  retryMessage: (agentId: string, messageId: string) => ipcRenderer.invoke(ipcChannels.retryMessage, agentId, messageId),
  respondToClientRequest: (response: ClientRequestResponse) => ipcRenderer.invoke(ipcChannels.respondToClientRequest, response),
  onEvent: (listener: (event: MainToRendererEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: MainToRendererEvent) => listener(payload);
    ipcRenderer.on(ipcChannels.event, handler);

    return () => {
      ipcRenderer.off(ipcChannels.event, handler);
    };
  },
  onAppCommand: (listener: (command: AppCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AppCommand) => listener(payload);
    ipcRenderer.on(ipcChannels.appCommand, handler);

    return () => {
      ipcRenderer.off(ipcChannels.appCommand, handler);
    };
  },
};

contextBridge.exposeInMainWorld('codexClaw', api);
