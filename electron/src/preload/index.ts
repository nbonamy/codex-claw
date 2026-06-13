import { contextBridge, ipcRenderer } from 'electron';
import type { AppleSpeechTranscriptionOptions, AppCommand, ApprovalPreset, BackendConversationRef, ClientRequestResponse, CodexClawApi, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderKind } from '@codex-claw/shared/contracts';
import { ipcChannels } from '@codex-claw/shared/ipc';

const api: CodexClawApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  connectWorkProvider: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.connectWorkProvider, provider),
  openWorkProviderAuthorization: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.openWorkProviderAuthorization, provider),
  completeWorkProviderConnection: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.completeWorkProviderConnection, provider),
  disconnectWorkProvider: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.disconnectWorkProvider, provider),
  listWorkRepositories: (provider: WorkProviderKind) => ipcRenderer.invoke(ipcChannels.listWorkRepositories, provider),
  configureWorkBacklog: (input: WorkBacklogConfigurationInput) => ipcRenderer.invoke(ipcChannels.configureWorkBacklog, input),
  listWorkItems: (provider: WorkProviderKind, repositoryId: string) => ipcRenderer.invoke(ipcChannels.listWorkItems, provider, repositoryId),
  listBackendModels: (agentId: string) => ipcRenderer.invoke(ipcChannels.listBackendModels, agentId),
  listBackendSkills: (agentId: string) => ipcRenderer.invoke(ipcChannels.listBackendSkills, agentId),
  listAgentFiles: (agentId: string) => ipcRenderer.invoke(ipcChannels.listAgentFiles, agentId),
  previewAgentFile: (agentId: string, filePath: string) => ipcRenderer.invoke(ipcChannels.previewAgentFile, agentId, filePath),
  openAgentGitDiff: (agentId: string) => ipcRenderer.invoke(ipcChannels.openAgentGitDiff, agentId),
  chooseAgentFolder: () => ipcRenderer.invoke(ipcChannels.chooseAgentFolder),
  chooseSourceFolder: () => ipcRenderer.invoke(ipcChannels.chooseSourceFolder),
  listSourceRepositories: () => ipcRenderer.invoke(ipcChannels.listSourceRepositories),
  listSourceWorktrees: (repoPath: string) => ipcRenderer.invoke(ipcChannels.listSourceWorktrees, repoPath),
  suggestSourceWorktreePath: (input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>) => ipcRenderer.invoke(ipcChannels.suggestSourceWorktreePath, input),
  chooseSourceWorktreeDestination: (defaultPath: string) => ipcRenderer.invoke(ipcChannels.chooseSourceWorktreeDestination, defaultPath),
  createSourceWorktree: (input: CreateSourceWorktreeInput) => ipcRenderer.invoke(ipcChannels.createSourceWorktree, input),
  createTeam: (input: CreateTeamInput) => ipcRenderer.invoke(ipcChannels.createTeam, input),
  updateTeam: (input: UpdateTeamInput) => ipcRenderer.invoke(ipcChannels.updateTeam, input),
  reorderTeams: (input: ReorderTeamsInput) => ipcRenderer.invoke(ipcChannels.reorderTeams, input),
  closeTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.closeTeam, teamId),
  selectTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.selectTeam, teamId),
  createLoop: (input: CreateLoopInput) => ipcRenderer.invoke(ipcChannels.createLoop, input),
  updateLoop: (input: UpdateLoopInput) => ipcRenderer.invoke(ipcChannels.updateLoop, input),
  runLoop: (loopId: string) => ipcRenderer.invoke(ipcChannels.runLoop, loopId),
  clearLoopHistory: (loopId: string) => ipcRenderer.invoke(ipcChannels.clearLoopHistory, loopId),
  deleteLoopExecution: (loopId: string, executionId: string) => ipcRenderer.invoke(ipcChannels.deleteLoopExecution, loopId, executionId),
  deleteLoop: (loopId: string) => ipcRenderer.invoke(ipcChannels.deleteLoop, loopId),
  listAgentConversations: (agentId: string) => ipcRenderer.invoke(ipcChannels.listAgentConversations, agentId),
  resumeAgentConversation: (agentId: string, ref: BackendConversationRef) => ipcRenderer.invoke(ipcChannels.resumeAgentConversation, agentId, ref),
  readConversationMessages: (ref: BackendConversationRef, agentId: string) => ipcRenderer.invoke(ipcChannels.readConversationMessages, ref, agentId),
  createAgent: (input: CreateAgentInput) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  updateAgent: (input: UpdateAgentInput) => ipcRenderer.invoke(ipcChannels.updateAgent, input),
  assignWorkItemToAgent: (agentId: string, item: WorkItem) => ipcRenderer.invoke(ipcChannels.assignWorkItemToAgent, agentId, item),
  removeWorkItemAssignment: (item: WorkItem) => ipcRenderer.invoke(ipcChannels.removeWorkItemAssignment, item),
  duplicateAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.duplicateAgent, agentId),
  moveAgentToTeam: (input: MoveAgentToTeamInput) => ipcRenderer.invoke(ipcChannels.moveAgentToTeam, input),
  reorderAgents: (input: ReorderAgentsInput) => ipcRenderer.invoke(ipcChannels.reorderAgents, input),
  saveAgentToBench: (agentId: string) => ipcRenderer.invoke(ipcChannels.saveAgentToBench, agentId),
  deployBenchTemplate: (templateId: string, teamId?: string) => ipcRenderer.invoke(ipcChannels.deployBenchTemplate, templateId, teamId),
  removeBenchTemplate: (templateId: string) => ipcRenderer.invoke(ipcChannels.removeBenchTemplate, templateId),
  restartAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.restartAgent, agentId),
  closeAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.closeAgent, agentId),
  selectAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  updateSettings: (input: UpdateSettingsInput) => ipcRenderer.invoke(ipcChannels.updateSettings, input),
  getSystemPermissions: () => ipcRenderer.invoke(ipcChannels.getSystemPermissions),
  openAccessibilitySettings: () => ipcRenderer.invoke(ipcChannels.openAccessibilitySettings),
  transcribeAppleSpeech: (audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions) => ipcRenderer.invoke(ipcChannels.transcribeAppleSpeech, audioData, options),
  quit: () => ipcRenderer.invoke(ipcChannels.quit),
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
