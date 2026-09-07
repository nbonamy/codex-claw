import type {
  AgentBackend,
  AppText,
  ApprovalPreset,
} from './contracts/shared';
import type {
  CodexConversationEvent,
  CodexConversationSnapshot,
} from '@codex-app-sdk/core/surface';
import type {
  ClaudeConversationEvent,
  ClaudeConversationSnapshot,
} from './contracts/claude-conversation';
import type {
  AgentCloseInput,
  AgentGitBranchInput,
  AgentGitCommitInput,
  AgentGitDiffSection,
  AgentGitMergeInput,
  AgentGitMessageGenerationInput,
  AgentGitMessageGenerationResult,
  AgentGitOperationProgress,
  AgentGitPullRequestInput,
  AgentGitPushInput,
  AgentGitStageInput,
  AgentGitStatus,
  AgentGitWorkflow,
  AgentPullRequestTracking,
  TurnGitDiff,
} from './contracts/git';
import type {
  AgentFilePreviewResult,
  AgentFileSearchItem,
  AgentWorkspaceIdentity,
  CloneSourceRepositoryInput,
  CreateSourceWorktreeInput,
  SourceBranch,
  SourceFolderListInput,
  SourceFolderListing,
  SourceFolderState,
  SourceRepository,
  SourceWorktree,
} from './contracts/workspace';
import type {
  AddSshConnectionInput,
  DevicePairingSession,
  DevicePairingStatus,
  PairedDevice,
  RemoteConnectionsState,
  SshHostCandidate,
  UpdateRemoteConnectionInput,
} from './contracts/connections';
import type {
  AccountRateLimits,
  BackendConnectionState,
  BackendDefaults,
  BackendModelOption,
  BackendPluginSummary,
  BackendRuntimeStatus,
  BackendSession,
  BackendSkillSummary,
  CodexAuthentication,
  CodexChatGptLogin,
  CodexThreadSettings,
} from './contracts/backend';
import type {
  AgentFileActivity,
  AgentHistoryLoadResult,
  AgentContextUsage,
  AgentQueuedPrompt,
  AgentSubagentTree,
  AskUserAnswers,
  AskUserQuestion,
  AskUserQuestionOption,
  AskUserRequest,
  BackendConversationRef,
  ClientRequest,
  ClientRequestResponse,
  ConfirmToolRequest,
  ConversationSummary,
  PromptAttachment,
  RendererMessage,
  RendererMessagePart,
  RendererSendPromptOptions,
  RendererToolPart,
  RendererToolPartUpdate,
  SendPromptOptions,
  SubagentActivityChange,
  SubagentIdentityChange,
  SubagentOperationChange,
  SubagentStatusChange,
  ThreadGoal,
  ThreadPlan,
  ThreadPlanStep,
  ToolConfirmationDecision,
} from './contracts/conversation';
import type {
  Automation,
  AutomationLocation,
  CreateAutomationInput,
  GlobalWorkItemQuery,
  UpdateAutomationInput,
  WorkBacklogAssignment,
  WorkBacklogAssignmentPolicy,
  WorkBacklogAssignmentStatus,
  WorkBacklogConfigurationInput,
  WorkBacklogState,
  WorkItem,
  WorkItemPage,
  WorkItemQuery,
  WorkProviderAuthorization,
  WorkProviderKind,
  WorkProviderSettings,
  WorkRepository,
} from './contracts/work';

