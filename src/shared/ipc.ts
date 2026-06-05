export const ipcChannels = {
  getSnapshot: 'app:get-snapshot',
  createAgent: 'agent:create',
  sendPrompt: 'agent:send-prompt',
  event: 'app:event',
} as const;

export type IpcChannel = typeof ipcChannels[keyof typeof ipcChannels];
