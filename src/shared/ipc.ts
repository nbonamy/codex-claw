export const ipcChannels = {
  getSnapshot: 'app:get-snapshot',
  createAgent: 'agent:create',
  selectAgentFolder: 'agent:select-folder',
  sendPrompt: 'agent:send-prompt',
  event: 'app:event',
} as const;

export type IpcChannel = typeof ipcChannels[keyof typeof ipcChannels];
