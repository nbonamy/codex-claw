export type AppTextDescriptor = {
  key: string;
  params?: Record<string, string | number>;
};

export type AppText = string | AppTextDescriptor;

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

export type AgentBackend = 'codex' | 'claude';

export type ApprovalPreset = 'ask-for-approval' | 'approve-for-me' | 'full-access';
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

export type AgentWorkspaceIdentity =
  | {
      kind: 'git';
      folder: string;
      repositoryName: string;
      repositoryRoot: string;
      branch: string | null;
      isLinkedWorktree: boolean;
      primaryWorktreeRoot: string;
      originUrl?: string;
      updatedAt: string;
    }
  | {
      kind: 'folder';
      folder: string;
      label: string;
      updatedAt: string;
    };

export type Agent = {
  id: string;
  teamId?: string;
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

export type AutomationSourceConfiguration =
  | {
    provider: 'github';
    repositoryId: string;
    assigneeLogin?: string;
    tagName?: string;
  };

export type AutomationTeamTarget =
  | {
    mode: 'existing';
    teamId: string;
  }
  | {
    mode: 'dedicated';
  };

export type AutomationAction =
  | {
    type: 'create-agent';
    sourceRepositoryPath: string;
    backend?: AgentBackend;
    backendDefaults?: BackendDefaults;
    teamTarget: AutomationTeamTarget;
    cleanup?: AutomationCleanup;
  }
  | {
    type: 'create-agent-from-bench';
    benchTemplateId: string;
    teamTarget: AutomationTeamTarget;
    cleanup?: AutomationCleanup;
  };

export type AutomationCleanup = {
  deleteAgent?: boolean;
  deleteTeam?: boolean;
};

export type AutomationInstructions = {
  assignment?: string;
  beforeCompletion?: string;
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

export type SubagentStatus =
  | 'pendingInit'
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'errored'
  | 'shutdown'
  | 'notFound';

export type SubagentOperationKind = 'spawnAgent' | 'sendInput' | 'resumeAgent' | 'wait' | 'closeAgent';
export type SubagentOperationLifecycle = 'started' | 'completed';
export type SubagentOperationStatus = 'inProgress' | 'completed' | 'failed';
export type SubagentActivityKind = 'started' | 'interacted' | 'interrupted';

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
  source: AutomationSourceConfiguration;
  action: AutomationAction;
  instructions: AutomationInstructions;
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

export type BenchLocation = AutomationLocation;

export type CreateAutomationInput = {
  name?: string;
  enabled?: boolean;
  source: AutomationSourceConfiguration;
  action: AutomationAction;
  instructions?: AutomationInstructions;
};

export type UpdateAutomationInput = CreateAutomationInput & {
  id: string;
};

export type BenchTemplate = {
  id: string;
  name: string;
  avatar?: string;
  folder: string;
  backend: AgentBackend;
  backendDefaults?: BackendDefaults;
  createdAt: string;
  updatedAt: string;
};

export type CreateBenchTemplateInput = {
  name: string;
  avatar?: string;
  folder: string;
  backend: AgentBackend;
  backendDefaults?: BackendDefaults;
};

export type DeployBenchTemplateInput = {
  templateId: string;
  teamId?: string;
};

export type RemoveBenchTemplateInput = {
  templateId: string;
  teamId?: string;
};

export type ReasoningEffort = string;

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

export type AnnouncementPhase = 'start' | 'finish';

export type SpokenAnnouncementRequest = {
  agentId: string;
  phase: AnnouncementPhase;
  text: string;
};

export type SpokenAnnouncementQueueResult = {
  queued: boolean;
  reason?: 'unsupported' | 'rateLimited' | 'superseded';
};

export type AppGeneralSettings = {
  preventSleepWhenAgentsRun: boolean;
  preventSleepWhenRemoteAccessEnabled: boolean;
  celebrationsEnabled: boolean;
  spokenAnnouncementsEnabled: boolean;
  spokenAnnouncementScope: SpokenAnnouncementScope;
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

export type SshHostCandidate = {
  host: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  configPath?: string;
  line?: number;
};

export type RemoteConnectionStatus = 'saved' | 'checking' | 'ready' | 'error';

export type RemoteConnectionTransport = {
  type: 'ssh-stdio';
  command: 'ssh';
  args: string[];
};

export type RemoteConnection = {
  id: string;
  kind: 'ssh';
  name: string;
  host: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  status: RemoteConnectionStatus;
  detail?: string;
  sourceFolderPath?: string;
  transport?: RemoteConnectionTransport;
  installedAt?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteConnectionsState = {
  connections: RemoteConnection[];
};

export type DevicePairingStatus = {
  status: 'disabled' | 'connecting' | 'connected' | 'errored';
  serverName?: string;
  installationId?: string;
  environmentId?: string | null;
  allowRemoteControl?: boolean | null;
  detail?: string;
};

export type DevicePairingSession = {
  pairingCode: string;
  manualPairingCode?: string | null;
  environmentId: string;
  expiresAt: string;
};

export type PairedDevice = {
  clientId: string;
  displayName?: string | null;
  deviceType?: string | null;
  platform?: string | null;
  osVersion?: string | null;
  deviceModel?: string | null;
  appVersion?: string | null;
  lastSeenAt?: string | null;
};

export type AddSshConnectionInput = SshHostCandidate & {
  name?: string;
};

export type UpdateRemoteConnectionInput = {
  sourceFolderPath?: string;
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

export type AgentFileSearchItem = {
  name: string;
  path: string;
};

export type AgentFilePreviewResult = {
  path: string;
  size: number;
  kind: 'text' | 'image' | 'binary' | 'tooLarge';
  content?: string;
  dataUrl?: string;
  mimeType?: string;
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
  subtitle?: AppText;
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

export type SourceWorktree = {
  name: string;
  path: string;
};

export type SourceBranch = {
  name: string;
  isDefault: boolean;
  worktreePath?: string;
};

export type SourceRepository = {
  name: string;
  path: string;
  remoteIdentity?: string;
  worktrees: SourceWorktree[];
};

export type CloneSourceRepositoryInput = {
  url: string;
  remoteConnectionId?: string;
};

export type SourceFolderEntry = {
  name: string;
  path: string;
};

export type SourceFolderListing = {
  path: string;
  parentPath: string | null;
  entries: SourceFolderEntry[];
};

export type SourceFolderListInput = {
  path?: string;
  remoteConnectionId?: string;
};

export type SourceFolderState = {
  path: string;
  initialized: boolean;
  recentRepoNames: string[];
};

export type CreateSourceWorktreeInput = {
  repoPath: string;
  branchName: string;
  baseBranch?: string;
  destinationPath?: string;
  reuseExisting?: boolean;
  remoteConnectionId?: string;
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
  | { type: 'text'; text: string; itemId?: string }
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

export type AgentGitStatus = {
  folder: string;
  repository?: string;
  githubRepository?: string;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  changedFiles: number;
  addedLines: number;
  removedLines: number;
  hasUntracked: boolean;
  state: 'clean' | 'dirty' | 'unknown';
  updatedAt: string;
  error?: string;
};

export type AgentGitDiffScope = 'staged' | 'unstaged' | 'untracked';

export type AgentGitDiffSection = {
  scope: AgentGitDiffScope;
  diff: string;
};

export type AgentGitDiff = {
  diff: string;
  sections: AgentGitDiffSection[];
};

export type AgentGitFile = {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
};

export type AgentGitPullRequest = {
  number: number;
  title: string;
  url: string;
  draft: boolean;
};

export type AgentGitWorkflow = {
  repository: string;
  folder: string;
  isLinkedWorktree: boolean;
  branch?: string;
  detached: boolean;
  remote?: string;
  remoteUrl?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  stagedAddedLines?: number;
  stagedRemovedLines?: number;
  unstagedAddedLines?: number;
  unstagedRemovedLines?: number;
  untrackedAddedLines?: number;
  untrackedRemovedLines?: number;
  files: AgentGitFile[];
  stagedFiles: string[];
  unstagedFiles: string[];
  existingPullRequest?: AgentGitPullRequest;
  githubConnected: boolean;
  githubError?: string;
};

export type AgentGitStageInput = { paths: string[]; confirmed: boolean };
export type AgentGitCommitInput = { message: string; confirmed: boolean; includeUnstaged?: boolean; includeUntracked?: boolean };
export type AgentGitPushInput = { confirmed: boolean; target?: 'current' | 'mergeTarget' };
export type AgentGitBranchInput = { name: string; createWorktree?: boolean; pullRequestNumber?: number; confirmed: boolean };
export type AgentCloseInput = { deleteWorktree: boolean; deleteRemoteBranch?: boolean; confirmed: boolean };
export type AgentGitPullRequestInput = { title: string; body: string; confirmed: boolean };
export type AgentGitMergeInput = { strategy: 'merge' | 'squash'; commitMessage?: string; deleteBranch: boolean; deleteWorktree: boolean; confirmed: boolean };
export type AgentGitMessageGenerationInput =
  | { kind: 'commit'; includeUnstaged: boolean; includeUntracked: boolean }
  | { kind: 'pullRequest' };
export type AgentGitMessageGenerationResult =
  | { kind: 'commit'; message: string }
  | { kind: 'pullRequest'; title: string; body: string };

export type TurnGitDiff = {
  turnId: string;
  addedLines: number;
  removedLines: number;
  diff?: string;
  updatedAt: string;
};

export type AppSnapshot = {
  teams: Team[];
  agents: Agent[];
  bench: BenchTemplate[];
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

export type MainToRendererEvent = {
  seq: number;
  source?: 'backend' | 'client';
  agentId?: string;
  backend?: AgentBackend;
  backendSessionId?: string;
  snapshot?: AppSnapshot;
  threadId?: string;
  turnId?: string;
  type:
    | 'backend.statusChanged'
    | 'client.connectionChanged'
    | 'agent.updated'
    | 'snapshot.updated'
    | 'agent.statusChanged'
    | 'thread.started'
    | 'thread.historyLoaded'
    | 'thread.settingsUpdated'
    | 'thread.modeUpdated'
    | 'thread.goalUpdated'
    | 'thread.goalCleared'
    | 'thread.tokenUsageUpdated'
    | 'subagent.operationChanged'
    | 'subagent.activityChanged'
    | 'subagent.identityChanged'
    | 'subagent.statusChanged'
    | 'turn.started'
    | 'turn.planUpdated'
    | 'turn.proposedPlanDelta'
    | 'turn.proposedPlanCompleted'
    | 'turn.completed'
    | 'message.userSubmitted'
    | 'message.steer'
    | 'agent.promptQueued'
    | 'agent.promptRetryScheduled'
    | 'agent.promptDequeued'
    | 'context.compactionStarted'
    | 'context.compactionCompleted'
    | 'account.rateLimitsUpdated'
    | 'devicePairing.statusChanged'
    | 'workBacklog.assignmentUpdated'
    | 'models.changed'
    | 'skills.changed'
    | 'sidePanel.markdownRequested'
    | 'sidePanel.gitDiffRequested'
    | 'celebration.requested'
    | 'agentCreation.progress'
    | 'message.delta'
    | 'message.updated'
    | 'item.started'
    | 'item.updated'
    | 'item.completed'
    | 'file.activity'
    | 'diff.updated'
    | 'git.statusUpdated'
    | 'approval.requested'
    | 'backendApproval.requested'
    | 'backendApproval.resolved'
    | 'clientRequest.resolved'
    | 'toolInput.requested'
    | 'workRouting.requested'
    | 'workRouting.resolved'
    | 'browser.annotationCreated'
    | 'error';
  payload: unknown;
  occurredAt: string;
};

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
  | { type: 'edit-active-agent' }
  | { type: 'new-team' }
  | { type: 'open-agent-composer'; agentId?: string; prompt?: string; submit?: boolean }
  | { type: 'open-browser'; agentId?: string; browserId?: string; url?: string }
  | { type: 'open-review' }
  | { type: 'open-settings' }
  | { type: 'open-whats-new' }
  | { type: 'quit' }
  | { type: 'restart-active-agent' };

export type CreateAgentInput = {
  name: string | null;
  folder: string;
  avatar?: string;
  backend?: AgentBackend;
  backendDefaults?: BackendDefaults;
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
  getBenchSnapshot(location?: BenchLocation): Promise<AppSnapshot>;
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
  saveAgentToBench(agentId: string): Promise<AppSnapshot>;
  deployBenchTemplate(templateId: string, teamId?: string, location?: BenchLocation): Promise<AppSnapshot>;
  removeBenchTemplate(templateId: string, location?: BenchLocation): Promise<AppSnapshot>;
  restartAgent(agentId: string): Promise<AppSnapshot>;
  hydrateAgentHistory(agentId: string): Promise<AppSnapshotMetadata>;
  loadOlderAgentHistory(agentId: string): Promise<AgentHistoryLoadResult>;
  closeAgent(agentId: string, input?: AgentCloseInput): Promise<AppSnapshot>;
  selectAgent(agentId: string): Promise<AppSnapshotMetadata>;
  updateSettings(input: UpdateSettingsInput): Promise<AppSnapshot>;
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
