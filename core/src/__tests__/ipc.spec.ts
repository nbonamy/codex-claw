import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AccountRateLimits,
  Agent,
  AgentBackend,
  AgentContextUsage,
  AgentCreationProgress,
  AgentFileActivity,
  AgentGitStatus,
  AgentGitOperationProgress,
  AgentStatus,
  AppCommand,
  AppSnapshot, BackendConnectionState,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSkillSummary,
  BrowserAnnotation,
  CelebrationKind, DesktopUpdateStatus,
  DevicePairingStatus,
  LaunchChatGptAppInput,
  LaunchChatGptAppResult,
  MainToRendererEvent,
  OpenInApplication, RendererSendPromptOptions,
  SendPromptOptions,
  SidePanelMarkdownRequest,
  SubagentActivityChange,
  SubagentIdentityChange,
  SubagentOperationChange,
  SubagentStatusChange,
  ThreadGoal, TurnGitDiff,
  WorkBacklogAssignment,
  WorkBacklogAssignmentPolicy,
  WorkBacklogAssignmentStatus
} from '../contracts';
import { ipcChannels, type CodexClawIpcEvents, type CodexClawIpcRequests } from '../ipc';

describe('ipc channels', () => {
  it('keeps renderer bridge channels explicit', () => {
    expect(ipcChannels).toStrictEqual({
      respondToPlanReview: 'agent:plan-review:respond',
      readEngineInstructions: 'settings:instructions:read',
      saveEngineInstructions: 'settings:instructions:save',
      getSnapshot: 'app:get-snapshot',
      getSnapshotState: 'app:get-snapshot-state',
      listSshHosts: 'connections:ssh-hosts:list',
      addSshConnection: 'connections:ssh:add',
      checkRemoteConnection: 'connections:remote:check',
      updateRemoteConnection: 'connections:remote:update',
      removeRemoteConnection: 'connections:remote:remove',
      getRemoteControlStatus: 'connections:device-pairing:status:get',
      enableRemoteControl: 'connections:device-pairing:enable',
      disableRemoteControl: 'connections:device-pairing:disable',
      startDevicePairing: 'connections:device-pairing:start',
      checkDevicePairing: 'connections:device-pairing:check',
      listPairedDevices: 'connections:device-pairing:devices:list',
      revokePairedDevice: 'connections:device-pairing:device:revoke',
      connectWorkProvider: 'work-provider:connect',
      pollWorkProviderAuthorization: 'work-provider:connection-complete',
      disconnectWorkProvider: 'work-provider:disconnect',
      listWorkRepositories: 'work-provider:repositories:list',
      configureWorkBacklog: 'work-provider:backlog:configure',
      listAssignedWorkItems: 'work-provider:assigned-items:list',
      listGlobalWorkItems: 'work-provider:global-items:list',
      listWorkItems: 'work-provider:items:list',
      listBackendModels: 'backend:models:list',
      listBackendPlugins: 'backend:plugins:list',
      listBackendSkills: 'backend:skills:list',
      listAgentFiles: 'agent:files:list',
      previewAgentFile: 'agent:file:preview',
      previewSpokenAnnouncementVoice: 'settings:spoken-announcement-voice:preview',
      getAgentGitDiff: 'agent:git-diff:get',
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
      createSourceRepository: 'source-folder:repository:create',
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
      compressAgentSession: 'conversation:compress',
      readConversationMessages: 'conversation:messages:read',
      createAgent: 'agent:create',
      executeMission: 'mission:execute',
      createMission: 'mission:create',
      deleteMission: 'mission:delete',
      updateMission: 'mission:update',
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
      loadConversationHistory: 'agent:history:hydrate',
      loadOlderAgentHistory: 'agent:history:load-older',
      closeAgent: 'agent:close',
      selectAgent: 'agent:select',
      updateSettings: 'settings:update',
      getCodexResourceSharingStatus: 'settings:codex-resource-sharing:get',
      setCodexResourceSharing: 'settings:codex-resource-sharing:set',
      getCodexAuthentication: 'codex:authentication:get',
      cancelCodexChatGptLogin: 'codex:authentication:chatgpt:cancel',
      startCodexChatGptLogin: 'codex:authentication:chatgpt:start',
      startCodexChatGptDeviceCodeLogin: 'codex:authentication:deviceCode:start',
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
      deleteTurn: 'turn:delete',
      deleteQueuedPrompt: 'agent:delete-queued-prompt',
      editTurn: 'turn:edit',
      retryTurn: 'turn:retry',
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
    type AgentOnlyEventContext = {
      agentId: string;
      backend?: AgentBackend;
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };
    type CodexThreadEventContext = {
      agentId: string;
      backend: 'codex';
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };
    type AgentThreadEventContext = {
      agentId: string;
      backend?: AgentBackend;
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };
    type BackendThreadEventContext = {
      agentId: string;
      backend: AgentBackend;
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };
    type ClaudeSessionEventContext = {
      agentId: string;
      backend: 'claude';
      backendSessionId: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId?: string;
      source?: 'backend' | 'client';
    };
    type ClaudeModeEventContext = {
      agentId: string;
      backend: 'claude';
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId: string;
      source?: 'backend' | 'client';
    };
    type TurnEventContext = {
      agentId: string;
      backend: AgentBackend;
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId: string;
      source?: 'backend' | 'client';
    };
    type ThreadTurnEventContext = {
      agentId: string;
      backend: AgentBackend;
      backendSessionId?: string;
      snapshot?: AppSnapshot;
      threadId?: string;
      turnId: string;
      source?: 'backend' | 'client';
    };

    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.sendPrompt]['args']>()
      .toEqualTypeOf<[agentId: string, prompt: string, options?: RendererSendPromptOptions]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.sendPrompt]['result']>()
      .toEqualTypeOf<AppSnapshot>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.compressAgentSession]['args']>()
      .toEqualTypeOf<[agentId: string]>();
    expectTypeOf<CodexClawIpcRequests[typeof ipcChannels.compressAgentSession]['result']>()
      .toEqualTypeOf<AppSnapshot>();
    expectTypeOf<CodexClawIpcEvents[typeof ipcChannels.event]>()
      .toEqualTypeOf<MainToRendererEvent>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'client.connectionChanged' }>['payload']>()
      .toEqualTypeOf<BackendConnectionState>();
    type SnapshotUpdatedEvent = Extract<MainToRendererEvent, { type: 'snapshot.updated' }>;
    expectTypeOf<SnapshotUpdatedEvent['payload']>().toEqualTypeOf<AppSnapshot>();
    expectTypeOf<Pick<
      SnapshotUpdatedEvent,
      keyof OptionalEventContext
    >>().toEqualTypeOf<OptionalEventContext>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'backend.statusChanged' }>['payload']>()
      .toEqualTypeOf<BackendRuntimeStatus>();
    expectTypeOf<Pick<Extract<MainToRendererEvent, { type: 'backend.statusChanged' }>, 'backend'>>()
      .toEqualTypeOf<{ backend: AgentBackend }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'account.rateLimitsUpdated' }>['payload']>()
      .toEqualTypeOf<{ rateLimits: AccountRateLimits }>();
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
    expectTypeOf<Extract<MainToRendererEvent, { type: 'remoteControl.statusChanged' }>['payload']>()
      .toEqualTypeOf<DevicePairingStatus>();
    expectTypeOf<Pick<Extract<MainToRendererEvent, { type: 'remoteControl.statusChanged' }>, 'backend'>>()
      .toEqualTypeOf<{ backend?: AgentBackend }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'client.markdownDisplayRequested' }>['payload']>()
      .toEqualTypeOf<SidePanelMarkdownRequest>();
    expectTypeOf<Pick<
      Extract<MainToRendererEvent, { type: 'client.markdownDisplayRequested' }>,
      keyof AgentScopedEventContext
    >>().toEqualTypeOf<AgentScopedEventContext>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'plan.readyForReview' }>['payload']>()
      .toEqualTypeOf<{ markdown: string; itemId?: string }>();
    expectTypeOf<Extract<MainToRendererEvent, { type: 'client.celebrationRequested' }>['payload']>()
      .toEqualTypeOf<{ kind: CelebrationKind }>();
    expectTypeOf<Pick<
      Extract<MainToRendererEvent, { type: 'client.celebrationRequested' }>,
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
      { type: 'workItem.assignmentUpdated' }
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
    expectTypeOf<Extract<MainToRendererEvent, { type: 'clientRequest.resolved' }>>().toEqualTypeOf<never>();
    type AgentUpdatedEvent = Extract<MainToRendererEvent, { type: 'agent.updated' }>;
    expectTypeOf<AgentUpdatedEvent['payload']>()
      .toEqualTypeOf<
        Omit<Partial<Agent>, 'id' | 'statusText'> & {
          id: string;
          statusText?: string | null;
        }
      >();
    expectTypeOf<Pick<AgentUpdatedEvent, keyof AgentOnlyEventContext>>()
      .toEqualTypeOf<AgentOnlyEventContext>();
    type AgentStatusChangedEvent = Extract<MainToRendererEvent, { type: 'agent.statusChanged' }>;
    expectTypeOf<AgentStatusChangedEvent['payload']>().toEqualTypeOf<AgentStatus>();
    expectTypeOf<Pick<AgentStatusChangedEvent, keyof AgentOnlyEventContext>>()
      .toEqualTypeOf<AgentOnlyEventContext>();
    type ThreadStartedEvent = Extract<MainToRendererEvent, { type: 'agent.conversationAttached' }>;
    expectTypeOf<ThreadStartedEvent['payload']>().toEqualTypeOf<{ cwd?: string }>();
    expectTypeOf<ThreadStartedEvent['conversationId']>().toEqualTypeOf<string>();
    expectTypeOf<ThreadStartedEvent['backend']>().toEqualTypeOf<AgentBackend>();
    type ThreadSettingsUpdatedEvent = Extract<MainToRendererEvent, { type: 'conversation.settingsUpdated' }>;
    expectTypeOf<ThreadSettingsUpdatedEvent['payload']>()
      .toEqualTypeOf<{ settings: import('../contracts/events').ConversationSettings }>();
    type ThreadModeUpdatedEvent = Extract<MainToRendererEvent, { type: 'conversation.modeUpdated' }>;
    expectTypeOf<ThreadModeUpdatedEvent['payload']>().toEqualTypeOf<{ mode: 'default' | 'plan'; permissionMode?: string }>();
    expectTypeOf<ThreadModeUpdatedEvent['backend']>().toEqualTypeOf<AgentBackend>();
    type ThreadGoalUpdatedEvent = Extract<MainToRendererEvent, { type: 'conversation.goalUpdated' }>;
    expectTypeOf<ThreadGoalUpdatedEvent['payload']>()
      .toEqualTypeOf<{ goal: ThreadGoal }>();
    expectTypeOf<Pick<ThreadGoalUpdatedEvent, keyof AgentThreadEventContext>>()
      .toEqualTypeOf<AgentThreadEventContext>();
    type ThreadGoalClearedEvent = Extract<MainToRendererEvent, { type: 'conversation.goalCleared' }>;
    expectTypeOf<ThreadGoalClearedEvent['payload']>().toEqualTypeOf<Record<string, never>>();
    expectTypeOf<Pick<ThreadGoalClearedEvent, keyof AgentOnlyEventContext>>()
      .toEqualTypeOf<AgentOnlyEventContext>();
    type ThreadTokenUsageUpdatedEvent = Extract<MainToRendererEvent, { type: 'conversation.contextUsageUpdated' }>;
    expectTypeOf<ThreadTokenUsageUpdatedEvent['payload']>()
      .toEqualTypeOf<{ contextUsage: AgentContextUsage }>();
    expectTypeOf<Pick<ThreadTokenUsageUpdatedEvent, keyof BackendThreadEventContext>>()
      .toEqualTypeOf<BackendThreadEventContext>();
    type SubagentOperationChangedEvent = Extract<MainToRendererEvent, { type: 'subagent.operationChanged' }>;
    expectTypeOf<SubagentOperationChangedEvent['payload']>().toEqualTypeOf<SubagentOperationChange>();
    expectTypeOf<Pick<SubagentOperationChangedEvent, keyof BackendThreadEventContext>>()
      .toEqualTypeOf<BackendThreadEventContext>();
    type SubagentActivityChangedEvent = Extract<MainToRendererEvent, { type: 'subagent.activityChanged' }>;
    expectTypeOf<SubagentActivityChangedEvent['payload']>().toEqualTypeOf<SubagentActivityChange>();
    expectTypeOf<Pick<SubagentActivityChangedEvent, keyof BackendThreadEventContext>>()
      .toEqualTypeOf<BackendThreadEventContext>();
    type SubagentIdentityChangedEvent = Extract<MainToRendererEvent, { type: 'subagent.identityChanged' }>;
    expectTypeOf<SubagentIdentityChangedEvent['payload']>().toEqualTypeOf<SubagentIdentityChange>();
    expectTypeOf<Pick<SubagentIdentityChangedEvent, keyof BackendThreadEventContext>>()
      .toEqualTypeOf<BackendThreadEventContext>();
    type SubagentStatusChangedEvent = Extract<MainToRendererEvent, { type: 'subagent.statusChanged' }>;
    expectTypeOf<SubagentStatusChangedEvent['payload']>().toEqualTypeOf<SubagentStatusChange>();
    expectTypeOf<Pick<SubagentStatusChangedEvent, keyof BackendThreadEventContext>>()
      .toEqualTypeOf<BackendThreadEventContext>();
    type AgentPromptQueuedEvent = Extract<MainToRendererEvent, { type: 'agent.promptQueued' }>;
    expectTypeOf<AgentPromptQueuedEvent['payload']>().toEqualTypeOf<{
      id: string;
      text: string;
      options?: SendPromptOptions;
      submitted?: boolean;
    }>();
    expectTypeOf<Pick<AgentPromptQueuedEvent, keyof AgentOnlyEventContext>>()
      .toEqualTypeOf<AgentOnlyEventContext>();
    type AgentPromptRetryScheduledEvent = Extract<MainToRendererEvent, { type: 'agent.promptRetryScheduled' }>;
    expectTypeOf<AgentPromptRetryScheduledEvent['payload']>().toEqualTypeOf<{
      id: string;
      attempts: number;
      lastError: string;
      retryAt?: string;
    }>();
    expectTypeOf<Pick<AgentPromptRetryScheduledEvent, keyof AgentOnlyEventContext>>()
      .toEqualTypeOf<AgentOnlyEventContext>();
    type AgentPromptDequeuedEvent = Extract<MainToRendererEvent, { type: 'agent.promptDequeued' }>;
    expectTypeOf<AgentPromptDequeuedEvent['payload']>().toEqualTypeOf<{ ids: string[] }>();
    expectTypeOf<Pick<AgentPromptDequeuedEvent, keyof AgentOnlyEventContext>>()
      .toEqualTypeOf<AgentOnlyEventContext>();
    type DiffUpdatedEvent = Extract<MainToRendererEvent, { type: 'conversation.turnDiffUpdated' }>;
    expectTypeOf<DiffUpdatedEvent['payload']>()
      .toEqualTypeOf<Omit<TurnGitDiff, 'agentId' | 'turnId' | 'updatedAt'>>();
    expectTypeOf<Pick<DiffUpdatedEvent, keyof ThreadTurnEventContext>>()
      .toEqualTypeOf<ThreadTurnEventContext>();
    type FileActivityEvent = Extract<MainToRendererEvent, { type: 'workspace.fileActivityDetected' }>;
    expectTypeOf<FileActivityEvent['payload']>()
      .toEqualTypeOf<Omit<AgentFileActivity, 'agentId' | 'turnId' | 'occurredAt'>>();
    expectTypeOf<Pick<FileActivityEvent, keyof ThreadTurnEventContext>>()
      .toEqualTypeOf<ThreadTurnEventContext>();
    type GitStatusUpdatedEvent = Extract<MainToRendererEvent, { type: 'git.statusUpdated' }>;
    expectTypeOf<GitStatusUpdatedEvent['payload']>().toEqualTypeOf<AgentGitStatus>();
    expectTypeOf<Pick<GitStatusUpdatedEvent, keyof AgentOnlyEventContext>>()
      .toEqualTypeOf<AgentOnlyEventContext>();
    type BackendApprovalRequestedEvent = Extract<MainToRendererEvent, { type: 'agentRequest.created' }>;
    expectTypeOf<BackendApprovalRequestedEvent['payload']>()
      .toEqualTypeOf<{ request: import('../agent-request').AgentRequest }>();
    expectTypeOf<Pick<BackendApprovalRequestedEvent, keyof BackendThreadEventContext>>()
      .toEqualTypeOf<BackendThreadEventContext>();
    type BackendApprovalResolvedEvent = Extract<MainToRendererEvent, { type: 'agentRequest.resolved' }>;
    expectTypeOf<BackendApprovalResolvedEvent['payload']>().toEqualTypeOf<{
      id: string; outcome: import('../agent-request').AgentRequestOutcome;
    }>();
    expectTypeOf<Pick<BackendApprovalResolvedEvent, keyof BackendThreadEventContext>>()
      .toEqualTypeOf<BackendThreadEventContext>();
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
