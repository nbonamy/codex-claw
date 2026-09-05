import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import type {
  Agent,
  AppSnapshot,
  BackendConversationRef,
  BackendSession,
  RendererMessage,
} from '@codex-claw/core/contracts';
import type { BackendEvent, BackendRollbackResult } from '@codex-claw/core/backend-driver';
import { formatConversationTitle, shouldSyncConversationTitleFromAgent } from '@codex-claw/core/conversation-title';
import { warnMain } from '../log';

export type ResolvedMessageAction = {
  agent: Agent;
  message: RendererMessage;
  prompt: string | null;
  turnId: string;
};

export type AgentConversationServiceOptions = {
  applyEvent: (event: BackendEvent) => void;
  driverRequest: (agent: Agent, method: string, params: unknown) => Promise<unknown>;
  getSnapshot: () => AppSnapshot;
  persistSnapshot: () => Promise<AppSnapshot>;
  refreshGitStatus: (agentId: string) => Promise<void>;
  refreshWorkspaceIdentity: (agentId: string) => Promise<void>;
};

/** Owns conversation history mutation, retry resolution, hydration, and title synchronization. */
export class AgentConversationService {
  private readonly hydrationRequests = new Map<string, Promise<void>>();

  constructor(private readonly options: AgentConversationServiceOptions) {}

  async rollbackToTurn(agentId: string, turnId: string): Promise<AppSnapshot | null> {
    const agent = this.agent(agentId);
    if (!agent) return null;
    const result = await this.options.driverRequest(
      agent,
      backendMethods.driverTurnRollback,
      { agent, turnId },
    ) as BackendRollbackResult;
    agent.backendSession = result.backendSession;
    const sessionThread = result.backendSession.kind === 'codex' ? { threadId: result.backendSession.threadId } : {};
    this.options.applyEvent({
      agentId,
      ...sessionThread,
      type: 'thread.historyLoaded',
      payload: { messages: result.messages, replace: true },
    });
    this.options.applyEvent({
      agentId,
      ...sessionThread,
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    });
    return this.options.persistSnapshot();
  }

  resolveMessageAction(agentId: string, messageId: string): ResolvedMessageAction | null {
    const agent = this.agent(agentId);
    if (!agent) return null;
    const messages = this.options.getSnapshot().messages.filter((message) => message.agentId === agentId);
    const index = messages.findIndex((message) => message.id === messageId);
    const message = messages[index];
    if (index === -1 || !message) return null;
    const turnId = resolveMessageTurnId(messages, index);
    if (!turnId) return null;
    return { agent, message, prompt: promptForMessageRetry(messages, index, turnId), turnId };
  }

  isStoredConversationRef(ref: BackendConversationRef, agentId: string): boolean {
    const snapshot = this.options.getSnapshot();
    const storedAutomationConversation = snapshot.automations.some((automation) => automation.executionLog.some((entry) => (
      entry.createdAgents.some((createdAgent) => (
        createdAgent.agentId === agentId &&
        Boolean(createdAgent.conversationRef && sameConversationRef(createdAgent.conversationRef, ref))
      ))
    )));
    if (storedAutomationConversation) return true;
    const agent = this.agent(agentId);
    const tree = snapshot.subagentTrees[agentId];
    return ref.backend === 'codex' &&
      agent?.backendSession?.kind === 'codex' &&
      tree?.rootConversationId === agent.backendSession.threadId &&
      Boolean(tree.nodes[ref.threadId]);
  }

  async hydrate(agentId: string): Promise<void> {
    const existing = this.hydrationRequests.get(agentId);
    if (existing) return existing;
    const request = this.performHydration(agentId).finally(() => {
      if (this.hydrationRequests.get(agentId) === request) {
        this.hydrationRequests.delete(agentId);
      }
    });
    this.hydrationRequests.set(agentId, request);
    return request;
  }