export type {
  AgentBackend,
  AppText,
  AppTextDescriptor,
  ApprovalPreset,
  ReasoningEffort,
} from './contracts/shared';
export type {
  AgentCloseInput,
  AgentGitBranchInput,
  AgentGitCommitInput,
  AgentGitDiff,
  AgentGitDiffScope,
  AgentGitDiffSection,
  AgentGitFile,
  AgentGitMergeInput,
  AgentGitMessageGenerationInput,
  AgentGitMessageGenerationResult,
  AgentGitOperationProgress,
  AgentGitPullRequest,
  AgentGitPullRequestInput,
  AgentGitPushInput,
  AgentGitStageInput,
  AgentGitStatus,
  AgentGitWorkflow,
  AgentPullRequestTracking,
  TurnGitDiff,
} from './contracts/git';
export type {
  AgentFilePreviewResult,
  AgentFileSearchItem,
  AgentWorkspaceIdentity,
  CloneSourceRepositoryInput,
  CreateSourceWorktreeInput,
  SourceBranch,
  SourceFolderEntry,
  SourceFolderListInput,
  SourceFolderListing,
  SourceFolderState,
  SourceRepository,
  SourceWorktree,
} from './contracts/workspace';
export type {
  AddSshConnectionInput,
  DevicePairingSession,
  DevicePairingStatus,
  PairedDevice,
  RemoteConnection,
  RemoteConnectionStatus,
  RemoteConnectionTransport,
  RemoteConnectionsState,
  SshHostCandidate,
  UpdateRemoteConnectionInput,
} from './contracts/connections';
export type {
  AccountRateLimitWindow,
  AccountRateLimits,
  BackendCapabilities,
  BackendCommandSummary,
  BackendConnectionState,
  BackendDefaults,
  BackendModelOption,
  BackendPermissionModeOption,
  BackendPlanModeSupport,
  BackendPluginSummary,
  BackendReasoningEffortOption,
  BackendRuntimeStatus,
  BackendServiceTier,
  BackendSession,
  BackendSkillSummary,
  CodexAccount,
  CodexApprovalPreset,
  CodexApprovalsReviewer,
  CodexAuthentication,
  CodexChatGptLogin,
  CodexThreadSettings,
} from './contracts/backend';
export {
  subagentActivityKinds,
  subagentOperationKinds,
  subagentOperationLifecycles,
  subagentOperationStatuses,
  subagentStatuses,
} from './contracts/conversation';
export type {
  ClaudeConversationEvent,
  ClaudeConversationSnapshot,
  ClaudeConversationTurn,
} from './contracts/claude-conversation';
export type {
  AgentFileActivity,
  AgentHistoryLoadResult,
  AgentContextUsage,
  AgentQueuedPrompt,
  AgentSubagentTree,
  AskUserAnswers,
  AskUserQuestion,
  AskUserQuestionOption,
  AskUserRequest,
  BackendConversationRef,
  BackendPromptOptions,
  ClientRequest,
  ClientRequestResponse,
  ConfirmToolRequest,
  ConversationFileLink,
  ConversationSummary,
  PromptAttachment,
  PromptSkillInput,
  RendererMessage,
  RendererMessageAttachment,
  RendererMessageMedia,
  RendererMessagePart,
  RendererPromptAttachment,
  RendererSendPromptOptions,
  RendererToolPart,
  RendererToolPartUpdate,
  SendPromptOptions,
  SubagentActivity,
  SubagentActivityChange,
  SubagentActivityKind,
  SubagentIdentityChange,
  SubagentNode,
  SubagentOperation,
  SubagentOperationChange,
  SubagentOperationKind,
  SubagentOperationLifecycle,
  SubagentOperationStatus,
  SubagentStatus,
  SubagentStatusChange,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadPlan,
  ThreadPlanKind,
  ThreadPlanStatus,
  ThreadPlanStep,
  ThreadPlanStepStatus,
  ToolConfirmationDecision,
} from './contracts/conversation';
export type {
  Automation,
  AutomationExecutionCreatedAgent,
  AutomationExecutionLogEntry,
  AutomationExecutionStatus,
  AutomationLocation,
  AutomationRepositoryTarget,
  AutomationSchedule,
  CreateAutomationInput,
  GitHubWorkBacklogConfiguration,
  GitHubWorkBacklogConfigurationInput,
  GlobalWorkItemQuery,
  UpdateAutomationInput,
  WorkBacklogAssignment,
  WorkBacklogAssignmentPolicy,
  WorkBacklogAssignmentStatus,
  WorkBacklogConfigurationInput,
  WorkBacklogProviderConfigurations,
  WorkBacklogState,
  WorkIntegrationConnection,
  WorkIntegrationStatus,
  WorkItem,
  WorkItemKind,
  WorkItemLabel,
  WorkItemPage,
  WorkItemQuery,
  WorkItemState,
  WorkProviderAuthorization,
  WorkProviderKind,
  WorkProviderSettings,
  WorkRepository,
} from './contracts/work';

export type AgentStatus =
  | { type: 'idle' }
  | { type: 'starting' }
  | { type: 'working'; detail?: AppText }
  | { type: 'awaitingInput'; detail?: AppText }
  | { type: 'error'; message: AppText };

export type Team = {
  id: string;
  name: string;
  avatar?: string;
  color?: string;
  remoteConnectionId?: string;
  remoteTeamId?: string;
  agentIds: string[];
  activeAgentId?: string;
};

export type BackendApprovalDecision = 'approve' | 'deny';
export type BackendApprovalScope = 'once' | 'session';
export type BackendRequestedPermission =
  | {
    kind: 'filesystem';
    access: 'read' | 'write' | 'deny';
    path: string;
  }
  | {
    kind: 'network';
    enabled: boolean;
    host?: string;
    protocol?: string;
  };
export type BackendApprovalRequest = {
  id: string;
  kind: 'command' | 'file-change' | 'permissions';
  conversationId: string;
  turnId?: string;
  itemId: string;
  title: string;
  description?: string;
  command?: string;
  cwd?: string;
  requestedPermissions?: BackendRequestedPermission[];
  allowedScopes?: BackendApprovalScope[];
  canDeny?: boolean;
};

export type OpenInApplication =
  | 'vscode'
  | 'finder'
  | 'terminal'
  | 'iterm2'
  | 'ghostty'
  | 'xcode'
  | 'android-studio'
  | 'jetbrains';

export type OpenInApplicationOption = {
  id: OpenInApplication;
  label: string;
  iconDataUrl?: string;
};

export type OpenInApplicationCatalog = {
  defaultApplication: OpenInApplication;
  applications: OpenInApplicationOption[];
};

