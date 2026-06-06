import { randomUUID } from 'node:crypto';
import type { Agent, AgentStatus } from '../../shared/contracts';

export type McpAgentInfo = {
  id: string;
  name: string;
  folder: string;
  status: string;
};

export type McpMessage = {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
};

export type MessageInfo = {
  id: string;
  from: string;
  content: string;
  timestamp: string;
};

export type ListAgentsResponse = {
  agents: McpAgentInfo[];
};

export type SendMessageResponse = {
  success: boolean;
  message: string;
};

export type CheckMessagesResponse = {
  messages: MessageInfo[];
};

export type BroadcastResponse = {
  success: boolean;
  recipientCount: number;
};

export type ClawMcpAgentCoordinatorOptions = {
  getAgents: () => Agent[];
  onAgentUpdated?: (agent: Agent) => void;
  onInboxMessage?: (agentId: string, messageId: string) => void;
  createId?: () => string;
  now?: () => Date;
};

export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

export class ClawMcpAgentCoordinator {
  private readonly messages: McpMessage[] = [];
  private readonly getAgents: () => Agent[];
  private readonly onAgentUpdated?: (agent: Agent) => void;
  private readonly onInboxMessage?: (agentId: string, messageId: string) => void;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(options: ClawMcpAgentCoordinatorOptions) {
    this.getAgents = options.getAgents;
    this.onAgentUpdated = options.onAgentUpdated;
    this.onInboxMessage = options.onInboxMessage;
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  connectAgent(agentId: string, sessionId?: string): Agent {
    const agent = this.requireAgent(agentId);
    const updatedAt = this.now().toISOString();
    agent.isRegistered = true;
    agent.mcpSessionId = sessionId;
    agent.updatedAt = updatedAt;
    this.onAgentUpdated?.(agent);

    return agent;
  }

  listAgents(callerAgentId: string): ListAgentsResponse {
    const caller = this.requireAgent(callerAgentId);

    return {
      agents: this.listVisibleAgents(caller),
    };
  }

  sendMessage(from: string, to: string, content: string): SendMessageResponse {
    const sender = this.requireAgent(from);
    const recipient = this.findAgentInSameTeam(sender, to);
    if (!recipient) {
      throw new McpToolError('Failed to send message: Recipient not found');
    }

    const message = this.storeMessage(sender.id, recipient.id, content);
    this.onInboxMessage?.(recipient.id, message.id);

    return {
      success: true,
      message: "Message sent successfully. Don't check for a response right away - you will be notified when the other agent responds.",
    };
  }

  checkMessages(agentId: string, markAsRead = true): CheckMessagesResponse {
    const agent = this.requireAgent(agentId);
    const unread = this.unreadMessagesFor(agent.id);

    if (markAsRead) {
      for (const message of unread) {
        message.isRead = true;
      }
    }

    return {
      messages: unread.map((message) => ({
        id: message.id,
        from: this.findAgent(message.from)?.name ?? message.from,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
      })),
    };
  }

  broadcastMessage(from: string, content: string): BroadcastResponse {
    const sender = this.requireAgent(from);
    const recipients = this.agentsInSameTeam(sender)
      .filter((agent) => agent.id !== sender.id && agent.isRegistered);

    for (const recipient of recipients) {
      const message = this.storeMessage(sender.id, recipient.id, content);
      this.onInboxMessage?.(recipient.id, message.id);
    }

    return {
      success: recipients.length > 0,
      recipientCount: recipients.length,
    };
  }

  setStatus(agentId: string, status: string): string {
    const agent = this.requireAgent(agentId);
    agent.statusText = status.trim() || undefined;
    agent.updatedAt = this.now().toISOString();
    this.onAgentUpdated?.(agent);

    return 'Status updated';
  }

  latestUnreadMessageId(agentId: string): string | null {
    const agent = this.findAgent(agentId);
    if (!agent) {
      return null;
    }

    return this.unreadMessagesFor(agent.id).at(-1)?.id ?? null;
  }

  debugAgents(): McpAgentInfo[] {
    return this.getAgents().map((agent) => this.toAgentInfo(agent));
  }

  private storeMessage(from: string, to: string, content: string): McpMessage {
    const message: McpMessage = {
      id: this.createId(),
      from,
      to,
      content,
      timestamp: this.now(),
      isRead: false,
    };
    this.messages.push(message);

    this.cleanup();
    return message;
  }

  private listVisibleAgents(caller: Agent): McpAgentInfo[] {
    return this.agentsInSameTeam(caller).map((agent) => this.toAgentInfo(agent));
  }

  private agentsInSameTeam(caller: Agent): Agent[] {
    const agents = this.getAgents();
    if (caller.teamId) {
      return agents.filter((agent) => agent.teamId === caller.teamId);
    }

    return agents.filter((agent) => !agent.teamId);
  }

  private findAgentInSameTeam(caller: Agent, identifier: string): Agent | null {
    const visibleAgents = this.agentsInSameTeam(caller);
    const exactId = visibleAgents.find((agent) => agent.id === identifier);
    if (exactId) {
      return exactId;
    }

    const exactFolder = visibleAgents.find((agent) => agent.folder === identifier);
    if (exactFolder) {
      return exactFolder;
    }

    const normalized = identifier.toLowerCase();
    const nameMatches = visibleAgents.filter((agent) => agent.name.toLowerCase() === normalized);
    if (nameMatches.length > 1) {
      throw new McpToolError(`Failed to send message: Recipient name '${identifier}' is ambiguous. Use the recipient ID from list-agents.`);
    }

    return nameMatches[0] ?? null;
  }

  private requireAgent(identifier: string): Agent {
    const agent = this.findAgent(identifier);
    if (!agent) {
      throw new McpToolError(this.agentNotFoundMessage(identifier));
    }

    return agent;
  }

  private findAgent(identifier: string): Agent | null {
    return this.getAgents().find((agent) => matchesAgent(agent, identifier)) ?? null;
  }

  private unreadMessagesFor(agentId: string): McpMessage[] {
    return this.messages.filter((message) => message.to === agentId && !message.isRead);
  }

  private toAgentInfo(agent: Agent): McpAgentInfo {
    return {
      id: agent.id,
      name: agent.name,
      folder: agent.folder,
      status: agent.statusText ? `${agentStatusLabel(agent.status)}: ${agent.statusText}` : agentStatusLabel(agent.status),
    };
  }

  private cleanup(): void {
    const readMessages = this.messages.filter((message) => message.isRead);
    if (readMessages.length <= 100) {
      return;
    }

    let removed = 0;
    const toRemove = readMessages.length - 100;
    for (let index = 0; index < this.messages.length; index += 1) {
      if (!this.messages[index]?.isRead) {
        continue;
      }
      if (removed >= toRemove) {
        break;
      }
      this.messages.splice(index, 1);
      index -= 1;
      removed += 1;
    }
  }

  private agentNotFoundMessage(identifier: string): string {
    const agents = this.getAgents();
    if (agents.length === 0) {
      return `Agent '${identifier}' not found. No agents are currently available.`;
    }

    const entries = agents.map((agent) => `- ${agent.id}: ${agent.name} (${agent.folder})`).join('\n');
    return `Agent '${identifier}' not found. Visible agents:\n\n${entries}`;
  }
}

function matchesAgent(agent: Agent, identifier: string): boolean {
  return agent.id === identifier || agent.name.toLowerCase() === identifier.toLowerCase();
}

function agentStatusLabel(status: AgentStatus): string {
  switch (status.type) {
    case 'working':
      return status.detail ?? 'Working';
    case 'starting':
      return 'Starting';
    case 'awaitingInput':
      return status.detail ?? 'Awaiting input';
    case 'error':
      return status.message ? `Error: ${status.message}` : 'Error';
    case 'idle':
      return 'Idle';
  }
}
