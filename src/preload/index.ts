import { contextBridge, ipcRenderer } from 'electron';
import type { CodexClawApi, CreateAgentInput, MainToRendererEvent } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

const api: CodexClawApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  createAgent: (input: CreateAgentInput) => ipcRenderer.invoke(ipcChannels.createAgent, input),
  sendPrompt: (agentId: string, prompt: string) => ipcRenderer.invoke(ipcChannels.sendPrompt, agentId, prompt),
  onEvent: (listener: (event: MainToRendererEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: MainToRendererEvent) => listener(payload);
    ipcRenderer.on(ipcChannels.event, handler);

    return () => {
      ipcRenderer.off(ipcChannels.event, handler);
    };
  },
};

contextBridge.exposeInMainWorld('codexClaw', api);
