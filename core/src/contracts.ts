export type AgentStatus =
  | { type: 'idle' }
  | { type: 'starting' }
  | { type: 'working'; detail?: string }
  | { type: 'awaitingInput'; detail?: string }
  | { type: 'error'; message: string };

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

export type Agent = {
  id: string;
  teamId?: string;
  name: string;
  avatar?: string;
  folder: string;
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
  detail?: string;
  connectedAt?: string;
};

export type WorkProviderSettings = {
  oauthClientId?: string;
};

export type WorkBacklogAssignmentStatus = 'working' | 'completed';

export type WorkBacklogAssignment = {
  provider: WorkProviderKind;
  itemId: string;
  agentId: string;
  assignedAt: string;
  status: WorkBacklogAssignmentStatus;
  completedAt?: string;
  loopId?: string;
  loopExecutionId?: string;
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
};

export type WorkItemLabel = {
  name: string;
  color?: string;
};

export type WorkItemState = 'open' | 'closed';

export type WorkItem = {
  provider: WorkProviderKind;
  id: string;
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

export type LoopSourceConfiguration =
  | {
    provider: 'github';
    repositoryId: string;
    assigneeLogin?: string;
    tagName?: string;
  };

export type LoopTeamTarget =
  | {
    mode: 'existing';
    teamId: string;
  }
  | {
    mode: 'dedicated';
  };

export type LoopAction =
  | {
    type: 'create-agent';
    sourceRepositoryPath: string;
    backend?: AgentBackend;
    backendDefaults?: BackendDefaults;
    teamTarget: LoopTeamTarget;
    cleanup?: LoopCleanup;
  }
  | {
    type: 'create-agent-from-bench';
    benchTemplateId: string;
    teamTarget: LoopTeamTarget;
    cleanup?: LoopCleanup;
  };

export type LoopCleanup = {
  deleteAgent?: boolean;
  deleteTeam?: boolean;
};

export type LoopInstructions = {
  assignment?: string;
  beforeCompletion?: string;
};

export type LoopExecutionStatus = 'working' | 'completed' | 'failed';

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

export type LoopExecutionCreatedAgent = {
  agentId: string;
  agentName: string;
  workItemId: string;
  workItemTitle: string;
  workItemUrl: string;
  conversationRef?: BackendConversationRef;
};

export type LoopExecutionLogEntry = {
  id: string;
  loopId: string;
  startedAt: string;
  completedAt?: string;
  status: LoopExecutionStatus;
  createdCount: number;
  createdAgents: LoopExecutionCreatedAgent[];
  error?: string;
};

export type Loop = {
  id: string;
  name: string;
  enabled: boolean;
  source: LoopSourceConfiguration;
  action: LoopAction;
  instructions: LoopInstructions;
  executionLog: LoopExecutionLogEntry[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastError?: string;
  lastCreatedCount?: number;
};

export type LoopLocation =
  | {
    kind: 'local';
  }
  | {
    kind: 'remote';
    remoteConnectionId: string;
  };

export type BenchLocation = LoopLocation;

export type CreateLoopInput = {
  name?: string;
  enabled?: boolean;
  source: LoopSourceConfiguration;
  action: LoopAction;
  instructions?: LoopInstructions;
};

export type UpdateLoopInput = CreateLoopInput & {
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

export type AppGeneralSettings = {
  preventSleepWhenAgentsRun: boolean;
  preventSleepWhenRemoteAccessEnabled: boolean;
  codexBinaryPath: string;
  agentListCompact: boolean;
  shareCodexSkillsAndPlugins: boolean;
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
  title?: string;
  path?: string;
  content: string;
};

export type SidePanelGitDiffRequest = {
  kind: 'gitDiff';
  scope?: 'workingTree' | 'turn';
  title?: string;
  subtitle?: string;
  diff: string;
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

export type SourceRepository = {
  name: string;
  path: string;
  worktrees: SourceWorktree[];
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
  destinationPath?: string;
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
export type AgentGitPushInput = { confirmed: boolean };
export type AgentGitPullRequestInput = { title: string; body: string; confirmed: boolean };
export type AgentGitMergeInput = { strategy: 'merge' | 'squash'; deleteBranch: boolean; deleteWorktree: boolean; confirmed: boolean };

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
  loops: Loop[];
  activeTeamId: string | null;
  activeAgentId: string | null;
  messages: RendererMessage[];
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
  detail?: string;
  capabilities?: Partial<BackendCapabilities>;
};

export type BackendConnectionState = {
  status: 'connecting' | 'connected' | 'reconnecting' | 'error';
  detail?: string;
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
    | 'skills.changed'
    | 'sidePanel.markdownRequested'
    | 'sidePanel.gitDiffRequested'
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
    | 'browser.annotationCreated'
    | 'error';
  payload: unknown;
  occurredAt: string;
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
  | { type: 'debug-image-annotation'; imageDataUrl?: string; pixelRatio?: 1 | 2 }
  | { type: 'debug-mark-unread' }
  | { type: 'debug-open-markdown' }
  | { type: 'edit-active-agent' }
  | { type: 'new-agent' }
  | { type: 'new-team' }
  | { type: 'open-agent-composer'; agentId?: string; prompt?: string; submit?: boolean }
  | { type: 'open-browser'; agentId?: string; browserId?: string; url?: string }
  | { type: 'open-review' }
  | { type: 'open-settings' }
  | { type: 'open-whats-new' }
  | { type: 'quit' }
  | { type: 'restart-active-agent' }
  | { type: 'set-agent-list-compact'; compact: boolean };

export type CreateAgentInput = {
  name: string;
  folder: string;
  avatar?: string;
  backend?: AgentBackend;
  backendDefaults?: BackendDefaults;
  sourceRepositoryName?: string;
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
  name: string;
  folder: string;
  avatar?: string;
  backend?: AgentBackend;
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
  };

export type ClientRequestResponse = {
  id: string;
  payload?: {
    answers?: AskUserAnswers;
    cancelled?: boolean;
    decision?: ToolConfirmationDecision | null;
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
  listWorkRepositories(provider: WorkProviderKind, location?: LoopLocation): Promise<WorkRepository[]>;
  configureWorkBacklog(input: WorkBacklogConfigurationInput, location?: LoopLocation): Promise<AppSnapshot>;
  listWorkItems(provider: WorkProviderKind, repositoryId: string, location?: LoopLocation): Promise<WorkItem[]>;
  listBackendModels(agentId: string): Promise<BackendModelOption[]>;
  listBackendSkills(agentId: string): Promise<BackendSkillSummary[]>;
  listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]>;
  previewAgentFile(agentId: string, filePath: string): Promise<AgentFilePreviewResult>;
  openAgentGitDiff(agentId: string): Promise<void>;
  getAgentGitWorkflow(agentId: string): Promise<AgentGitWorkflow>;
  stageAgentGitFiles(agentId: string, input: AgentGitStageInput): Promise<AgentGitWorkflow>;
  commitAgentGitChanges(agentId: string, input: AgentGitCommitInput): Promise<AgentGitWorkflow>;
  pushAgentGitBranch(agentId: string, input: AgentGitPushInput): Promise<AgentGitWorkflow>;
  createAgentGitPullRequest(agentId: string, input: AgentGitPullRequestInput): Promise<AgentGitWorkflow>;
  mergeAgentGitBranch(agentId: string, input: AgentGitMergeInput): Promise<AgentGitWorkflow>;
  getOpenInApplications(): Promise<OpenInApplicationCatalog>;
  openAgentPath(agentId: string, application: OpenInApplication, filePath?: string): Promise<AppSnapshot>;
  chooseAgentFolder(): Promise<string | null>;
  chooseCodexBinary(): Promise<string | null>;
  chooseSourceFolder(): Promise<string | null>;
  listSourceFolders(input?: SourceFolderListInput): Promise<SourceFolderListing>;
  listSourceRepositories(remoteConnectionId?: string): Promise<SourceRepository[]>;
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
  getLoopSnapshot(location?: LoopLocation): Promise<AppSnapshot>;
  createLoop(input: CreateLoopInput, location?: LoopLocation): Promise<AppSnapshot>;
  updateLoop(input: UpdateLoopInput, location?: LoopLocation): Promise<AppSnapshot>;
  runLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot>;
  clearLoopHistory(loopId: string, location?: LoopLocation): Promise<AppSnapshot>;
  deleteLoopExecution(loopId: string, executionId: string, location?: LoopLocation): Promise<AppSnapshot>;
  deleteLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot>;
  listAgentConversations(agentId: string): Promise<ConversationSummary[]>;
  resumeAgentConversation(agentId: string, ref: BackendConversationRef): Promise<AppSnapshot>;
  readConversationMessages(ref: BackendConversationRef, agentId: string, location?: LoopLocation): Promise<RendererMessage[]>;
  createAgent(input: CreateAgentInput): Promise<AppSnapshot>;
  updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>;
  assignWorkItemToAgent(agentId: string, item: WorkItem): Promise<AppSnapshot>;
  removeWorkItemAssignment(item: WorkItem): Promise<AppSnapshot>;
  duplicateAgent(agentId: string): Promise<AppSnapshot>;
  forkAgent(agentId: string, messageIndex?: number): Promise<AppSnapshot>;
  moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>;
  reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot>;
  saveAgentToBench(agentId: string): Promise<AppSnapshot>;
  deployBenchTemplate(templateId: string, teamId?: string, location?: BenchLocation): Promise<AppSnapshot>;
  removeBenchTemplate(templateId: string, location?: BenchLocation): Promise<AppSnapshot>;
  restartAgent(agentId: string): Promise<AppSnapshot>;
  hydrateAgentHistory(agentId: string): Promise<AppSnapshotMetadata>;
  loadOlderAgentHistory(agentId: string): Promise<AgentHistoryLoadResult>;
  closeAgent(agentId: string): Promise<AppSnapshot>;
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
  launchChatGptApp(): Promise<void>;
  quit(): Promise<void>;
  restartApp(): Promise<void>;
  reloadRenderer(): Promise<void>;
  setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot>;
  clearAgentGoal(agentId: string): Promise<AppSnapshot>;
  setAgentApprovalPreset(agentId: string, preset: ApprovalPreset): Promise<AppSnapshot>;
  sendPrompt(agentId: string, prompt: string, options?: RendererSendPromptOptions): Promise<AppSnapshotMetadata>;
  steerPrompt(agentId: string, prompt: string, options?: RendererSendPromptOptions): Promise<AppSnapshotMetadata>;
  deleteQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot>;
  steerQueuedPrompt(agentId: string, promptId: string): Promise<AppSnapshot>;
  interruptAgent(agentId: string): Promise<AppSnapshot>;
  deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot>;
  retryMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  browserOpen(agentId: string, browserId: string, url: string): Promise<BrowserState>;
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