  private async performHydration(agentId: string): Promise<void> {
    const agent = this.agent(agentId);
    if (!agent?.backendSession) return;
    try {
      const session = await this.options.driverRequest(agent, backendMethods.driverHistoryHydrate, { agent });
      if (isBackendSession(session)) {
        agent.backendSession = session;
        await this.options.persistSnapshot();
      }
    } catch (error) {
      warnMain('agent-conversation', 'history hydration failed', {
        agentId,
        backend: agent.backend,
        message: error instanceof Error ? error.message : String(error),
      });
      this.options.applyEvent({
        agentId,
        type: 'thread.historyHydrationFailed',
        payload: {},
      });
    }
  }

  async hydrateAndRefresh(agentId: string): Promise<void> {
    await this.hydrate(agentId);
    await this.options.refreshWorkspaceIdentity(agentId);
    await this.options.refreshGitStatus(agentId);
  }

  setNewTitle(agentId: string, wasNewSession: boolean): void {
    if (wasNewSession) this.setTitle(agentId);
  }

  setTitle(agentId: string): void {
    const agent = this.agent(agentId);
    if (!agent || !shouldSyncConversationTitleFromAgent(agent)) return;
    agent.conversationTitle = formatConversationTitle(agent);
    void this.syncTitle(agentId);
  }

  async syncTitle(agentId: string): Promise<void> {
    const agent = this.agent(agentId);
    if (!agent) return;
    try {
      await this.options.driverRequest(agent, backendMethods.driverConversationTitleUpdate, {
        agent,
        title: agent.conversationTitle ?? formatConversationTitle(agent),
      });
    } catch {
      // A title failure should not fail the user action that created the session.
    }
  }

  private agent(agentId: string): Agent | undefined {
    return this.options.getSnapshot().agents.find((candidate) => candidate.id === agentId);
  }
}

function resolveMessageTurnId(messages: RendererMessage[], index: number): string | null {
  const message = messages[index];
  if (!message) return null;
  if (message.turnId) return message.turnId;
  const idTurnId = turnIdFromRendererMessageId(message.id);
  if (idTurnId) return idTurnId;
  if (message.role === 'user') {
    for (let offset = index + 1; offset < messages.length; offset += 1) {
      const candidate = messages[offset];
      if (candidate?.role === 'user') break;
      const candidateTurnId = candidate ? candidate.turnId ?? turnIdFromRendererMessageId(candidate.id) : null;
      if (candidateTurnId) return candidateTurnId;
    }
  }
  return null;
}

function promptForMessageRetry(messages: RendererMessage[], index: number, turnId: string): string | null {
  const message = messages[index];
  if (!message) return null;
  if (message.role === 'user') return rendererMessageText(message);
  for (let offset = index - 1; offset >= 0; offset -= 1) {
    const candidate = messages[offset];
    if (!candidate || candidate.role !== 'user') continue;
    const candidateTurnId = candidate.turnId ?? resolveMessageTurnId(messages, offset);
    if (candidateTurnId === turnId) return rendererMessageText(candidate);
  }
  for (let offset = index - 1; offset >= 0; offset -= 1) {
    const candidate = messages[offset];
    if (candidate?.role === 'user') return rendererMessageText(candidate);
  }
  return null;
}

function sameConversationRef(left: BackendConversationRef, right: BackendConversationRef): boolean {
  return left.backend === right.backend && (
    left.backend === 'codex'
      ? right.backend === 'codex' && left.threadId === right.threadId
      : right.backend === 'claude' && left.folder === right.folder && left.sessionId === right.sessionId
  );
}

function isBackendSession(value: unknown): value is BackendSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  if (session.kind === 'codex') {
    return typeof session.threadId === 'string' && session.threadId.trim().length > 0;
  }
  return session.kind === 'claude' &&
    typeof session.sessionId === 'string' &&
    session.sessionId.trim().length > 0 &&
    typeof session.transport === 'string';
}

function rendererMessageText(message: RendererMessage): string {
  return message.parts
    .map((part) => part.type === 'text' || part.type === 'status' ? part.text : '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function turnIdFromRendererMessageId(messageId: string): string | null {
  if (messageId.startsWith('assistant-')) {
    return messageId.slice('assistant-'.length).split('-segment-')[0] || null;
  }

  if (messageId.startsWith('compaction-')) {
    return messageId.slice('compaction-'.length) || null;
  }

  return null;
}
