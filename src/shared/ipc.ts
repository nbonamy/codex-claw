export const ipcChannels = {
  getSnapshot: 'app:get-snapshot',
  listCodexModels: 'codex:models:list',
  createAgent: 'agent:create',
  selectAgent: 'agent:select',
  selectAgentFolder: 'agent:select-folder',
  sendPrompt: 'agent:send-prompt',
  respondToClientRequest: 'client-request:respond',
  event: 'app:event',
} as const;

export type IpcChannel = typeof ipcChannels[keyof typeof ipcChannels];
