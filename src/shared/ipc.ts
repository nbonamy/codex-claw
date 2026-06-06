export const ipcChannels = {
  getSnapshot: 'app:get-snapshot',
  listCodexModels: 'codex:models:list',
  chooseAgentFolder: 'agent:choose-folder',
  createTeam: 'team:create',
  updateTeam: 'team:update',
  closeTeam: 'team:close',
  selectTeam: 'team:select',
  createAgent: 'agent:create',
  updateAgent: 'agent:update',
  duplicateAgent: 'agent:duplicate',
  moveAgentToTeam: 'agent:move-to-team',
  saveAgentToBench: 'agent:save-to-bench',
  restartAgent: 'agent:restart',
  closeAgent: 'agent:close',
  selectAgent: 'agent:select',
  selectAgentFolder: 'agent:select-folder',
  sendPrompt: 'agent:send-prompt',
  respondToClientRequest: 'client-request:respond',
  event: 'app:event',
} as const;

export type IpcChannel = typeof ipcChannels[keyof typeof ipcChannels];
