import type {
  AgentBackend,
  AppText,
  ApprovalPreset,
  ReasoningEffort,
} from './contracts/shared';
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

export type CodexApprovalPreset = ApprovalPreset;

export type CodexApprovalsReviewer = 'user' | 'auto_review' | 'guardian_subagent';

export type BackendSession =
  | {
    kind: 'codex';
    threadId: string;
  }
  | {
    kind: 'claude';
    sessionId: string;
    transport: 'stdio' | 'websocket';
    transcriptSessionId?: string;
    serverUrl?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
  };

export type BackendDefaults =
  | {
    kind: 'codex';
    model?: string;
    approvalPreset?: CodexApprovalPreset;
    approvalPolicy?: string;
    approvalsReviewer?: CodexApprovalsReviewer;
    sandboxMode?: string;
    reasoningEffort?: string;
    serviceTier?: string | null;
  }
  | {
    kind: 'claude';
    model?: string;
    reasoningEffort?: ReasoningEffort;
    permissionMode?: string;
    thinking?: {
      type: 'enabled' | 'disabled';
      budgetTokens?: number;
    };
  };

export type CodexThreadSettings = {
  cwd?: string;
  model?: string;
  reasoningEffort?: string;
  serviceTier?: string | null;
  approvalPolicy?: string;
  approvalsReviewer?: CodexApprovalsReviewer;
  sandboxPolicy?: { type: string };
  activePermissionProfile?: { id: string };
};

export type ThreadGoalStatus = 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete';

export type ThreadGoal = {
  threadId: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
};

export type ThreadPlanStepStatus = 'pending' | 'inProgress' | 'completed';
export type ThreadPlanKind = 'execution' | 'proposed';
export type ThreadPlanStatus = 'inProgress' | 'completed' | 'incomplete' | 'interrupted' | 'failed';

export type ThreadPlanStep = {
  step: string;
  status: ThreadPlanStepStatus;
};

export type ThreadPlan = {
  threadId: string;
  turnId: string;
  kind: ThreadPlanKind;
  status: ThreadPlanStatus;
  explanation: string;
  steps: ThreadPlanStep[];
  markdown: string;
  updatedAt: string;
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

export type AgentContextUsage = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  lastTotalTokens: number;
  modelContextWindow: number | null;
  usedPercent: number | null;
};

export type AccountRateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type AccountRateLimits = {
  limitId: string | null;
  limitName: string | null;
  primary: AccountRateLimitWindow | null;
  secondary: AccountRateLimitWindow | null;
  credits: unknown;
  individualLimit: unknown;
  planType: string | null;
  rateLimitReachedType: string | null;
};

export type WorkProviderKind = 'github';

export type WorkIntegrationStatus = 'notConfigured' | 'disconnected' | 'connecting' | 'connected' | 'error';

export type WorkIntegrationConnection = {
  provider: WorkProviderKind;
  status: WorkIntegrationStatus;
  accountLabel?: string;
  detail?: AppText;
  connectedAt?: string;
};

export type WorkProviderSettings = {
  oauthClientId?: string;
};

export type WorkBacklogAssignmentPolicy = 'complete' | 'review';

export type WorkBacklogAssignmentStatus = 'blocked' | 'completed' | 'inProgress' | 'readyForReview';

export type WorkBacklogAssignment = {
  provider: WorkProviderKind;
  itemId: string;
  agentId: string;
  assignedAt: string;
  policy: WorkBacklogAssignmentPolicy;
  status: WorkBacklogAssignmentStatus;
  completedAt?: string;
  note?: string;
  updatedAt?: string;
  automationId?: string;
  automationExecutionId?: string;
  completionInstructionsDeliveredAt?: string;
};

export type GitHubWorkBacklogConfiguration = {
  repositoryId?: string;
  assigneeLogin?: string;
  tagName?: string;
};

export type GitHubWorkBacklogConfigurationInput = {
  repositoryId?: string | null;
  assigneeLogin?: string | null;
  tagName?: string | null;
};