export type Agent = {
  id: string;
  teamId?: string;
  delegatedByAgentId?: string;
  pullRequest?: AgentPullRequestTracking;
  sessionKind?: 'quickChat';
  name: string | null;
  conversationTitle?: string;
  avatar?: string;
  folder: string | null;
  workspace?: AgentWorkspaceIdentity;
  backend: AgentBackend;
  backendSession?: BackendSession;
  backendDefaults?: BackendDefaults;
  openInApplication?: OpenInApplication;
  contextUsage?: AgentContextUsage;
  plan?: ThreadPlan;
  goal?: ThreadGoal;
  isRegistered?: boolean;
  mcpSessionId?: string;
  statusText?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
};

export type WorkProviderConnectResult = {
  snapshot: AppSnapshot;
  authorization?: WorkProviderAuthorization;
};

export type AppearanceMode = 'dark' | 'light' | 'system';

export type AppThemeSettings = {
  id: string;
  mode: AppearanceMode;
  uiFontSize: number;
  chatFontSize: number;
  codeFontSize: number;
};

export type AppPluginSettings = {
  computerUseEnabled: boolean;
  chromeEnabled: boolean;
};

export type AppPluginStatus = {
  chromeEnabled: boolean;
};

export type AppshotHotkey = 'command' | 'option' | 'shift' | 'none';

export type AppshotSettings = {
  hotkey: AppshotHotkey;
  destination: 'active-agent';
  playSound: boolean;
};

export type WorktreeInitializationMode = 'automatic' | 'repository' | 'off';

export type SpokenAnnouncementScope = 'selected' | 'all';

export const spokenAnnouncementVoices = [
  'af_heart',
  'af_bella',
  'af_nicole',
  'af_sarah',
  'am_adam',
  'am_michael',
  'bf_emma',
  'bm_george',
] as const;

export type SpokenAnnouncementVoice = typeof spokenAnnouncementVoices[number];

export type AnnouncementPhase = 'start' | 'finish';

export type SpokenAnnouncementRequest = {
  agentId: string;
  phase: AnnouncementPhase;
  text: string;
  voice: SpokenAnnouncementVoice;
};

export type SpokenAnnouncementQueueResult = {
  queued: boolean;
  reason?: 'suppressed' | 'unsupported' | 'rateLimited' | 'superseded';
};

export type AppGeneralSettings = {
  preventSleepWhenAgentsRun: boolean;
  preventSleepWhenRemoteAccessEnabled: boolean;
  celebrationsEnabled: boolean;
  spokenAnnouncementsEnabled: boolean;
  spokenAnnouncementsMuted: boolean;
  spokenAnnouncementsOnlyForDictatedPrompts: boolean;
  spokenAnnouncementsOnlyWhenFocused: boolean;
  spokenAnnouncementScope: SpokenAnnouncementScope;
  spokenAnnouncementVoice: SpokenAnnouncementVoice;
  codexBinaryPath: string;
  claudeCodeEnabled: boolean;
  agentListCompact: boolean;
  collapsedRepositoryKeys: string[];
  shareCodexSkillsAndPlugins: boolean;
  worktreeInitializationMode: WorktreeInitializationMode;
  repositoryIcons: Record<string, string>;
  appshots: AppshotSettings;
  /** Optional for backwards compatibility with pre-plugin state files. */
  plugins?: AppPluginSettings;
};

export type UpdateGeneralSettingsInput = Partial<Omit<AppGeneralSettings, 'plugins'>> & {
  plugins?: Partial<AppPluginSettings>;
};

export type ClientState = {
  sourceFolderPath: string;
  /** Agent activity requires sleep prevention regardless of power source. */
  shouldPreventDisplaySleep: boolean;
  /** Remote access requires sleep prevention only while connected to AC power. */
  shouldPreventDisplaySleepForRemoteAccess?: boolean;
};

export type SidePanelMarkdownRequest = {
  kind: 'markdown';
  purpose?: 'plan';
  title?: AppText;
  path?: string;
  content: string;
};

export type SidePanelGitDiffRequest = {
  kind: 'gitDiff';
  scope?: 'workingTree' | 'turn';
  title?: AppText;
  subtitle?: AppText | null;
  diff: string;
  sections?: AgentGitDiffSection[];
  state?: 'idle' | 'error';
  error?: string | null;
};

export type SidePanelRequest = SidePanelMarkdownRequest | SidePanelGitDiffRequest;

export type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const PRIMARY_BROWSER_ID = 'primary';

export type BrowserAnnotation = {
  id: string;
  agentId: string;
  browserId: string;
  url: string;
  kind: 'element' | 'area';
  selector?: string;
  label?: string;
  comment?: string;
  rect: { x: number; y: number; width: number; height: number };
};

export type BrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type SystemPermissionsStatus = {
  platform: string;
  accessibility: {
    required: boolean;
    trusted: boolean;
  };
  screenRecording: {
    required: boolean;
    trusted: boolean;
  };
};

export type LaunchChatGptAppInput = {
  quitRunning?: boolean;
};

export type LaunchChatGptAppResult = {
  status: 'alreadyRunning' | 'launched';
};

