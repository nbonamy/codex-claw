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
  createAgent(input: CreateAgentInput): Promise<Agent>;
  selectAgent(agentId: string): Promise<AppSnapshot>;
  selectAgentFolder(agentId: string): Promise<AppSnapshot | null>;
  sendPrompt(agentId: string, prompt: string): Promise<AppSnapshot>;
  respondToClientRequest(response: ClientRequestResponse): Promise<AppSnapshot>;
  onEvent(listener: (event: MainToRendererEvent) => void): () => void;
};
