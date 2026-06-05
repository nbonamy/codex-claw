import type {
  Agent,
  AgentStatus,
  AppSnapshot,
  CreateAgentInput,
  MainToRendererEvent,
  RendererMessage,
} from './contracts';

const seedCreatedAt = '2026-06-05T00:00:00.000Z';

export function createInitialSnapshot(): AppSnapshot {
  const agent = createSeedAgent();

  return {
    teams: [],
    agents: [agent],
    bench: [],
    activeAgentId: agent.id,
    messages: [],
    appServer: {
      status: 'notConfigured',
      detail: 'Codex app-server is not connected yet.',
    },
    theme: {
      id: 'codex-claw-dark',
    },
  };
}

export function createAgentFromInput(input: CreateAgentInput, createdAt = new Date().toISOString()): Agent {
  return {
    id: `agent-${slug(input.name)}-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    name: input.name.trim(),
    avatar: input.avatar,
    folder: input.folder,
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };
}

export function appendUserPrompt(snapshot: AppSnapshot, agentId: string, prompt: string, createdAt = new Date().toISOString()): RendererMessage {
  const message: RendererMessage = {
    id: `message-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    role: 'user',
    status: 'complete',
    createdAt,
    parts: [{ type: 'text', text: prompt }],
  };

  snapshot.messages.push(message);

  return message;
}

export function appendSystemMessage(snapshot: AppSnapshot, agentId: string, text: string, createdAt = new Date().toISOString()): RendererMessage {
  const message: RendererMessage = {
    id: `system-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    role: 'system',
    status: 'error',
    createdAt,
    parts: [{ type: 'status', text }],
  };

  snapshot.messages.push(message);

  return message;
}

export function updateAgentFolder(snapshot: AppSnapshot, agentId: string, folder: string, updatedAt = new Date().toISOString()): Agent | null {
  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return null;
  }

  agent.folder = folder;
  delete agent.codexThreadId;
  agent.updatedAt = updatedAt;

  return agent;
}

export function applyMainEventToSnapshot(snapshot: AppSnapshot, event: MainToRendererEvent): void {
  if (event.type === 'appServer.statusChanged') {
    const payload = event.payload as AppSnapshot['appServer'];
    snapshot.appServer = payload;
    return;
  }

  if (!event.agentId) {
    return;
  }

  if (event.type === 'thread.started' && event.threadId) {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      agent.codexThreadId = event.threadId;
      agent.status = { type: 'idle' };
    }
    return;
  }

  if (event.type === 'turn.started') {
    setAgentStatus(snapshot, event.agentId, { type: 'working' });
    return;
  }

  if (event.type === 'message.delta' && event.turnId) {
    const payload = event.payload as { delta?: unknown };
    appendAssistantDelta(snapshot, event.agentId, event.turnId, typeof payload.delta === 'string' ? payload.delta : '');
    return;
  }

  if (event.type === 'turn.completed' && event.turnId) {
    completeAssistantMessage(snapshot, event.agentId, event.turnId);
    setAgentStatus(snapshot, event.agentId, { type: 'idle' });
    return;
  }

  if (event.type === 'error') {
    const payload = event.payload as { message?: unknown };
    appendSystemMessage(snapshot, event.agentId, typeof payload.message === 'string' ? payload.message : 'Codex app-server error');
    setAgentStatus(snapshot, event.agentId, { type: 'error', message: 'Codex app-server error' });
  }
}

function appendAssistantDelta(snapshot: AppSnapshot, agentId: string, turnId: string, delta: string): void {
  const message = findAssistantMessage(snapshot, agentId, turnId);

  if (!message) {
    snapshot.messages.push({
      id: assistantMessageId(turnId),
      agentId,
      role: 'assistant',
      status: 'streaming',
      createdAt: new Date().toISOString(),
      parts: [{ type: 'text', text: delta }],
    });
    return;
  }

  const textPart = message.parts.find((part) => part.type === 'text');
  if (textPart?.type === 'text') {
    textPart.text += delta;
  } else {
    message.parts.push({ type: 'text', text: delta });
  }
}

function completeAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): void {
  const message = findAssistantMessage(snapshot, agentId, turnId);
  if (message) {
    message.status = 'complete';
  }
}

function findAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  return snapshot.messages.find((message) => message.id === assistantMessageId(turnId) && message.agentId === agentId);
}

function assistantMessageId(turnId: string): string {
  return `assistant-${turnId}`;
}

function setAgentStatus(snapshot: AppSnapshot, agentId: string, status: AgentStatus): void {
  const agent = findAgent(snapshot, agentId);
  if (agent) {
    agent.status = status;
    agent.updatedAt = new Date().toISOString();
  }
}

function findAgent(snapshot: AppSnapshot, agentId: string): Agent | undefined {
  return snapshot.agents.find((agent) => agent.id === agentId);
}

function createSeedAgent(): Agent {
  return {
    id: 'agent-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '~/src/codex-claw',
    status: { type: 'idle' },
    createdAt: seedCreatedAt,
    updatedAt: seedCreatedAt,
  };
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || 'codex';
}