export type ClawdDaemonStatus = {
  supported: boolean;
  installed: boolean;
  running: boolean;
  socketPath: string;
  launchAgentPath?: string;
  version?: string;
  pid?: number;
  detail?: string;
};

export type UpdateSettingsInput = {
  general?: UpdateGeneralSettingsInput;
  sourceFolder?: Partial<Pick<SourceFolderState, 'path' | 'recentRepoNames'>>;
  theme?: Partial<AppThemeSettings>;
  workProviders?: Partial<Record<WorkProviderKind, WorkProviderSettings>>;
};

export type SetCodexResourceSharingInput =
  | { enabled: true }
  | { enabled: false; mode: 'fresh' | 'copy' | 'keep' };

export type CodexResourceSharingStatus = {
  enabled: boolean;
  migrationRequired: boolean;
};

export type AppSnapshot = {
  teams: Team[];
  agents: Agent[];
  automations: Automation[];
  activeTeamId: string | null;
  activeAgentId: string | null;
  queuedPrompts?: AgentQueuedPrompt[];
  backendApprovals: Record<string, BackendApprovalRequest[]>;
  agentGitStatuses: Record<string, AgentGitStatus>;
  turnGitDiffs: Record<string, TurnGitDiff>;
  subagentTrees: Record<string, AgentSubagentTree>;
  backendRuntimes: BackendRuntimeStatus[];
  accountRateLimits?: AccountRateLimits;
  workBacklog: WorkBacklogState;
  remoteConnections: RemoteConnectionsState;
  general: AppGeneralSettings;
  sourceFolder: SourceFolderState;
  theme: AppThemeSettings;
};

export type RendererSnapshotState = {
  snapshot: AppSnapshot;
  lastBackendEventSeq: number;
  connection: BackendConnectionState;
};

type MainToRendererEventEnvelope = {
  seq: number;
  source?: 'backend' | 'client';
  agentId?: string;
  backend?: AgentBackend;
  backendSessionId?: string;
  snapshot?: AppSnapshot;
  threadId?: string;
  turnId?: string;
  occurredAt: string;
};

type MainToRendererEventWith<Variant> = MainToRendererEventEnvelope & Variant;
type WorkBacklogAssignmentUpdatedPayload = Omit<WorkBacklogAssignment, 'policy' | 'status'> & {
  policy?: WorkBacklogAssignmentPolicy;
  status: WorkBacklogAssignmentStatus | 'working';
};
type AgentUpdatedPayload = Omit<Partial<Agent>, 'id' | 'statusText'> & {
  id: string;
  statusText?: string | null;
};
type ClaudeThreadStartedPayload = {
  sessionId: string;
  transport: 'stdio';
  model?: string;
  reasoningEffort?: string;
};
type ThreadMode = 'default' | 'plan';
type TurnEventContext = {
  agentId: string;
  backend: AgentBackend;
  turnId: string;
};
type ThreadTurnEventContext = TurnEventContext & {
  threadId: string;
};
type AgentPromptQueuedPayload = {
  id: string;
  text: string;
  options?: SendPromptOptions;
  submitted?: boolean;
};
type AgentPromptRetryScheduledPayload = {
  id: string;
  attempts: number;
  lastError: string;
  retryAt?: string;
};
type BackendApprovalResolutionReason =
  | 'host'
  | 'server'
  | 'conversation_closed'
  | 'conversation_removed'
  | 'surface_disconnected';
