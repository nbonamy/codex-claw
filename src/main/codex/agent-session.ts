import os from 'node:os';
import path from 'node:path';
import type { Agent, MainToRendererEvent } from '../../shared/contracts';
import type { CodexRpcClient } from './rpc-client';
import type {
  CodexNotification,
  CodexRawResponseItem,
  CodexThread,
  CodexSessionEvent,
  CodexSessionPromptResult,
  CodexTurn,
  ThreadStartResponse,
  TurnStartResponse,
} from './protocol';
import { rawResponseItemToEvent } from './raw-response-item-adapter';

type AgentSession = {
  agentId: string;
  threadId: string;
};

type EventListener = (event: CodexSessionEvent) => void;

export class CodexAgentSessionManager {
  private seq = 0;
  private readonly sessionsByAgentId = new Map<string, AgentSession>();
  private readonly agentIdsByThreadId = new Map<string, string>();
  private readonly listeners = new Set<EventListener>();
  private initialized = false;

  constructor(private readonly client: CodexRpcClient) {
    this.client.onNotification((message) => this.handleNotification(message as CodexNotification));
  }

  async start(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.client.start();
    await this.client.initialize();
    this.initialized = true;
  }

  async sendPrompt(agent: Agent, prompt: string): Promise<CodexSessionPromptResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const response = await this.client.request<TurnStartResponse>('turn/start', {
      threadId: session.threadId,
      input: [
        {
          type: 'text',
          text: prompt,
          text_elements: [],
        },
      ],
      cwd: expandHome(agent.folder),
    });

    return {
      threadId: session.threadId,
      turnId: response.turn.id,
    };
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private async ensureSession(agent: Agent): Promise<AgentSession> {
    const existing = this.sessionsByAgentId.get(agent.id);
    if (existing) {
      return existing;
    }

    const response = await this.client.request<ThreadStartResponse>('thread/start', {
      cwd: expandHome(agent.folder),
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      serviceName: 'codex_claw',
    });

    const session = {
      agentId: agent.id,
      threadId: response.thread.id,
    };
    this.sessionsByAgentId.set(agent.id, session);
    this.agentIdsByThreadId.set(session.threadId, agent.id);

    return session;
  }

  private handleNotification(notification: CodexNotification): void {
    if (notification.method === 'thread/started') {
      const params = notification.params as { thread: CodexThread };
      const threadId = params.thread.id;
      const agentId = this.agentIdsByThreadId.get(threadId);
      if (agentId) {
        this.emit({
          agentId,
          threadId,
          type: 'thread.started',
          payload: {
            cwd: params.thread.cwd,
          },
        });
      }
      return;
    }

    if (notification.method === 'turn/started') {
      const params = notification.params as { threadId: string; turn: CodexTurn };
      this.emitForThread(params.threadId, {
        turnId: params.turn.id,
        type: 'turn.started',
        payload: {
          status: params.turn.status,
        },
      });
      return;
    }

    if (notification.method === 'item/agentMessage/delta') {
      const params = notification.params as { threadId: string; turnId: string; itemId: string; delta: string };
      this.emitForThread(params.threadId, {
        turnId: params.turnId,
        type: 'message.delta',
        payload: {
          itemId: params.itemId,
          delta: params.delta,
        },
      });
      return;
    }

    if (notification.method === 'item/started' || notification.method === 'item/completed') {
      const params = notification.params as { threadId: string; turnId: string; item: unknown };
      this.emitForThread(params.threadId, {
        turnId: params.turnId,
        type: notification.method === 'item/started' ? 'item.started' : 'item.completed',
        payload: {
          item: params.item,
        },
      });
      return;
    }

    if (notification.method === 'rawResponseItem/completed') {
      const params = notification.params as { threadId: string; turnId: string; item: CodexRawResponseItem };
      const event = rawResponseItemToEvent(params.item);
      if (event) {
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          ...event,
        });
      }
      return;
    }

    if (notification.method === 'item/commandExecution/outputDelta') {
      const params = notification.params as { threadId: string; turnId: string; itemId: string; delta: string };
      this.emitForThread(params.threadId, {
        turnId: params.turnId,
        type: 'item.updated',
        payload: {
          itemId: params.itemId,
          delta: params.delta,
          kind: 'commandExecution.outputDelta',
        },
      });
      return;
    }

    if (notification.method === 'item/fileChange/patchUpdated') {
      const params = notification.params as { threadId: string; turnId: string; itemId: string; changes: unknown[] };
      this.emitForThread(params.threadId, {
        turnId: params.turnId,
        type: 'item.updated',
        payload: {
          itemId: params.itemId,
          changes: params.changes,
          kind: 'fileChange.patchUpdated',
        },
      });
      return;
    }

    if (notification.method === 'item/mcpToolCall/progress') {
      const params = notification.params as { threadId: string; turnId: string; itemId: string; message: string };
      this.emitForThread(params.threadId, {
        turnId: params.turnId,
        type: 'item.updated',
        payload: {
          itemId: params.itemId,
          message: params.message,
          kind: 'mcpToolCall.progress',
        },
      });
      return;
    }

    if (notification.method === 'turn/completed') {
      const params = notification.params as { threadId: string; turn: CodexTurn };
      this.emitForThread(params.threadId, {
        turnId: params.turn.id,
        type: 'turn.completed',
        payload: {
          status: params.turn.status,
        },
      });
    }
  }

  private emitForThread(threadId: string, event: Omit<MainToRendererEvent, 'seq' | 'agentId' | 'threadId' | 'occurredAt'>): void {
    const agentId = this.agentIdsByThreadId.get(threadId);
    if (!agentId) {
      return;
    }

    this.emit({
      agentId,
      threadId,
      ...event,
    });
  }

  private emit(event: Omit<CodexSessionEvent, 'seq' | 'occurredAt'>): void {
    const fullEvent: CodexSessionEvent = {
      ...event,
      seq: ++this.seq,
      occurredAt: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      listener(fullEvent);
    }
  }
}

export function expandHome(folder: string): string {
  if (folder === '~') {
    return os.homedir();
  }

  if (folder.startsWith('~/')) {
    return path.join(os.homedir(), folder.slice(2));
  }

  return folder;
}
