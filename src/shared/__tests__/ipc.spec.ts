import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../ipc';

describe('ipc channels', () => {
  it('keeps renderer bridge channels explicit', () => {
    expect(ipcChannels).toStrictEqual({
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
      deployBenchTemplate: 'bench:deploy-template',
      removeBenchTemplate: 'bench:remove-template',
      restartAgent: 'agent:restart',
      closeAgent: 'agent:close',
      selectAgent: 'agent:select',
      selectAgentFolder: 'agent:select-folder',
      updateSettings: 'settings:update',
      quit: 'app:quit',
      sendPrompt: 'agent:send-prompt',
      steerPrompt: 'agent:steer-prompt',
      respondToClientRequest: 'client-request:respond',
      event: 'app:event',
      appCommand: 'app:command',
    });
  });
});
