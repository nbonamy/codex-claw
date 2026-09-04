import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AccountRateLimits,
  AgentBackend,
  AgentCreationProgress,
  AgentGitOperationProgress,
  AppCommand,
  AppSnapshot,
  AppSnapshotMetadata,
  BackendConnectionState,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSkillSummary,
  BrowserAnnotation,
  CelebrationKind,
  ClientRequest,
  DesktopUpdateStatus,
  DevicePairingStatus,
  LaunchChatGptAppInput,
  LaunchChatGptAppResult,
  MainToRendererEvent,
  OpenInApplication,
  RendererSendPromptOptions,
  SidePanelGitDiffRequest,
  SidePanelMarkdownRequest,
  WorkBacklogAssignment,
  WorkBacklogAssignmentPolicy,
  WorkBacklogAssignmentStatus,
  WorkRoutingRequest,
} from '../contracts';
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
      listAssignedWorkItems: 'work-provider:assigned-items:list',
      listGlobalWorkItems: 'work-provider:global-items:list',
      listWorkItems: 'work-provider:items:list',
      createWorkItem: 'work-provider:item:create',
      listBackendModels: 'backend:models:list',
      listBackendPlugins: 'backend:plugins:list',
      listBackendSkills: 'backend:skills:list',
      listAgentFiles: 'agent:files:list',
      previewAgentFile: 'agent:file:preview',
      previewSpokenAnnouncementVoice: 'settings:spoken-announcement-voice:preview',
      openAgentGitDiff: 'agent:git-diff:open',
      getAgentGitWorkflow: 'agent:git-workflow:get',
      generateAgentGitMessage: 'agent:git-workflow:message:generate',
      stageAgentGitFiles: 'agent:git-workflow:stage',
      commitAgentGitChanges: 'agent:git-workflow:commit',
      pushAgentGitBranch: 'agent:git-workflow:push',
      createAgentGitBranch: 'agent:git-workflow:branch:create',
      createAgentGitPullRequest: 'agent:git-workflow:pull-request:create',
      mergeAgentGitBranch: 'agent:git-workflow:merge',
      getOpenInApplications: 'open-in:applications:get',
      openAgentPath: 'agent:path:open-in',
      chooseAgentFolder: 'agent:choose-folder',
      chooseCodexBinary: 'codex:binary:choose',
      chooseSourceFolder: 'source-folder:choose',
      listSourceFolders: 'source-folder:folders:list',
      listSourceRepositories: 'source-folder:repositories:list',
      cloneSourceRepository: 'source-folder:repository:clone',
      listSourceBranches: 'source-folder:branches:list',
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
      getAutomationSnapshot: 'automation:snapshot:get',
      getPluginStatus: 'settings:plugin-status:get',
      createAutomation: 'automation:create',
      updateAutomation: 'automation:update',
      runAutomation: 'automation:run',
      clearAutomationHistory: 'automation:history:clear',
      deleteAutomationExecution: 'automation:execution:delete',
      deleteAutomation: 'automation:delete',
      listAgentConversations: 'conversation:list',
      resumeAgentConversation: 'conversation:resume',
      readConversationMessages: 'conversation:messages:read',
      createAgent: 'agent:create',
      createQuickChat: 'agent:quick-chat:create',
      updateAgent: 'agent:update',
      assignWorkItemToAgent: 'agent:work-item:assign',
      removeWorkItemAssignment: 'agent:work-item:unassign',
      duplicateAgent: 'agent:duplicate',
      forkAgent: 'agent:fork',
      moveAgentToTeam: 'agent:move-to-team',
      reorderAgents: 'agent:reorder',
      reorderRepositories: 'repository:reorder',
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
      updateQueuedPrompt: 'agent:update-queued-prompt',
      interruptAgent: 'agent:interrupt',
      deleteMessage: 'message:delete',
      deleteQueuedPrompt: 'agent:delete-queued-prompt',
      editMessage: 'message:edit',
      retryMessage: 'message:retry',
      browserOpen: 'browser:open',
      browserOpenVisualization: 'browser:visualization:open',
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
    type AgentScopedEventContext = {
      agentId: string;
      backend?: AgentBackend;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };
    type OptionalEventContext = {
      agentId?: string;
      backend?: AgentBackend;
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };
    type ClientRequestResolvedEventContext = {
      agentId: string;
      backend: AgentBackend;
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };

    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.sendPrompt]['args']>()
      .toEqualTypeOf<[agentId: string, prompt: string, options?: RendererSendPromptOptions]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.sendPrompt]['result']>()
      .toEqualTypeOf<AppSnapshotMetadata>();
    expectTypeOf<CodexClawIpcEvents[typeof ipcChannels.event]>()
      .toEqualTypeOf<MainToRendererEvent>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'client.connectionChanged' }>['payload']>()
      .toEqualTypeOf<BackendConnectionState>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'backend.statusChanged' }>['payload']>()
      .toEqualTypeOf<BackendRuntimeStatus>();
    expectTypeOf<Pick<Extract<MainToRendererEvent, { type: 'backend.statusChanged' }>, 'backend'>>()
      .toEqualTypeOf<{ backend: AgentBackend }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'account.rateLimitsUpdated' }>['payload']>()
      .toEqualTypeOf<AccountRateLimits | { rateLimits: AccountRateLimits }>();
    expectTypeOf<Pick<Extract<MainToRendererEvent, { type: 'account.rateLimitsUpdated' }>, 'backend'>>()
      .toEqualTypeOf<{ backend: AgentBackend }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'models.changed' }>['payload']>()
      .toEqualTypeOf<{ models: BackendModelOption[] }>();
    expectTypeOf<Pick<Extract<MainToRendererEvent, { type: 'models.changed' }>, 'backend'>>()
      .toEqualTypeOf<{ backend: AgentBackend }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'skills.changed' }>['payload']>()
      .toEqualTypeOf<{
        cwd: string | null;
        status: 'loaded';
        skills: BackendSkillSummary[];
      }>();
    expectTypeOf<Pick<Extract<MainToRendererEvent, { type: 'skills.changed' }>, 'backend'>>()
      .toEqualTypeOf<{ backend: AgentBackend }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'devicePairing.statusChanged' }>['payload']>()
      .toEqualTypeOf<DevicePairingStatus>();
    expectTypeOf<Pick<Extract<MainToRendererEvent, { type: 'devicePairing.statusChanged' }>, 'backend'>>()
      .toEqualTypeOf<{ backend?: AgentBackend }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'sidePanel.markdownRequested' }>['payload']>()
      .toEqualTypeOf<SidePanelMarkdownRequest>();
    expectTypeOf<Pick<
      Extract<MainToRendererEvent, { type: 'sidePanel.markdownRequested' }>,
      keyof AgentScopedEventContext
    >>().toEqualTypeOf<AgentScopedEventContext>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'sidePanel.gitDiffRequested' }>['payload']>()
      .toEqualTypeOf<SidePanelGitDiffRequest>();
    expectTypeOf<Pick<
      Extract<MainToRendererEvent, { type: 'sidePanel.gitDiffRequested' }>,
      keyof AgentScopedEventContext
    >>().toEqualTypeOf<AgentScopedEventContext>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'celebration.requested' }>['payload']>()
      .toEqualTypeOf<{ kind: CelebrationKind }>();
    expectTypeOf<Pick<
      Extract<MainToRendererEvent, { type: 'celebration.requested' }>,
      keyof AgentScopedEventContext
    >>().toEqualTypeOf<AgentScopedEventContext>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'agentCreation.progress' }>['payload']>()
      .toEqualTypeOf<AgentCreationProgress>();
    expectTypeOf<Pick<
      Extract<MainToRendererEvent, { type: 'agentCreation.progress' }>,
      keyof AgentScopedEventContext
    >>().toEqualTypeOf<AgentScopedEventContext>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'git.operationProgress' }>['payload']>()
      .toEqualTypeOf<AgentGitOperationProgress>();
    expectTypeOf<Pick<
      Extract<MainToRendererEvent, { type: 'git.operationProgress' }>,
      keyof AgentScopedEventContext
    >>().toEqualTypeOf<AgentScopedEventContext>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'browser.annotationCreated' }>['payload']>()
      .toEqualTypeOf<BrowserAnnotation>();
    type WorkBacklogAssignmentUpdatedEvent = Extract<
      MainToRendererEvent,
      { type: 'workBacklog.assignmentUpdated' }
    >;
    expectTypeOf<WorkBacklogAssignmentUpdatedEvent['payload']>()
      .toEqualTypeOf<
        Omit<WorkBacklogAssignment, 'policy' | 'status'> & {
          policy?: WorkBacklogAssignmentPolicy;
          status: WorkBacklogAssignmentStatus | 'working';
        }
      >();
    expectTypeOf<Pick<WorkBacklogAssignmentUpdatedEvent, keyof OptionalEventContext>>()
      .toEqualTypeOf<OptionalEventContext>();
    type WorkRoutingRequestedEvent = Extract<MainToRendererEvent, { type: 'workRouting.requested' }>;
    expectTypeOf<WorkRoutingRequestedEvent['payload']>().toEqualTypeOf<WorkRoutingRequest>();
    expectTypeOf<Pick<WorkRoutingRequestedEvent, keyof OptionalEventContext>>()
      .toEqualTypeOf<OptionalEventContext>();
    type WorkRoutingResolvedEvent = Extract<MainToRendererEvent, { type: 'workRouting.resolved' }>;
    expectTypeOf<WorkRoutingResolvedEvent['payload']>().toEqualTypeOf<Pick<WorkRoutingRequest, 'id'>>();
    expectTypeOf<Pick<WorkRoutingResolvedEvent, keyof OptionalEventContext>>()
      .toEqualTypeOf<OptionalEventContext>();
    type ClientRequestResolvedEvent = Extract<MainToRendererEvent, { type: 'clientRequest.resolved' }>;
    expectTypeOf<ClientRequestResolvedEvent['payload']>().toEqualTypeOf<Pick<ClientRequest, 'id'>>();
    expectTypeOf<Pick<ClientRequestResolvedEvent, keyof ClientRequestResolvedEventContext>>()
      .toEqualTypeOf<ClientRequestResolvedEventContext>();
    expectTypeOf<CodexClawIpcEvents[typeof ipcChannels.appCommand]>()
      .toEqualTypeOf<AppCommand>();
    expectTypeOf<CodexClawIpcEvents[typeof ipcChannels.updateStatusChanged]>()
      .toEqualTypeOf<DesktopUpdateStatus>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.launchChatGptApp]['args']>()
      .toEqualTypeOf<[input?: LaunchChatGptAppInput]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.launchChatGptApp]['result']>()
      .toEqualTypeOf<LaunchChatGptAppResult>();
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
