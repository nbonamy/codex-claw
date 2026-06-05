import { contextBridge, ipcRenderer } from 'electron';
import type { ClientRequestResponse, CodexClawApi, CreateAgentInput, MainToRendererEvent, SendPromptOptions } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

const api: CodexClawApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  listCodexModels: () => ipcRenderer.invoke(ipcChannels.listCodexModels),
  createAgent: (input: CreateAgentInput) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  selectAgent: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgent, agentId),
  selectAgentFolder: (agentId: string) => ipcRenderer.invoke(ipcChannels.selectAgentFolder, agentId),
  sendPrompt: (agentId: string, prompt: string, options?: SendPromptOptions) => ipcRenderer.invoke(ipcChannels.sendPrompt, agentId, prompt, options),
  respondToClientRequest: (response: ClientRequestResponse) => ipcRenderer.invoke(ipcChannels.respondToClientRequest, response),
  onEvent: (listener: (event: MainToRendererEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: MainToRendererEvent) => listener(payload);
    ipcRenderer.on(ipcChannels.event, handler);

    return () => {
      ipcRenderer.off(ipcChannels.event, handler);
    };
  },
};

contextBridge.exposeInMainWorld('codexClaw', api);
