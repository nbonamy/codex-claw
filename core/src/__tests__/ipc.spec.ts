import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AppCommand, AppSnapshot, AppSnapshotMetadata, DesktopUpdateStatus, MainToRendererEvent, OpenInApplication, RendererSendPromptOptions } from '../contracts';
import { ipcChannels, type CodexClawIpcEvents, type CodexClawIpcRequests } from '../ipc';

describe('ipc channels', () => {
  it('keeps renderer bridge channels explicit', () => {
    expect(ipcChannels).toStrictEqual({
      getSnapshot: 'app:get-snapshot',
      getSnapshotState: 'app:get-snapshot-state',
      listSshHosts: 'connections:ssh-hosts:list',
      addSshConnection: 'connections:ssh:add',
      checkRemoteConnection: 'connections:remote:check',
      updateRemoteConnection: 'connections:remote:update',
      removeRemoteConnection: 'connections:remote:remove',
      getDevicePairingStatus: 'connections:device-pairing:status:get',
      enableDevicePairing: 'connections:device-pairing:enable',
      disableDevicePairing: 'connections:device-pairing:disable',
      startDevicePairing: 'connections:device-pairing:start',
      checkDevicePairing: 'connections:device-pairing:check',
      listPairedDevices: 'connections:device-pairing:devices:list',
      revokePairedDevice: 'connections:device-pairing:device:revoke',
      connectWorkProvider: 'work-provider:connect',
      openWorkProviderAuthorization: 'work-provider:authorization:open',
      completeWorkProviderConnection: 'work-provider:connection-complete',
      disconnectWorkProvider: 'work-provider:disconnect',
      listWorkRepositories: 'work-provider:repositories:list',
      configureWorkBacklog: 'work-provider:backlog:configure',
      listWorkItems: 'work-provider:items:list',
      listBackendModels: 'backend:models:list',
      listBackendPlugins: 'backend:plugins:list',
      listBackendSkills: 'backend:skills:list',
      listAgentFiles: 'agent:files:list',
      previewAgentFile: 'agent:file:preview',
      openAgentGitDiff: 'agent:git-diff:open',
      getAgentGitWorkflow: 'agent:git-workflow:get',
      stageAgentGitFiles: 'agent:git-workflow:stage',
      commitAgentGitChanges: 'agent:git-workflow:commit',
      pushAgentGitBranch: 'agent:git-workflow:push',
      createAgentGitPullRequest: 'agent:git-workflow:pull-request:create',
      mergeAgentGitBranch: 'agent:git-workflow:merge',
      getOpenInApplications: 'open-in:applications:get',
      openAgentPath: 'agent:path:open-in',
      chooseAgentFolder: 'agent:choose-folder',
      chooseCodexBinary: 'codex:binary:choose',
      chooseSourceFolder: 'source-folder:choose',
      listSourceFolders: 'source-folder:folders:list',
      listSourceRepositories: 'source-folder:repositories:list',
      listSourceWorktrees: 'source-folder:worktrees:list',
      suggestSourceWorktreePath: 'source-folder:worktree-path:suggest',
      chooseSourceWorktreeDestination: 'source-folder:worktree-destination:choose',
      createSourceWorktree: 'source-folder:worktree:create',
      createTeam: 'team:create',
      updateTeam: 'team:update',
      reorderTeams: 'team:reorder',
      closeTeam: 'team:close',
      disconnectTeam: 'team:disconnect',
      selectTeam: 'team:select',
      getBenchSnapshot: 'bench:snapshot:get',
      getLoopSnapshot: 'loop:snapshot:get',
      getPluginStatus: 'settings:plugin-status:get',
      createLoop: 'loop:create',
      updateLoop: 'loop:update',
      runLoop: 'loop:run',
      clearLoopHistory: 'loop:history:clear',
      deleteLoopExecution: 'loop:execution:delete',
      deleteLoop: 'loop:delete',
      listAgentConversations: 'conversation:list',
      resumeAgentConversation: 'conversation:resume',
      readConversationMessages: 'conversation:messages:read',
      createAgent: 'agent:create',
      updateAgent: 'agent:update',
      assignWorkItemToAgent: 'agent:work-item:assign',
      removeWorkItemAssignment: 'agent:work-item:unassign',
      duplicateAgent: 'agent:duplicate',
      forkAgent: 'agent:fork',
      moveAgentToTeam: 'agent:move-to-team',
      reorderAgents: 'agent:reorder',
      saveAgentToBench: 'agent:save-to-bench',
      deployBenchTemplate: 'bench:deploy-template',
      removeBenchTemplate: 'bench:remove-template',
      restartAgent: 'agent:restart',
      hydrateAgentHistory: 'agent:history:hydrate',
      loadOlderAgentHistory: 'agent:history:load-older',
      closeAgent: 'agent:close',
      selectAgent: 'agent:select',
      updateSettings: 'settings:update',
      getCodexResourceSharingStatus: 'settings:codex-resource-sharing:get',
      setCodexResourceSharing: 'settings:codex-resource-sharing:set',
      getCodexAuthentication: 'codex:authentication:get',
      cancelCodexChatGptLogin: 'codex:authentication:chatgpt:cancel',
      startCodexChatGptLogin: 'codex:authentication:chatgpt:start',
      logoutCodex: 'codex:authentication:logout',
      getUpdateStatus: 'app:update-status:get',
      installUpdate: 'app:update:install',
      setDockBadgeCount: 'app:dock-badge:set',
      getDaemonStatus: 'daemon:status:get',
      setDaemonEnabled: 'daemon:enabled:set',
      getSystemPermissions: 'system-permissions:get',
      openAccessibilitySettings: 'system-permissions:accessibility:open',
      openScreenRecordingSettings: 'system-permissions:screen-recording:open',
      launchChatGptApp: 'chatgpt:app:launch',
      quit: 'app:quit',
      restartApp: 'app:restart',
      reloadRenderer: 'app:renderer:reload',
      setAgentGoal: 'agent:goal:set',
      clearAgentGoal: 'agent:goal:clear',
      setAgentApprovalPreset: 'agent:approval-preset:set',
      setAgentPermissionMode: 'agent:permission-mode:set',
      sendPrompt: 'agent:send-prompt',
      steerPrompt: 'agent:steer-prompt',
      steerQueuedPrompt: 'agent:steer-queued-prompt',
      interruptAgent: 'agent:interrupt',
      deleteMessage: 'message:delete',
      deleteQueuedPrompt: 'agent:delete-queued-prompt',
      editMessage: 'message:edit',
      retryMessage: 'message:retry',
      browserOpen: 'browser:open',
      browserNavigate: 'browser:navigate',
      browserGoBack: 'browser:go-back',
      browserGoForward: 'browser:go-forward',
      browserReload: 'browser:reload',
      browserSetBounds: 'browser:bounds:set',
      browserSetVisible: 'browser:visible:set',
      browserSetAnnotationMode: 'browser:annotation-mode:set',
      browserResolveAnnotation: 'browser:annotation:resolve',
      browserClearAnnotations: 'browser:annotations:clear',
      browserClose: 'browser:close',
      respondToClientRequest: 'client-request:respond',
      event: 'app:event',
      appCommand: 'app:command',
      updateStatusChanged: 'app:update-status-changed',
    });
  });

  it('derives request and event payloads from the preload API contract', () => {
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.sendPrompt]['args']>()
      .toEqualTypeOf<[agentId: string, prompt: string, options?: RendererSendPromptOptions]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.sendPrompt]['result']>()
      .toEqualTypeOf<AppSnapshotMetadata>();
    expectTypeOf<CodexClawIpcEvents[typeof ipcChannels.event]>()
      .toEqualTypeOf<MainToRendererEvent>();
    expectTypeOf<CodexClawIpcEvents[typeof ipcChannels.appCommand]>()
      .toEqualTypeOf<AppCommand>();
    expectTypeOf<CodexClawIpcEvents[typeof ipcChannels.updateStatusChanged]>()
      .toEqualTypeOf<DesktopUpdateStatus>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.launchChatGptApp]['args']>()
      .toEqualTypeOf<[]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.launchChatGptApp]['result']>()
      .toEqualTypeOf<void>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.openAgentPath]['args']>()
      .toEqualTypeOf<[agentId: string, application: OpenInApplication, filePath?: string]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.openAgentPath]['result']>()
      .toEqualTypeOf<AppSnapshot>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.setDockBadgeCount]['args']>()
      .toEqualTypeOf<[count: number]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.setDockBadgeCount]['result']>()
      .toEqualTypeOf<void>();
  });
});