export type MainToRendererEvent =
  | MainToRendererEventWith<{
      type: 'backend.statusChanged';
      backend: AgentBackend;
      payload: BackendRuntimeStatus;
    }>
  | MainToRendererEventWith<{
      type: 'client.connectionChanged';
      payload: BackendConnectionState;
    }>
  | MainToRendererEventWith<{
      type: 'snapshot.updated';
      payload: AppSnapshot;
    }>
  | MainToRendererEventWith<{
      type: 'account.rateLimitsUpdated';
      backend: AgentBackend;
      payload: AccountRateLimits | { rateLimits: AccountRateLimits };
    }>
  | MainToRendererEventWith<{
      type: 'devicePairing.statusChanged';
      payload: DevicePairingStatus;
    }>
  | MainToRendererEventWith<{
      type: 'models.changed';
      backend: AgentBackend;
      payload: { models: BackendModelOption[] };
    }>
  | MainToRendererEventWith<{
      type: 'skills.changed';
      backend: AgentBackend;
      payload: {
        cwd: string | null;
        status: 'loaded';
        skills: BackendSkillSummary[];
      };
    }>
  | MainToRendererEventWith<{
      type: 'codex.conversationSnapshotChanged';
      agentId: string;
      backend: 'codex';
      threadId: string;
      payload: {
        revision: number;
        snapshot: CodexConversationSnapshot;
      };
    }>
  | MainToRendererEventWith<{
      type: 'codex.conversationEventReceived';
      agentId: string;
      backend: 'codex';
      threadId: string;
      payload: {
        revision: number;
        event: CodexConversationEvent;
      };
    }>
  | MainToRendererEventWith<{
      type: 'claude.conversationSnapshotChanged';
      agentId: string;
      backend: 'claude';
      payload: {
        revision: number;
        snapshot: ClaudeConversationSnapshot;
      };
    }>
  | MainToRendererEventWith<{
      type: 'claude.conversationEventReceived';
      agentId: string;
      backend: 'claude';
      payload: {
        revision: number;
        event: ClaudeConversationEvent;
      };
    }>
  | MainToRendererEventWith<{
      type: 'sidePanel.markdownRequested';
      agentId: string;
      payload: SidePanelMarkdownRequest;
    }>
  | MainToRendererEventWith<{
      type: 'sidePanel.gitDiffRequested';
      agentId: string;
      payload: SidePanelGitDiffRequest;
    }>
  | MainToRendererEventWith<{
      type: 'celebration.requested';
      agentId: string;
      payload: { kind: CelebrationKind };
    }>
  | MainToRendererEventWith<{
      type: 'agentCreation.progress';
      agentId: string;
      payload: AgentCreationProgress;
    }>
  | MainToRendererEventWith<{
      type: 'git.operationProgress';
      agentId: string;
      payload: AgentGitOperationProgress;
    }>
  | MainToRendererEventWith<{
      type: 'browser.annotationCreated';
      payload: BrowserAnnotation;
    }>
  | MainToRendererEventWith<{
      type: 'workBacklog.assignmentUpdated';
      payload: WorkBacklogAssignmentUpdatedPayload;
    }>
  | MainToRendererEventWith<{
      type: 'clientRequest.resolved';
      agentId: string;
      backend: AgentBackend;
      payload: Pick<ClientRequest, 'id'>;
    }>
  | MainToRendererEventWith<{
      type: 'agent.updated';
      agentId: string;
      payload: AgentUpdatedPayload;
    }>
  | MainToRendererEventWith<{
      type: 'agent.statusChanged';
      agentId: string;
      payload: AgentStatus;
    }>
  | MainToRendererEventWith<{
      type: 'thread.started';
      agentId: string;
      backend: 'codex';
      threadId: string;
      payload: { cwd?: string };
    }>
  | MainToRendererEventWith<{
      type: 'thread.started';
      agentId: string;
      backend: 'claude';
      backendSessionId: string;
      payload: ClaudeThreadStartedPayload;
    }>
  | MainToRendererEventWith<{
      type: 'thread.settingsUpdated';
      agentId: string;
      backend: 'codex';
      threadId: string;
      payload: { threadSettings: CodexThreadSettings };
    }>
  | MainToRendererEventWith<{
      type: 'thread.modeUpdated';
      agentId: string;
      backend: 'codex';
      threadId: string;
      payload: { mode: ThreadMode };
    }>
  | MainToRendererEventWith<{
      type: 'thread.modeUpdated';
      agentId: string;
      backend: 'claude';
      turnId: string;
      payload: {
        mode: ThreadMode;
        provider: 'claude';
        permissionMode: string;
      };
    }>
  | MainToRendererEventWith<{
      type: 'thread.goalUpdated';
      agentId: string;
      threadId: string;
      payload: ThreadGoal | { goal: ThreadGoal };
    }>
  | MainToRendererEventWith<{
      type: 'thread.goalCleared';
      agentId: string;
      payload: Record<string, never>;
    }>
  | MainToRendererEventWith<{
      type: 'thread.tokenUsageUpdated';
      agentId: string;
      backend: AgentBackend;
      threadId: string;
      payload: AgentContextUsage | { contextUsage: AgentContextUsage };
    }>
  | MainToRendererEventWith<{
      type: 'thread.historyHydrationFailed';
      agentId: string;
      payload: Record<string, never>;
    }>
  | MainToRendererEventWith<{
      type: 'subagent.operationChanged';
      agentId: string;
      backend: AgentBackend;
      threadId: string;
      payload: SubagentOperationChange;
    }>
  | MainToRendererEventWith<{
      type: 'subagent.activityChanged';
      agentId: string;
      backend: AgentBackend;
      threadId: string;
      payload: SubagentActivityChange;
    }>
  | MainToRendererEventWith<{
      type: 'subagent.identityChanged';
      agentId: string;
      backend: AgentBackend;
      threadId: string;
      payload: SubagentIdentityChange;
    }>
  | MainToRendererEventWith<{
      type: 'subagent.statusChanged';
      agentId: string;
      backend: AgentBackend;
      threadId: string;
      payload: SubagentStatusChange;
    }>
  | MainToRendererEventWith<{
      type: 'agent.promptQueued';
      agentId: string;
      payload: AgentPromptQueuedPayload;
    }>
  | MainToRendererEventWith<{
      type: 'agent.promptRetryScheduled';
      agentId: string;
      payload: AgentPromptRetryScheduledPayload;
    }>
  | MainToRendererEventWith<{
      type: 'agent.promptDequeued';
      agentId: string;
      payload: { ids: string[] };
    }>
  | MainToRendererEventWith<ThreadTurnEventContext & {
      type: 'diff.updated';
      payload: Omit<TurnGitDiff, 'agentId' | 'turnId' | 'updatedAt'>;
    }>
  | MainToRendererEventWith<ThreadTurnEventContext & {
      type: 'file.activity';
      payload: Omit<AgentFileActivity, 'agentId' | 'turnId' | 'occurredAt'>;
    }>
  | MainToRendererEventWith<{
      type: 'git.statusUpdated';
      agentId: string;
      payload: AgentGitStatus;
    }>
  | MainToRendererEventWith<{
      type: 'backendApproval.requested';
      agentId: string;
      backend: 'codex';
      threadId: string;
      turnId?: string;
      payload: { approval: BackendApprovalRequest };
    }>
  | MainToRendererEventWith<{
      type: 'backendApproval.resolved';
      agentId: string;
      backend: 'codex';
      threadId: string;
      turnId?: string;
      payload: {
        approval: BackendApprovalRequest;
        decision: BackendApprovalDecision | null;
        scope: BackendApprovalScope | null;
        reason: BackendApprovalResolutionReason;
      };
    }>;

