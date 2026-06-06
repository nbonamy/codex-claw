import { contextBridge, ipcRenderer } from 'electron';
import type { AppCommand, ClientRequestResponse, CodexClawApi, CreateAgentInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, SendPromptOptions, UpdateAgentInput, UpdateTeamInput } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

const api: CodexClawApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  listCodexModels: () => ipcRenderer.invoke(ipcChannels.listCodexModels),
  chooseAgentFolder: () => ipcRenderer.invoke(ipcChannels.chooseAgentFolder),
  createTeam: (input: CreateTeamInput) => ipcRenderer.invoke(ipcChannels.createTeam, input),
  updateTeam: (input: UpdateTeamInput) => ipcRenderer.invoke(ipcChannels.updateTeam, input),
  closeTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.closeTeam, teamId),
  selectTeam: (teamId: string) => ipcRenderer.invoke(ipcChannels.selectTeam, teamId),
  createAgent: (input: CreateAgentInput) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  updateAgent: (input: UpdateAgentInput) => ipcRenderer.invoke(ipcChannels.updateAgent, input),
  duplicateAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.duplicateAgent, agentId),
  moveAgentToTeam: (input: MoveAgentToTeamInput) => ipcRenderer.invoke(ipcChannels.moveAgentToTeam, input),
  saveAgentToBench: (agentId: string) => ipcRenderer.invoke(ipcChannels.saveAgentToBench, agentId),
  deployBenchTemplate: (templateId: string, teamId?: string) => ipcRenderer.invoke(ipcChannels.deployBenchTemplate, templateId, teamId),
  removeBenchTemplate: (templateId: string) => ipcRenderer.invoke(ipcChannels.removeBenchTemplate, templateId),
  restartAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.restartAgent, agentId),
  closeAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.closeAgent, agentId),
  selectAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  selectAgentFolder: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgentFolder, agentId),
  sendPrompt: (agentId: string, prompt: string, options?: SendPromptOptions) => ipcRenderer.invoke(ipcChannels.sendPrompt, agentId, prompt, options),
  steerPrompt: (agentId: string, prompt: string) => ipcRenderer.invoke(ipcChannels.steerPrompt, agentId, prompt),
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
