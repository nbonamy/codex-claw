import { contextBridge, ipcRenderer } from 'electron';
import type { AppleSpeechTranscriptionOptions, AppCommand, ClientRequestResponse, CodexApprovalPreset, CodexClawApi, CreateAgentInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, ReorderAgentsInput, ReorderTeamsInput, SendPromptOptions, UpdateAgentInput, UpdateSettingsInput, UpdateTeamInput } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

const api: CodexClawApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  listBackendModels: (agentId: string) => ipcRenderer.invoke(ipcChannels.listBackendModels, agentId),
  listBackendSkills: (agentId: string) => ipcRenderer.invoke(ipcChannels.listBackendSkills, agentId),
  listAgentFiles: (agentId: string) => ipcRenderer.invoke(ipcChannels.listAgentFiles, agentId),
  readAgentFile: (agentId: string, filePath: string) => ipcRenderer.invoke(ipcChannels.readAgentFile, agentId, filePath),
  chooseAgentFolder: () => ipcRenderer.invoke(ipcChannels.chooseAgentFolder),
  createTeam: (input: CreateTeamInput) => ipcRenderer.invoke(ipcChannels.createTeam, input),
  updateTeam: (input: UpdateTeamInput) => ipcRenderer.invoke(ipcChannels.updateTeam, input),
  reorderTeams: (input: ReorderTeamsInput) => ipcRenderer.invoke(ipcChannels.reorderTeams, input),
  closeTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.closeTeam, teamId),
  selectTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.selectTeam, teamId),
  createAgent: (input: CreateAgentInput) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  updateAgent: (input: UpdateAgentInput) => ipcRenderer.invoke(ipcChannels.updateAgent, input),
  duplicateAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.duplicateAgent, agentId),
  moveAgentToTeam: (input: MoveAgentToTeamInput) => ipcRenderer.invoke(ipcChannels.moveAgentToTeam, input),
  reorderAgents: (input: ReorderAgentsInput) => ipcRenderer.invoke(ipcChannels.reorderAgents, input),
  saveAgentToBench: (agentId: string) => ipcRenderer.invoke(ipcChannels.saveAgentToBench, agentId),
  deployBenchTemplate: (templateId: string, teamId?: string) => ipcRenderer.invoke(ipcChannels.deployBenchTemplate, templateId, teamId),
  removeBenchTemplate: (templateId: string) => ipcRenderer.invoke(ipcChannels.removeBenchTemplate, templateId),
  restartAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.restartAgent, agentId),
  closeAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.closeAgent, agentId),
  selectAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  selectAgentFolder: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgentFolder, agentId),
  updateSettings: (input: UpdateSettingsInput) => ipcRenderer.invoke(ipcChannels.updateSettings, input),
  transcribeAppleSpeech: (audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions) => ipcRenderer.invoke(ipcChannels.transcribeAppleSpeech, audioData, options),
  quit: () => ipcRenderer.invoke(ipcChannels.quit),
  setAgentGoal: (agentId: string, objective: string) => ipcRenderer.invoke(ipcChannels.setAgentGoal, agentId, objective),
  clearAgentGoal: (agentId: string) => ipcRenderer.invoke(ipcChannels.clearAgentGoal, agentId),
  setAgentCodexApprovalPreset: (agentId: string, preset: CodexApprovalPreset) => ipcRenderer.invoke(ipcChannels.setAgentCodexApprovalPreset, agentId, preset),
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