export type CelebrationKind = 'confetti' | 'stars' | 'shapes' | 'schoolPride';

export type AgentCreationProgress = {
  id: string;
  state: 'running' | 'success' | 'error';
  backend: AgentBackend;
  repositoryName: string;
  createWorktree: boolean;
  branchName?: string;
  hasPrompt: boolean;
  phase?: 'creatingWorktree' | 'initializingWorktree' | 'creatingAgent' | 'startingPrompt';
  initializationDetail?: string;
  agentId?: string;
  agentName?: string;
  error?: string;
};

export type AppCommand =
  | {
    type: 'attach-appshot';
    accessibilityText?: string;
    appName?: string;
    imageDataUrl: string;
    windowTitle?: string;
  }
  | { type: 'appshot-failed'; message: string }
  | { type: 'close-active-agent' }
  | { type: 'close-active-team' }
  | { type: 'cycle-agents'; direction: -1 | 1 }
  | { type: 'cycle-teams' }
  | { type: 'duplicate-active-agent' }
  | { type: 'debug-approval-request' }
  | { type: 'debug-celebrate'; kind: CelebrationKind }
  | { type: 'debug-image-annotation'; imageDataUrl?: string; pixelRatio?: 1 | 2 }
  | { type: 'debug-mark-unread' }
  | { type: 'debug-open-markdown' }
  | { type: 'debug-operation-progress'; kind: 'worktreeInitialization' | 'pullRequest' | 'merge' }
  | { type: 'edit-active-agent' }
  | { type: 'new-team' }
  | { type: 'open-agent-composer'; agentId?: string; prompt?: string; submit?: boolean }
  | { type: 'open-browser'; agentId?: string; browserId?: string; url?: string }
  | { type: 'open-review' }
  | { type: 'open-settings' }
  | { type: 'open-whats-new' }
  | { type: 'quit' }
  | { type: 'restart-active-agent' }
  | { type: 'toggle-spoken-announcements-muted' };

export type CreateAgentInput = {
  name: string | null;
  folder: string;
  avatar?: string;
  backend?: AgentBackend;
  backendDefaults?: BackendDefaults;
  delegatedByAgentId?: string;
  sourceRepositoryName?: string;
  teamId?: string;
};

export type CreateQuickChatInput = {
  teamId?: string;
};

export type CreateTeamInput = {
  name: string;
  color: string;
  remoteConnectionId?: string;
  remoteTeamId?: string;
};

export type UpdateTeamInput = {
  id: string;
  name: string;
  color: string;
  remoteConnectionId?: string;
  remoteTeamId?: string;
};

export type ReorderTeamsInput = {
  teamId: string;
  beforeTeamId: string | null;
};

export type UpdateAgentInput = {
  id: string;
  name: string | null;
};

export type DuplicateAgentOptions = {
  select?: boolean;
  name?: string;
};

export type MoveAgentToTeamInput = {
  agentId: string;
  teamId: string;
};

export type ReorderAgentsInput = {
  teamId: string;
  agentId: string;
  beforeAgentId: string | null;
};

export type ReorderRepositoriesInput = {
  teamId: string;
  repositoryRoot: string;
  beforeRepositoryRoot: string | null;
};

export type DesktopUpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type DesktopUpdateStatus = {
  state: DesktopUpdateState;
  error?: string;
  version?: string;
};

