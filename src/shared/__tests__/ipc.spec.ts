import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../ipc';

describe('ipc channels', () => {
  it('keeps renderer bridge channels explicit', () => {
    expect(ipcChannels).toStrictEqual({
      getSnapshot: 'app:get-snapshot',
      listCodexModels: 'codex:models:list',
      chooseAgentFolder: 'agent:choose-folder',
      createTeam: 'team:create',
      selectTeam: 'team:select',
      createAgent: 'agent:create',
      updateAgent: 'agent:update',
      duplicateAgent: 'agent:duplicate',
      saveAgentToBench: 'agent:save-to-bench',
      restartAgent: 'agent:restart',
      closeAgent: 'agent:close',
      selectAgent: 'agent:select',
      selectAgentFolder: 'agent:select-folder',
      sendPrompt: 'agent:send-prompt',
      respondToClientRequest: 'client-request:respond',
      event: 'app:event',
    });
  });
});
