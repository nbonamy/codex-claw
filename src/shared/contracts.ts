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

export type Agent = {
  id: string;
  teamId?: string;
  name: string;
  avatar?: string;
  folder: string;
  codexThreadId?: string;
  contextUsage?: AgentContextUsage;
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

export type BenchTemplate = {
  id: string;
  name: string;
  avatar?: string;
  folder: string;
  backend: 'codex';
  codexDefaults?: {
    model?: string;
    approvalPolicy?: string;
    sandboxMode?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type ReasoningEffort = string;

export type AppearanceMode = 'dark' | 'light' | 'system';

export type AppThemeSettings = {
  id: string;
  mode: AppearanceMode;
  uiFontSize: number;
  chatFontSize: number;
  codeFontSize: number;
};

export type CodexReasoningEffortOption = {
  reasoningEffort: ReasoningEffort;
  description: string;
};

export type CodexModelOption = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
  defaultReasoningEffort: ReasoningEffort;
  isDefault: boolean;
};

export type CodexSkillSummary = {
  name: string;
  description: string;
  shortDescription?: string;
  displayName?: string;
  iconSmall?: string;
  iconLarge?: string;
  brandColor?: string;
  defaultPrompt?: string;
  path: string;
  scope: string;
  enabled: boolean;
};

export type PromptSkillInput = {
  name: string;
  path: string;
};

export type SendPromptOptions = {
  goalMode?: boolean;
  model?: string | null;
  planMode?: boolean;
  reasoningEffort?: ReasoningEffort | null;
  skills?: PromptSkillInput[];
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
  statusText?: string;
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
  appServer: {
    status: 'notConfigured' | 'starting' | 'running' | 'error';
    detail?: string;
  };
  accountRateLimits?: AccountRateLimits;
  theme: AppThemeSettings;
};

export type MainToRendererEvent = {
  seq: number;
  agentId?: string;
  threadId?: string;
  turnId?: string;
  type:
    | 'appServer.statusChanged'
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
    | 'turn.completed'
    | 'message.steer'
    | 'context.compactionStarted'
    | 'account.rateLimitsUpdated'
    | 'skills.changed'
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
  | { type: 'cycle-teams' };

export type CreateAgentInput = {
  name: string;
  folder: string;
  avatar?: string;
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

export type UpdateAgentInput = {
  id: string;
  name: string;
  folder: string;
  avatar?: string;
};

export type MoveAgentToTeamInput = {
  agentId: string;
  teamId: string;
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
    decision?: ToolConfirmationDecision | null;
  };
};

export type CodexClawApi = {
  getSnapshot(): Promise<AppSnapshot>;
  listCodexModels(): Promise<CodexModelOption[]>;
  listCodexSkills(agentId: string): Promise<CodexSkillSummary[]>;
  chooseAgentFolder(): Promise<string | null>;
  createTeam(input: CreateTeamInput): Promise<AppSnapshot>;
  updateTeam(input: UpdateTeamInput): Promise<AppSnapshot>;
  closeTeam(teamId: string): Promise<AppSnapshot>;
  selectTeam(teamId: string): Promise<AppSnapshot>;
  createAgent(input: CreateAgentInput): Promise<AppSnapshot>;
  updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>;
  duplicateAgent(agentId: string): Promise<AppSnapshot>;
  moveAgentToTeam(input: MoveAgentToTeamInput): Promise<AppSnapshot>;
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
  sendPrompt(agentId: string, prompt: string, options?: SendPromptOptions): Promise<AppSnapshot>;
  steerPrompt(agentId: string, prompt: string): Promise<AppSnapshot>;
  respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>;
  onEvent(listener: (event: MainToRendererEvent) => void): () => void;
  onAppCommand(listener: (command: AppCommand) => void): () => void;
};