export type CodexClawApi = {
  getSnapshot(): Promise<AppSnapshot>;
  getSnapshotState(): Promise<RendererSnapshotState>;
  listSshHosts(): Promise<SshHostCandidate[]>;
  addSshConnection(input: AddSshConnectionInput): Promise<AppSnapshot>;
  checkRemoteConnection(connectionId: string): Promise<AppSnapshot>;
  updateRemoteConnection(connectionId: string, input: UpdateRemoteConnectionInput): Promise<AppSnapshot>;
  removeRemoteConnection(connectionId: string): Promise<AppSnapshot>;
  getDevicePairingStatus(): Promise<DevicePairingStatus>;
  enableDevicePairing(): Promise<DevicePairingStatus>;
  disableDevicePairing(): Promise<DevicePairingStatus>;
  startDevicePairing(): Promise<DevicePairingSession>;
  checkDevicePairing(session: DevicePairingSession): Promise<boolean>;
  listPairedDevices(environmentId: string): Promise<PairedDevice[]>;
  revokePairedDevice(environmentId: string, clientId: string): Promise<void>;
  connectWorkProvider(provider: WorkProviderKind): Promise<WorkProviderConnectResult>;
  openWorkProviderAuthorization(provider: WorkProviderKind): Promise<AppSnapshot>;
  completeWorkProviderConnection(provider: WorkProviderKind): Promise<AppSnapshot>;
  disconnectWorkProvider(provider: WorkProviderKind): Promise<AppSnapshot>;
  listWorkRepositories(provider: WorkProviderKind, location?: AutomationLocation): Promise<WorkRepository[]>;
  configureWorkBacklog(input: WorkBacklogConfigurationInput, location?: AutomationLocation): Promise<AppSnapshot>;
  listGlobalWorkItems(provider: WorkProviderKind, location?: AutomationLocation, query?: GlobalWorkItemQuery): Promise<WorkItemPage>;
  listAssignedWorkItems?(provider: WorkProviderKind, location?: AutomationLocation): Promise<WorkItem[]>;
  listWorkItems(provider: WorkProviderKind, repositoryId: string, location?: AutomationLocation, query?: WorkItemQuery): Promise<WorkItem[]>;
  listBackendModels(agentId: string): Promise<BackendModelOption[]>;
  listBackendPlugins(agentId: string): Promise<BackendPluginSummary[]>;
  listBackendSkills(agentId: string): Promise<BackendSkillSummary[]>;
  listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]>;
  previewAgentFile(agentId: string, filePath: string): Promise<AgentFilePreviewResult>;
  openAgentGitDiff(agentId: string): Promise<void>;
  getAgentGitWorkflow(agentId: string): Promise<AgentGitWorkflow>;
  generateAgentGitMessage(agentId: string, input: AgentGitMessageGenerationInput): Promise<AgentGitMessageGenerationResult>;
  stageAgentGitFiles(agentId: string, input: AgentGitStageInput): Promise<AgentGitWorkflow>;
  commitAgentGitChanges(agentId: string, input: AgentGitCommitInput): Promise<AgentGitWorkflow>;
  pushAgentGitBranch(agentId: string, input: AgentGitPushInput): Promise<AgentGitWorkflow>;
  createAgentGitBranch(agentId: string, input: AgentGitBranchInput): Promise<AgentGitWorkflow>;
  createAgentGitPullRequest(agentId: string, input: AgentGitPullRequestInput): Promise<AgentGitWorkflow>;
  mergeAgentGitBranch(agentId: string, input: AgentGitMergeInput): Promise<AgentGitWorkflow>;
  getOpenInApplications(): Promise<OpenInApplicationCatalog>;
  openAgentPath(agentId: string, application: OpenInApplication, filePath?: string): Promise<AppSnapshot>;
  chooseAgentFolder(): Promise<string | null>;
  chooseCodexBinary(): Promise<string | null>;
  chooseSourceFolder(): Promise<string | null>;
  listSourceFolders(input?: SourceFolderListInput): Promise<SourceFolderListing>;
  listSourceRepositories(remoteConnectionId?: string): Promise<SourceRepository[]>;
  cloneSourceRepository(input: CloneSourceRepositoryInput): Promise<SourceRepository>;
  listSourceBranches(repoPath: string, remoteConnectionId?: string): Promise<SourceBranch[]>;
  listSourceWorktrees(repoPath: string, remoteConnectionId?: string): Promise<SourceWorktree[]>;
  suggestSourceWorktreePath(input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>): Promise<string>;
  chooseSourceWorktreeDestination(defaultPath: string): Promise<string | null>;
  createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree>;
  createTeam(input: CreateTeamInput): Promise<AppSnapshot>;
  updateTeam(input: UpdateTeamInput): Promise<AppSnapshot>;
  reorderTeams(input: ReorderTeamsInput): Promise<AppSnapshot>;
  closeTeam(teamId: string): Promise<AppSnapshot>;
  disconnectTeam(teamId: string): Promise<AppSnapshot>;
  selectTeam(teamId: string): Promise<AppSnapshot>;
  getAutomationSnapshot(location?: AutomationLocation): Promise<AppSnapshot>;
  createAutomation(input: CreateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot>;
  updateAutomation(input: UpdateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot>;
  runAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  clearAutomationHistory(automationId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  deleteAutomationExecution(automationId: string, executionId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  deleteAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot>;
  listAgentConversations(agentId: string): Promise<ConversationSummary[]>;
  resumeAgentConversation(agentId: string, ref: BackendConversationRef): Promise<AppSnapshot>;
  readConversationMessages(ref: BackendConversationRef, agentId: string, location?: AutomationLocation): Promise<RendererMessage[]>;
  createAgent(input: CreateAgentInput): Promise<AppSnapshot>;
  createQuickChat(input: CreateQuickChatInput): Promise<AppSnapshot>;
  updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>;
  assignWorkItemToAgent(agentId: string, item: WorkItem): Promise<AppSnapshot>;
  removeWorkItemAssignment(item: WorkItem): Promise<AppSnapshot>;
  duplicateAgent(agentId: string, options?: DuplicateAgentOptions): Promise<AppSnapshot>;
  forkAgent(agentId: string, turnId?: string): Promise<AppSnapshot>;
  moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>;
  reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot>;
  reorderRepositories(input: ReorderRepositoriesInput): Promise<AppSnapshot>;
  restartAgent(agentId: string): Promise<AppSnapshot>;
  hydrateAgentHistory(agentId: string): Promise<AppSnapshot>;
  loadOlderAgentHistory(agentId: string): Promise<AgentHistoryLoadResult>;
  closeAgent(agentId: string, input?: AgentCloseInput): Promise<AppSnapshot>;
  selectAgent(agentId: string): Promise<AppSnapshot>;
  updateSettings(input: UpdateSettingsInput): Promise<AppSnapshot>;
  previewSpokenAnnouncementVoice(voice: SpokenAnnouncementVoice): Promise<SpokenAnnouncementQueueResult>;
  getCodexResourceSharingStatus(): Promise<CodexResourceSharingStatus>;
  setCodexResourceSharing(input: SetCodexResourceSharingInput): Promise<AppSnapshot>;
  getPluginStatus(): Promise<AppPluginStatus>;
  getCodexAuthentication(): Promise<CodexAuthentication>;
  cancelCodexChatGptLogin(): Promise<CodexAuthentication>;
  startCodexChatGptLogin(): Promise<CodexChatGptLogin>;
  logoutCodex(): Promise<CodexAuthentication>;
  getUpdateStatus(): Promise<DesktopUpdateStatus>;
  installUpdate(): Promise<void>;
  setDockBadgeCount(count: number): Promise<void>;
  getDaemonStatus(): Promise<ClawdDaemonStatus>;
  setDaemonEnabled(enabled: boolean): Promise<ClawdDaemonStatus>;
  getSystemPermissions(): Promise<SystemPermissionsStatus>;
  openAccessibilitySettings(): Promise<SystemPermissionsStatus>;
  openScreenRecordingSettings(): Promise<SystemPermissionsStatus>;
  launchChatGptApp(input?: LaunchChatGptAppInput): Promise<LaunchChatGptAppResult>;
  quit(): Promise<void>;
  restartApp(): Promise<void>;
  reloadRenderer(): Promise<void>;
  setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot>;
  clearAgentGoal(agentId: string): Promise<AppSnapshot>;
  setAgentApprovalPreset(agentId: string, preset: ApprovalPreset): Promise<AppSnapshot>;
  setAgentPermissionMode(agentId: string, mode: string): Promise<AppSnapshot>;
  sendPrompt(agentId: string, prompt: string, options?: RendererSendPromptOptions): Promise<AppSnapshot>;
  steerPrompt(agentId: string, prompt: string, options?: RendererSendPromptOptions): Promise<AppSnapshot>;
  deleteQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot>;
  steerQueuedPrompt(agentId: string, promptId: string, prompt?: string): Promise<AppSnapshot>;
  updateQueuedPrompt(agentId: string, promptId: string, prompt: string): Promise<AppSnapshot>;
  interruptAgent(agentId: string): Promise<AppSnapshot>;
  deleteTurn(agentId: string, turnId: string): Promise<AppSnapshot>;
  editTurn(agentId: string, turnId: string, content: string): Promise<AppSnapshot>;
  retryTurn(agentId: string, turnId: string): Promise<AppSnapshot>;
  browserOpen(agentId: string, browserId: string, url: string): Promise<BrowserState>;
  browserOpenVisualization(agentId: string, browserId: string, path: string, title: string): Promise<BrowserState>;
  browserNavigate(agentId: string, browserId: string, url: string): Promise<BrowserState>;
  browserGoBack(agentId: string, browserId: string): Promise<BrowserState>;
  browserGoForward(agentId: string, browserId: string): Promise<BrowserState>;
  browserReload(agentId: string, browserId: string): Promise<BrowserState>;
  browserSetBounds(agentId: string, browserId: string, bounds: BrowserBounds): Promise<void>;
  browserSetVisible(agentId: string, browserId: string, visible: boolean): Promise<void>;
  browserSetAnnotationMode(agentId: string, browserId: string, enabled: boolean): Promise<void>;
  browserResolveAnnotation(token: string, comment: string | null): Promise<void>;
  browserClearAnnotations(agentId: string, browserId: string): Promise<void>;
  browserClose(agentId: string, browserId: string): Promise<void>;
  respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>;
  onEvent(listener: (event: MainToRendererEvent) => void): () => void;
  onAppCommand(listener: (command: AppCommand) => void): () => void;
  onUpdateStatusChanged(listener: (status: DesktopUpdateStatus) => void): () => void;
};