export type WorkBacklogProviderConfigurations = {
  github?: GitHubWorkBacklogConfiguration;
};

export type WorkBacklogConfigurationInput = {
  provider: 'github';
  configuration: GitHubWorkBacklogConfigurationInput;
};

export type WorkBacklogState = {
  connections: WorkIntegrationConnection[];
  providerConfigurations: WorkBacklogProviderConfigurations;
  providerSettings: Partial<Record<WorkProviderKind, WorkProviderSettings>>;
  assignments: Record<string, WorkBacklogAssignment>;
};

export type WorkProviderAuthorization = {
  provider: WorkProviderKind;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
};

export type WorkProviderConnectResult = {
  snapshot: AppSnapshot;
  authorization?: WorkProviderAuthorization;
};

export type WorkRepository = {
  provider: WorkProviderKind;
  id: string;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  isPrivate: boolean;
  updatedAt?: string;
  workItemsUpdatedAt?: string;
};

export type WorkItemLabel = {
  name: string;
  color?: string;
};

export type WorkItemState = 'open' | 'closed';
export type WorkItemKind = 'issue' | 'pullRequest';

export type WorkItemQuery = {
  kind?: WorkItemKind | 'all';
  state?: WorkItemState | 'all';
};

export type GlobalWorkItemQuery = WorkItemQuery & {
  assignment?: 'all' | 'viewer';
  page?: number;
  pageSize?: number;
};

export type WorkItemPage = {
  items: WorkItem[];
  page: number;
  pageSize: number;
  totalItems: number;
};

