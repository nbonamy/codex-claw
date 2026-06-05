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
  | { type: 'text'; text: string }
  | { type: 'tool'; title: string; status: 'running' | 'completed' | 'failed'; body?: string }
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

export type CodexClawApi = {
  getSnapshot(): Promise<AppSnapshot>;
  createAgent(input: CreateAgentInput): Promise<Agent>;
  sendPrompt(agentId: string, prompt: string): Promise<void>;
  onEvent(listener: (event: MainToRendererEvent) => void): () => void;
};
