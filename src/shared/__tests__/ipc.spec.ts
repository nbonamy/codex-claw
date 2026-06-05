import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../ipc';

describe('ipc channels', () => {
  it('keeps renderer bridge channels explicit', () => {
    expect(ipcChannels).toStrictEqual({
      getSnapshot: 'app:get-snapshot',
      createAgent: 'agent:create',
      selectAgent: 'agent:select',
      selectAgentFolder: 'agent:select-folder',
      sendPrompt: 'agent:send-prompt',
      event: 'app:event',
    });
  });
});
