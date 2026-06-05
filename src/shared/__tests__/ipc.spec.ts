import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../ipc';

describe('ipc channels', () => {
  it('keeps renderer bridge channels explicit', () => {
    expect(ipcChannels).toStrictEqual({
      getSnapshot: 'app:get-snapshot',
      createAgent: 'agent:create',
      chooseAgentFolder: 'agent:choose-folder',
      updateAgent: 'agent:update',
      duplicateAgent: 'agent:duplicate',
      saveAgentToBench: 'agent:save-to-bench',
      restartAgent: 'agent:restart',
      closeAgent: 'agent:close',
      selectAgent: 'agent:select',
      selectAgentFolder: 'agent:select-folder',
      listCodexModels: 'codex:models:list',
      sendPrompt: 'agent:send-prompt',
      respondToClientRequest: 'client-request:respond',
      event: 'app:event',
    });
  });
});
