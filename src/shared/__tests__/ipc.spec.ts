import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../ipc';

describe('ipc channels', () => {
  it('keeps renderer bridge channels explicit', () => {
    expect(ipcChannels).toStrictEqual({
      getSnapshot: 'app:get-snapshot',
      listBackendModels: 'backend:models:list',
      listBackendSkills: 'backend:skills:list',
      listAgentFiles: 'agent:files:list',
      readAgentFile: 'agent:file:read',
      chooseAgentFolder: 'agent:choose-folder',
      createTeam: 'team:create',
      updateTeam: 'team:update',
      reorderTeams: 'team:reorder',
      closeTeam: 'team:close',
      selectTeam: 'team:select',
      createAgent: 'agent:create',
      updateAgent: 'agent:update',
      duplicateAgent: 'agent:duplicate',
      moveAgentToTeam: 'agent:move-to-team',
      reorderAgents: 'agent:reorder',
      saveAgentToBench: 'agent:save-to-bench',
      deployBenchTemplate: 'bench:deploy-template',
      removeBenchTemplate: 'bench:remove-template',
      restartAgent: 'agent:restart',
      closeAgent: 'agent:close',
      selectAgent: 'agent:select',
      selectAgentFolder: 'agent:select-folder',
      updateSettings: 'settings:update',
      transcribeAppleSpeech: 'transcription:apple-speech',
      quit: 'app:quit',
      setAgentGoal: 'agent:goal:set',
      clearAgentGoal: 'agent:goal:clear',
      setAgentCodexApprovalPreset: 'agent:codex-approval-preset:set',
      sendPrompt: 'agent:send-prompt',
      steerPrompt: 'agent:steer-prompt',
      interruptAgent: 'agent:interrupt',
      deleteMessage: 'message:delete',
      editMessage: 'message:edit',
      retryMessage: 'message:retry',
      respondToClientRequest: 'client-request:respond',
      event: 'app:event',
      appCommand: 'app:command',
    });
  });
});
