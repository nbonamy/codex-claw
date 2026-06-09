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
  agentIds: string[];
  activeAgentId?: string;
};

export type AgentBackend = 'codex' | 'claude';

export type CodexApprovalPreset = 'ask-for-approval' | 'approve-for-me' | 'full-access';

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

export type ThreadPlanStep = {
  step: string;
  status: ThreadPlanStepStatus;
};

export type ThreadPlan = {
  threadId: string;
  turnId: string;
  explanation: string;
  steps: ThreadPlanStep[];
  markdown: string;
  updatedAt: string;
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

export type WorkBacklogAssignment = {
  provider: WorkProviderKind;
  itemId: string;
  agentId: string;
  assignedAt: string;
};

export type WorkBacklogState = {
  connections: WorkIntegrationConnection[];
  selectedRepositoryIds: Partial<Record<WorkProviderKind, string>>;
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
  body?: string;
  labels: WorkItemLabel[];
  createdAt: string;
  updatedAt: string;
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

export type DeployBenchTemplateInput = {
  templateId: string;
  teamId?: string;
};

export type ReasoningEffort = string;

export type BackendPlanModeSupport = 'native' | 'prompted' | 'unsupported';

export type BackendCapabilities = {
  models: boolean;
  skills: boolean;
  reasoningEffort: boolean;
  thinkingBudget: boolean;
  planMode: BackendPlanModeSupport;
  goals: boolean;
  steerPrompt: boolean;
  interrupt: boolean;
  history: boolean;
  rollback: boolean;
  editMessage: boolean;
  retryMessage: boolean;
  approvals: boolean;
};

export type AppearanceMode = 'dark' | 'light' | 'system';

export type AppThemeSettings = {
  id: string;
  mode: AppearanceMode;
  uiFontSize: number;
  chatFontSize: number;
  codeFontSize: number;
};

export type BackendReasoningEffortOption = {
  reasoningEffort: ReasoningEffort;
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

export type AgentFileReadResult = {
  path: string;
  content: string;
};

export type SidePanelMarkdownRequest = {
  kind: 'markdown';
  purpose?: 'plan';
  title?: string;
  path?: string;
  content: string;
};

export type PromptSkillInput = {
  name: string;
  path: string;
};

export type SendPromptOptions = {
  model?: string | null;
  planMode?: boolean;
  backendOptions?: BackendPromptOptions;
};

export type BackendPromptOptions =
  | {
    kind: 'codex';
    reasoningEffort?: ReasoningEffort | null;
    skills?: PromptSkillInput[];
  }
  | {
    kind: 'claude';
    thinkingBudgetTokens?: number | null;
    permissionMode?: string | null;
  };

export type AppleSpeechTranscriptionOptions = {
  locale?: string;
  live?: boolean;
};

export type AppleSpeechTranscriptionResult = {
  text: string;
  error?: string;
};

export type UpdateSettingsInput = {
  theme?: Partial<AppThemeSettings>;
  workProviders?: Partial<Record<WorkProviderKind, WorkProviderSettings>>;
};

export type RendererMessagePart =
  | { type: 'text'; text: string; itemId?: string }
  | {
    type: 'tool';
    id: string;
    kind: 'command' | 'mcp' | 'dynamic' | 'fileChange' | 'generic';
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

export type AppSnapshot = {
  teams: Team[];
  agents: Agent[];
  bench: BenchTemplate[];
  activeTeamId: string | null;
  activeAgentId: string | null;
  messages: RendererMessage[];
  backendRuntimes: BackendRuntimeStatus[];
  accountRateLimits?: AccountRateLimits;
  workBacklog: WorkBacklogState;
  theme: AppThemeSettings;
};

export type BackendRuntimeStatus = {
  backend: AgentBackend;
  status: 'notConfigured' | 'starting' | 'running' | 'error';
  detail?: string;
};

export type MainToRendererEvent = {
  seq: number;
  agentId?: string;
  backend?: AgentBackend;
  backendSessionId?: string;
  threadId?: string;
  turnId?: string;
  type:
    | 'backend.statusChanged'
    | 'agent.updated'
    | 'agent.statusChanged'
    | 'thread.started'
    | 'thread.historyLoaded'
    | 'thread.settingsUpdated'
    | 'thread.modeUpdated'
    | 'thread.goalUpdated'
    | 'thread.goalCleared'
    | 'thread.tokenUsageUpdated'
    | 'turn.started'
    | 'turn.planUpdated'
    | 'turn.proposedPlanDelta'
    | 'turn.proposedPlanCompleted'
    | 'turn.completed'
    | 'message.steer'
    | 'context.compactionStarted'
    | 'account.rateLimitsUpdated'
    | 'skills.changed'
    | 'sidePanel.markdownRequested'
    | 'message.delta'
    | 'item.started'
    | 'item.updated'
    | 'item.completed'
    | 'diff.updated'
    | 'approval.requested'
    | 'toolInput.requested'
    | 'error';
  payload: unknown;
  occurredAt: string;
};

export type AppCommand =
  | { type: 'close-active-agent' }
  | { type: 'close-active-team' }
  | { type: 'cycle-agents'; direction: -1 | 1 }
  | { type: 'cycle-teams' }
  | { type: 'duplicate-active-agent' }
  | { type: 'edit-active-agent' }
  | { type: 'new-agent' }
  | { type: 'new-team' }
  | { type: 'quit' }
  | { type: 'restart-active-agent' };

export type CreateAgentInput = {
  name: string;
  folder: string;
  avatar?: string;
  backend?: AgentBackend;
  teamId?: string;
};

export type CreateTeamInput = {
  name: string;
  color: string;
};

export type UpdateTeamInput = {
  id: string;
  name: string;
  color: string;
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

export type CodexClawApi = {
  getSnapshot(): Promise<AppSnapshot>;
  connectWorkProvider(provider: WorkProviderKind): Promise<WorkProviderConnectResult>;
  completeWorkProviderConnection(provider: WorkProviderKind): Promise<AppSnapshot>;
  disconnectWorkProvider(provider: WorkProviderKind): Promise<AppSnapshot>;
  listWorkRepositories(provider: WorkProviderKind): Promise<WorkRepository[]>;
  selectWorkRepository(provider: WorkProviderKind, repositoryId: string | null): Promise<AppSnapshot>;
  listWorkItems(provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]>;
  listBackendModels(agentId: string): Promise<BackendModelOption[]>;
  listBackendSkills(agentId: string): Promise<BackendSkillSummary[]>;
  listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]>;
  readAgentFile(agentId: string, filePath: string): Promise<AgentFileReadResult>;
  chooseAgentFolder(): Promise<string | null>;
  createTeam(input: CreateTeamInput): Promise<AppSnapshot>;
  updateTeam(input: UpdateTeamInput): Promise<AppSnapshot>;
  reorderTeams(input: ReorderTeamsInput): Promise<AppSnapshot>;
  closeTeam(teamId: string): Promise<AppSnapshot>;
  selectTeam(teamId: string): Promise<AppSnapshot>;
  createAgent(input: CreateAgentInput): Promise<AppSnapshot>;
  updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>;
  assignWorkItemToAgent(agentId: string, item: WorkItem): Promise<AppSnapshot>;
  removeWorkItemAssignment(item: WorkItem): Promise<AppSnapshot>;
  duplicateAgent(agentId: string): Promise<AppSnapshot>;
  moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>;
  reorderAgents(input: ReorderAgentsInput): Promise<AppSnapshot>;
  saveAgentToBench(agentId: string): Promise<AppSnapshot>;
  deployBenchTemplate(templateId: string, teamId?: string): Promise<AppSnapshot>;
  removeBenchTemplate(templateId: string): Promise<AppSnapshot>;
  restartAgent(agentId: string): Promise<AppSnapshot>;
  closeAgent(agentId: string): Promise<AppSnapshot>;
  selectAgent(agentId: string): Promise<AppSnapshot>;
  selectAgentFolder(agentId: string): Promise<AppSnapshot | null>;
  updateSettings(input: UpdateSettingsInput): Promise<AppSnapshot>;
  transcribeAppleSpeech(audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions): Promise<AppleSpeechTranscriptionResult>;
  quit(): Promise<void>;
  setAgentGoal(agentId: string, objective: string): Promise<AppSnapshot>;
  clearAgentGoal(agentId: string): Promise<AppSnapshot>;
  setAgentCodexApprovalPreset(agentId: string, preset: CodexApprovalPreset): Promise<AppSnapshot>;
  sendPrompt(agentId: string, prompt: string, options?: SendPromptOptions): Promise<AppSnapshot>;
  steerPrompt(agentId: string, prompt: string): Promise<AppSnapshot>;
  interruptAgent(agentId: string): Promise<AppSnapshot>;
  deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot>;
  retryMessage(agentId: string, messageId: string): Promise<AppSnapshot>;
  respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>;
  onEvent(listener: (event: MainToRendererEvent) => void): () => void;
  onAppCommand(listener: (command: AppCommand) => void): () => void;
};