export type WorkItem = {
  provider: WorkProviderKind;
  id: string;
  kind?: WorkItemKind;
  branchName?: string;
  repositoryId: string;
  repositoryFullName: string;
  number: number;
  title: string;
  url: string;
  state: WorkItemState;
  authorName?: string;
  assignees?: string[];
  body?: string;
  labels: WorkItemLabel[];
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkItemInput = {
  agentId: string;
  provider: WorkProviderKind;
  repositoryId: string;
  description: string;
};

export type AutomationRepositoryTarget = {
  provider: 'github';
  repositoryId: string;
  sourceRepositoryPath: string;
};

export type AutomationSchedule = {
  intervalMinutes: number;
};

export type AutomationExecutionStatus = 'working' | 'completed' | 'failed';

export type BackendConversationRef =
  | {
    backend: 'codex';
    threadId: string;
  }
  | {
    backend: 'claude';
    folder: string;
    sessionId: string;
  };

export type ConversationSummary = {
  id: string;
  sessionId?: string;
  parentConversationId?: string;
  agentNickname?: string;
  agentRole?: string;
  title: string;
  preview?: string;
  status?: 'idle' | 'active' | 'error';
  createdAt?: string;
  updatedAt: string;
  messageCount: number;
  ref: BackendConversationRef;
};

export const subagentStatuses = [
  'pendingInit',
  'running',
  'interrupted',
  'completed',
  'errored',
  'shutdown',
  'notFound',
] as const;
export type SubagentStatus = typeof subagentStatuses[number];

export const subagentOperationKinds = [
  'spawnAgent',
  'sendInput',
  'resumeAgent',
  'wait',
  'closeAgent',
  'sendMessage',
  'followupTask',
  'interruptAgent',
  'listAgents',
] as const;
export type SubagentOperationKind = typeof subagentOperationKinds[number];

export const subagentOperationLifecycles = ['started', 'completed'] as const;
export type SubagentOperationLifecycle = typeof subagentOperationLifecycles[number];

export const subagentOperationStatuses = ['inProgress', 'completed', 'failed', 'interrupted'] as const;
export type SubagentOperationStatus = typeof subagentOperationStatuses[number];

export const subagentActivityKinds = ['started', 'interacted', 'interrupted', 'completed'] as const;
export type SubagentActivityKind = typeof subagentActivityKinds[number];

export type SubagentNode = {
  conversationId: string;
  parentConversationId: string;
  createdAt: string;
  status: SubagentStatus;
  statusMessage?: string;
  agentPath?: string;
  agentNickname?: string;
  agentRole?: string;
  prompt?: string;
  model?: string;
  reasoningEffort?: string;
  updatedAt: string;
};

export type SubagentOperation = {
  id: string;
  turnId?: string;
  lifecycle: SubagentOperationLifecycle;
  kind: SubagentOperationKind;
  status: SubagentOperationStatus;
  senderConversationId: string;
  receiverConversationIds: string[];
  prompt?: string;
  model?: string;
  reasoningEffort?: string;
  occurredAt: string;
};

export type SubagentOperationChange = {
  rootConversationId: string;
  operation: SubagentOperation;
  agentStates: Record<string, { status: SubagentStatus; message?: string }>;
};

export type SubagentActivity = {
  id: string;
  turnId?: string;
  lifecycle: SubagentOperationLifecycle;
  kind: SubagentActivityKind;
  conversationId: string;
  agentPath: string;
  occurredAt: string;
};

export type SubagentActivityChange = {
  rootConversationId: string;
  parentConversationId: string;
  activity: SubagentActivity;
};

export type SubagentStatusChange = {
  rootConversationId: string;
  conversationId: string;
  status: SubagentStatus;
  statusMessage?: string;
};

export type SubagentIdentityChange = {
  rootConversationId: string;
  conversationId: string;
  agentNickname?: string;
  agentRole?: string;
};

export type AgentSubagentTree = {
  rootConversationId: string;
  nodes: Record<string, SubagentNode>;
  operations: Record<string, SubagentOperation>;
  activities: Record<string, SubagentActivity>;
};

export type AutomationExecutionCreatedAgent = {
  agentId: string;
  agentName: string;
  workItemId: string;
  workItemTitle: string;
  workItemUrl: string;
  conversationRef?: BackendConversationRef;
};

export type AutomationExecutionLogEntry = {
  id: string;
  automationId: string;
  startedAt: string;
  completedAt?: string;
  status: AutomationExecutionStatus;
  createdCount: number;
  createdAgents: AutomationExecutionCreatedAgent[];
  error?: string;
};

export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  repositories: AutomationRepositoryTarget[];
  teamId: string;
  selectionPrompt?: string;
  assignmentPrompt?: string;
  schedule: AutomationSchedule;
  executionLog: AutomationExecutionLogEntry[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastError?: string;
  lastCreatedCount?: number;
};

export type AutomationLocation =
  | {
    kind: 'local';
  }
  | {
    kind: 'remote';
    remoteConnectionId: string;
  };

export type CreateAutomationInput = {
  name?: string;
  enabled?: boolean;
  repositories: AutomationRepositoryTarget[];
  teamId: string;
  selectionPrompt?: string;
  assignmentPrompt?: string;
  schedule: AutomationSchedule;
};

export type UpdateAutomationInput = CreateAutomationInput & {
  id: string;
};

export type BackendPlanModeSupport = 'native' | 'prompted' | 'unsupported';

export type BackendCapabilities = {
  attachments: boolean;
  models: boolean;
  skills: boolean;
  reasoningEffort: boolean;
  serviceTier?: boolean;
  thinkingBudget: boolean;
  planMode: BackendPlanModeSupport;
  goals: boolean;
  steerPrompt: boolean;
  interrupt: boolean;
  history: boolean;
  conversationFork?: boolean;
  rollback: boolean;
  editMessage: boolean;
  retryMessage: boolean;
  approvals: boolean;
  approvalPresets?: ApprovalPreset[];
  permissionModes?: BackendPermissionModeOption[];
};

export type BackendPermissionModeOption = {
  id: string;
  label: AppText;
  description: AppText;
  dangerous?: boolean;
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

export type CodexAccount =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string | null; planType: string }
  | { type: 'amazonBedrock'; credentialSource: 'codexManaged' | 'awsManaged' };

export type CodexAuthentication = {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
  login: {
    status: 'idle' | 'starting' | 'pending' | 'completed' | 'cancelled' | 'error';
    error: string | null;
  };
};

export type CodexChatGptLogin = {
  loginId: string;
  authUrl: string;
};

export type ClientState = {
  sourceFolderPath: string;
  /** Agent activity requires sleep prevention regardless of power source. */
  shouldPreventDisplaySleep: boolean;
  /** Remote access requires sleep prevention only while connected to AC power. */
  shouldPreventDisplaySleepForRemoteAccess?: boolean;
};

export type BackendReasoningEffortOption = {
  reasoningEffort: ReasoningEffort;
  description: string;
};

export type BackendServiceTier = {
  id: string;
  name: string;
  description: string;
};

export type BackendModelOption = {
  id: string;
  model: string;
  displayName: string;
  description?: string;
  hidden?: boolean;
  supportedReasoningEfforts?: BackendReasoningEffortOption[];
  defaultReasoningEffort?: ReasoningEffort | null;
  serviceTiers?: BackendServiceTier[];
  defaultServiceTier?: string | null;
  isDefault?: boolean;
  capabilities?: Partial<BackendCapabilities>;
  providerMetadata?: Record<string, unknown>;
};

export type BackendSkillSummary = {
  id?: string;
  name: string;
  description?: string;
  shortDescription?: string;
  displayName?: string;
  iconSmall?: string;
  iconLarge?: string;
  brandColor?: string;
  defaultPrompt?: string;
  path: string;
  scope?: string;
  enabled: boolean;
  providerMetadata?: Record<string, unknown>;
};

export type BackendPluginSummary = {
  id: string;
  name: string;
  displayName: string;
  shortDescription?: string;
  longDescription?: string;
  brandColor?: string;
  iconUrl?: string;
  iconUrlDark?: string;
  enabled: boolean;
};

export type BackendCommandSummary = {
  id: string;
  backend: AgentBackend;
  name: string;
  displayName?: string;
  description?: string;
  slashName?: string;
  submitOnSelect?: boolean;
  providerMetadata?: Record<string, unknown>;
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

export type PromptSkillInput = {
  name: string;
  path: string;
};

export type PromptAttachment =
  | {
    type: 'image';
    path: string;
    detail?: 'auto' | 'low' | 'high' | 'original';
    name?: string;
    mimeType?: string;
    previewUrl?: string;
  }
  | {
    type: 'file';
    path: string;
    name?: string;
    mimeType?: string;
  };

export type RendererPromptAttachment =
  | {
    type: 'image';
    reference: string;
    detail?: 'auto' | 'low' | 'high' | 'original';
  }
  | {
    type: 'file';
    reference: string;
  };

export type SendPromptOptions = {
  attachments?: readonly PromptAttachment[];
  model?: string | null;
  planMode?: boolean;
  reasoningEffort?: ReasoningEffort | null;
  serviceTier?: string | null;
  skills?: PromptSkillInput[];
  inputMethod?: 'typed' | 'dictated';
  backendOptions?: BackendPromptOptions;
};

export type RendererSendPromptOptions = Omit<SendPromptOptions, 'attachments'> & {
  attachments?: readonly RendererPromptAttachment[];
};

export type BackendPromptOptions =
  | {
    kind: 'codex';
    reasoningEffort?: ReasoningEffort | null;
    serviceTier?: string | null;
    skills?: PromptSkillInput[];
  }
  | {
    kind: 'claude';
    thinkingBudgetTokens?: number | null;
    permissionMode?: string | null;
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

export type RendererMessageAttachment = {
  kind: 'file' | 'image';
  name: string;
  path?: string;
  url?: string;
  mimeType?: string;
};

export type RendererMessageMedia = {
  url: string;
  alt?: string;
  mimeType?: string;
  prompt?: string;
  title?: string;
};

export type RendererMessagePart =
  | { type: 'attachment'; attachment: RendererMessageAttachment }
  | { type: 'media'; media: RendererMessageMedia; itemId?: string }
  | { type: 'reasoning'; summary: string; itemId: string; summaryIndex: number }
  | { type: 'text'; text: string; itemId?: string; phase?: 'commentary' | 'final_answer' }
  | {
    type: 'tool';
    id: string;
    kind: string;
    title: string;
    status: 'running' | 'completed' | 'failed';
    statusText?: string;
    body?: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
  }
  | { type: 'status'; text: string };

export type RendererToolPart = Extract<RendererMessagePart, { type: 'tool' }>;

export type RendererToolPartUpdate = {
  itemId: string;
  title?: string;
  status?: RendererToolPart['status'];
  statusText?: string | null;
  body?: string;
  bodyDelta?: string;
  bodyAppend?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  fallbackToolPart?: RendererToolPart;
};

export type RendererMessage = {
  id: string;
  agentId: string;
  kind?: 'compaction' | 'steer';
  role: 'user' | 'assistant' | 'system';
  status: 'complete' | 'streaming' | 'error';
  turnId?: string;
  parts: RendererMessagePart[];
  createdAt: string;
};

export type AgentFileActivity = {
  agentId: string;
  turnId: string;
  messageId: string;
  itemId: string;
  path: string;
  action: 'read' | 'edit' | 'create';
  status: 'running' | 'completed' | 'failed';
  occurredAt: string;
};

export type ConversationFileLink = {
  kind: 'file';
  href: string;
  path: string;
  filepath?: string;
  action?: 'read' | 'edit' | 'create';
  line?: number;
  column?: number;
  turnId?: string;
  messageId?: string;
  itemId?: string;
};

export type AgentQueuedPrompt = {
  id: string;
  agentId: string;
  text: string;
  createdAt: string;
  options?: SendPromptOptions;
  attempts?: number;
  lastError?: string;
  retryAt?: string;
  submitted?: boolean;
};

export type AppSnapshot = {
  teams: Team[];
  agents: Agent[];
  automations: Automation[];
  activeTeamId: string | null;
  activeAgentId: string | null;
  messages: RendererMessage[];
  queuedPrompts?: AgentQueuedPrompt[];
  workRoutingRequests?: WorkRoutingRequest[];
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

/**
 * Application state that can be synchronized without retransmitting cached
 * conversation transcripts. Messages have their own incremental event stream
 * and explicit history-hydration path.
 */
export type AppSnapshotMetadata = Omit<AppSnapshot, 'messages'>;

export type AgentHistoryLoadResult = {
  hasOlder: boolean;
};

export type BackendRuntimeStatus = {
  backend: AgentBackend;
  status: 'notConfigured' | 'starting' | 'running' | 'error';
  detail?: AppText;
  capabilities?: Partial<BackendCapabilities>;
};

export type BackendConnectionState = {
  status: 'connecting' | 'connected' | 'reconnecting' | 'error';
  detail?: AppText;
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
type CodexTurnStartedPayload = {
  status: 'inProgress';
  startedAt: string;
};
type ClaudeTurnStartedPayload = {
  turn: {
    id: string;
    backend: 'claude';
  };
};
type TurnPlanUpdatedPayload = {
  explanation: string | null;
  plan: ThreadPlanStep[];
  markdown?: string;
  status?: 'running' | 'completed';
};
type CodexProposedPlanDeltaPayload = {
  itemId: string;
  delta: string;
  markdown: string;
};
type ClaudeProposedPlanDeltaPayload = Omit<CodexProposedPlanDeltaPayload, 'markdown'>;
type ProposedPlanCompletedPayload = {
  itemId: string;
  markdown: string;
};
type CodexTurnCompletedPayload = {
  status: 'completed' | 'interrupted' | 'failed' | 'inProgress';
  error?: {
    message: string;
    additionalDetails: string | null;
    codexErrorInfo: unknown;
  } | null;
  willRetry?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
};
type ClaudeTurnCompletedPayload = {
  turn: {
    id: string;
    status: 'completed' | 'interrupted';
  };
};
type CompactionPayload = { itemId: string | null } | Record<string, never>;
type ThreadHistoryLoadedPayload = {
  messages: RendererMessage[];
  replace?: boolean;
  preserveKnownTurns?: boolean;
  preserveKnownMessages?: boolean;
  hasOlderMessages?: boolean;
};
type MessageDeltaPayload = {
  delta: string;
  messageId?: string;
  itemId?: string;
  phase?: Extract<RendererMessagePart, { type: 'text' }>['phase'];
};
type MessageSteerPayload = {
  prompt: string;
  attachments?: readonly PromptAttachment[];
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
type RendererToolPartEventPayload = {
  messageId?: string;
  toolPart: RendererToolPart;
};
type RendererToolPartUpdateEventPayload = RendererToolPartUpdate & {
  messageId?: string;
};
type CodexClientRequestEventContext = {
  agentId: string;
  backend: 'codex';
  threadId: string;
  turnId?: string;
};
type ClaudeClientRequestEventContext = {
  agentId: string;
  backend: 'claude';
  backendSessionId?: string;
  turnId: string;
};
type BackendApprovalResolutionReason =
  | 'host'
  | 'server'
  | 'conversation_closed'
  | 'conversation_removed'
  | 'surface_disconnected';
type BackendErrorPayload = {
  message: string;
  willRetry?: boolean;
  error?: unknown;
};
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
      payload: AppSnapshotMetadata;
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
      type: 'workRouting.requested';
      payload: WorkRoutingRequest;
    }>
  | MainToRendererEventWith<{
      type: 'workRouting.resolved';
      payload: Pick<WorkRoutingRequest, 'id'>;
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
      type: 'thread.historyLoaded';
      agentId: string;
      payload: ThreadHistoryLoadedPayload;
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
  | MainToRendererEventWith<TurnEventContext & {
      type: 'turn.started';
      payload: CodexTurnStartedPayload | ClaudeTurnStartedPayload;
    }>
  | MainToRendererEventWith<ThreadTurnEventContext & {
      type: 'turn.planUpdated';
      payload: TurnPlanUpdatedPayload;
    }>
  | MainToRendererEventWith<ThreadTurnEventContext & {
      type: 'turn.proposedPlanDelta';
      payload: CodexProposedPlanDeltaPayload | ClaudeProposedPlanDeltaPayload;
    }>
  | MainToRendererEventWith<ThreadTurnEventContext & {
      type: 'turn.proposedPlanCompleted';
      payload: ProposedPlanCompletedPayload;
    }>
  | MainToRendererEventWith<TurnEventContext & {
      type: 'turn.completed';
      payload: CodexTurnCompletedPayload | ClaudeTurnCompletedPayload;
    }>
  | MainToRendererEventWith<TurnEventContext & {
      type: 'context.compactionStarted';
      payload: CompactionPayload;
    }>
  | MainToRendererEventWith<TurnEventContext & {
      type: 'context.compactionCompleted';
      payload: CompactionPayload;
    }>
  | MainToRendererEventWith<TurnEventContext & {
      type: 'message.delta';
      payload: MessageDeltaPayload;
    }>
  | MainToRendererEventWith<ThreadTurnEventContext & {
      type: 'message.updated';
      payload: { message: RendererMessage };
    }>
  | MainToRendererEventWith<{
      type: 'message.userSubmitted';
      agentId: string;
      payload: { message: RendererMessage };
    }>
  | MainToRendererEventWith<{
      type: 'message.steer';
      agentId: string;
      payload: MessageSteerPayload;
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
  | MainToRendererEventWith<TurnEventContext & {
      type: 'item.started';
      payload: RendererToolPartEventPayload;
    }>
  | MainToRendererEventWith<TurnEventContext & {
      type: 'item.completed';
      payload: RendererToolPartEventPayload;
    }>
  | MainToRendererEventWith<TurnEventContext & {
      type: 'item.updated';
      payload: RendererToolPartUpdateEventPayload;
    }>
  | MainToRendererEventWith<ThreadTurnEventContext & {
      type: 'diff.updated';
      payload: Omit<TurnGitDiff, 'turnId' | 'updatedAt'>;
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
  | MainToRendererEventWith<CodexClientRequestEventContext & {
      type: 'approval.requested';
      payload: Extract<ClientRequest, { kind: 'confirm_tool' }>;
    }>
  | MainToRendererEventWith<ClaudeClientRequestEventContext & {
      type: 'approval.requested';
      payload: Extract<ClientRequest, { kind: 'confirm_tool' }>;
    }>
  | MainToRendererEventWith<CodexClientRequestEventContext & {
      type: 'toolInput.requested';
      payload: Extract<ClientRequest, { kind: 'ask_user' }>;
    }>
  | MainToRendererEventWith<ClaudeClientRequestEventContext & {
      type: 'toolInput.requested';
      payload: Extract<ClientRequest, { kind: 'ask_user' }>;
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
    }>
  | MainToRendererEventWith<{
      type: 'error';
      agentId: string;
      payload: BackendErrorPayload;
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

export type ToolConfirmationDecision =
  | 'allow'
  | 'allow_conversation'
  | 'always_allow'
  | 'deny';

export type ConfirmToolRequest = {
  argumentsPreview: string;
  integrationId: string;
  integrationName: string;
  summary: string;
  toolName: string;
  allowConversation?: boolean;
  allowAlways?: boolean;
};

export type AskUserQuestionOption = {
  label: string;
  description: string;
};

export type AskUserQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  multiSelect?: boolean;
  options: AskUserQuestionOption[] | null;
};

export type AskUserRequest = {
  itemId: string;
  questions: AskUserQuestion[];
};

export type AskUserAnswers = Record<string, { answers: string[] }>;

export type ClientRequest =
  | {
    id: string;
    kind: 'confirm_tool';
    payload: {
      confirmation: ConfirmToolRequest;
    };
  }
  | {
    id: string;
    kind: 'ask_user';
    payload: {
      request: AskUserRequest;
    };
  }
  | WorkRoutingRequest;

export type WorkRoutingMode = 'current' | 'branch' | 'delegate';

export type WorkRoutingResult =
  | { mode: 'cancelled' }
  | { mode: 'current'; folder: string }
  | { mode: 'branch'; branchName: string; folder: string }
  | { mode: 'delegated'; agentId: string; agentName: string; branchName: string; folder: string };

export type WorkRoutingRequest = {
  id: string;
  kind: 'work_routing';
  payload: {
    request: {
      agentId: string;
      task: string;
      suggestedBranchName: string;
      sharedFolderAgentNames: string[];
    };
  };
};

export type ClientRequestResponse = {
  id: string;
  payload?: {
    answers?: AskUserAnswers;
    cancelled?: boolean;
    decision?: ToolConfirmationDecision | null;
    workRouting?: {
      mode: WorkRoutingMode;
      branchName?: string;
    };
  };
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
  createWorkItem(input: CreateWorkItemInput): Promise<WorkItem>;
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
  forkAgent(agentId: string, messageIndex?: number): Promise<AppSnapshot>;
  moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>;
  reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot>;
  reorderRepositories(input: ReorderRepositoriesInput): Promise<AppSnapshot>;
  restartAgent(agentId: string): Promise<AppSnapshot>;
  hydrateAgentHistory(agentId: string): Promise<AppSnapshotMetadata>;
  loadOlderAgentHistory(agentId: string): Promise<AgentHistoryLoadResult>;
  closeAgent(agentId: string, input?: AgentCloseInput): Promise<AppSnapshot>;
  selectAgent(agentId: string): Promise<AppSnapshotMetadata>;
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
  sendPrompt(agentId: string, prompt: string, options?: RendererSendPromptOptions): Promise<AppSnapshotMetadata>;
  steerPrompt(agentId: string, prompt: string, options?: RendererSendPromptOptions): Promise<AppSnapshotMetadata>;
  deleteQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot>;
  steerQueuedPrompt(agentId: string, promptId: string, prompt?: string): Promise<AppSnapshot>;
  updateQueuedPrompt(agentId: string, promptId: string, prompt: string): Promise<AppSnapshot>;
  interruptAgent(agentId: string): Promise<AppSnapshot>;
  deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot>;
  retryMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
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
