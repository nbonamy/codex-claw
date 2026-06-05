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
  isRegistered?: boolean;
  mcpSessionId?: string;
  statusText?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
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

export type SendPromptOptions = {
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
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
  role: 'user' | 'assistant' | 'system';
  status: 'complete' | 'streaming' | 'error';
  parts: RendererMessagePart[];
  createdAt: string;
};

export type AppSnapshot = {
  teams: Team[];
  agents: Agent[];
  bench: BenchTemplate[];
  activeAgentId: string | null;
  messages: RendererMessage[];
  appServer: {
    status: 'notConfigured' | 'starting' | 'running' | 'error';
    detail?: string;
  };
  theme: {
    id: string;
  };
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
    | 'turn.started'
    | 'turn.completed'
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

export type CreateAgentInput = {
  name: string;
  folder: string;
  avatar?: string;
};

export type UpdateAgentInput = {
  id: string;
  name: string;
  folder: string;
  avatar?: string;
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

export type ClientRequest =
  | {
    id: string;
    kind: 'confirm_tool';
    payload: {
      confirmation: ConfirmToolRequest;
    };
  };

export type ClientRequestResponse = {
  id: string;
  payload?: {
    decision?: ToolConfirmationDecision | null;
  };
};

export type CodexClawApi = {
  getSnapshot(): Promise<AppSnapshot>;
  listCodexModels(): Promise<CodexModelOption[]>;
  chooseAgentFolder(): Promise<string | null>;
  createAgent(input: CreateAgentInput): Promise<AppSnapshot>;
  updateAgent(input: UpdateAgentInput): Promise<AppSnapshot>;
  selectAgent(agentId: string): Promise<AppSnapshot>;
  selectAgentFolder(agentId: string): Promise<AppSnapshot | null>;
  sendPrompt(agentId: string, prompt: string, options?: SendPromptOptions): Promise<AppSnapshot>;
  respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>;
  onEvent(listener: (event: MainToRendererEvent) => void): () => void;
};
