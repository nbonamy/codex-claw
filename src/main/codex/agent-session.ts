import os from 'node:os';
import path from 'node:path';
import type { Agent, AgentContextUsage, AgentStatus, ClientRequest, ClientRequestResponse, CodexModelOption, ConfirmToolRequest, MainToRendererEvent, SendPromptOptions, ToolConfirmationDecision } from '../../shared/contracts';
import { logMain, warnMain } from '../log';
import { buildCodexClawThreadConfig } from '../mcp/codex-config';
import type { CodexRpcClient, CodexServerRequest, CodexServerRequestResponder } from './rpc-client';
import {
  codexThreadItemToToolPart,
  commandOutputDeltaToToolPartUpdate,
  fileChangePatchToToolPartUpdate,
  mcpProgressToToolPartUpdate,
} from './tool-part-adapter';
import type {
  CodexNotification,
  CodexModelListResponse,
  CodexRawResponseItem,
  CodexRateLimitSnapshot,
  CodexThread,
  CodexThreadStatus,
  CodexThreadTokenUsage,
  CodexSessionEvent,
  CodexSessionPromptResult,
  CodexTurn,
  ThreadResumeResponse,
  ThreadStartResponse,
  TurnStartResponse,
} from './protocol';
import { rawResponseItemToEvent } from './raw-response-item-adapter';
import { codexThreadHistoryToRendererMessages } from './thread-history-adapter';

type AgentSession = {
  agentId: string;
  threadId: string;
};

type PendingClientRequest = {
  responder: CodexServerRequestResponder;
  threadId: string;
  turnId?: string;
};

type EventListener = (event: CodexSessionEvent) => void;

export type CodexAgentSessionManagerOptions = {
  clawMcpEnabled?: boolean;
};

export class CodexAgentSessionManager {
  private seq = 0;
  private readonly sessionsByAgentId = new Map<string, AgentSession>();
  private readonly agentIdsByThreadId = new Map<string, string>();
  private readonly pendingClientRequests = new Map<string, PendingClientRequest>();
  private readonly listeners = new Set<EventListener>();
  private initialized = false;
  private startPromise: Promise<void> | null = null;

  constructor(
    private readonly client: CodexRpcClient,
    private readonly options: CodexAgentSessionManagerOptions = {},
  ) {
    this.client.onNotification((message) => this.handleNotification(message as CodexNotification));
    this.client.onServerRequest((request, responder) => this.handleServerRequest(request, responder));
  }

  async start(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.startPromise) {
      this.startPromise = (async () => {
        await this.client.start();
        await this.client.initialize();
        this.initialized = true;
      })();
    }

    try {
      await this.startPromise;
    } finally {
      if (!this.initialized) {
        this.startPromise = null;
      }
    }
  }

  async listModels(includeHidden = false): Promise<CodexModelOption[]> {
    await this.start();

    const models: CodexModelOption[] = [];
    let cursor: string | null | undefined = null;

    do {
      const response: CodexModelListResponse = await this.client.request<CodexModelListResponse>('model/list', {
        cursor,
        includeHidden,
      });
      models.push(...response.data.map(codexModelToOption));
      cursor = response.nextCursor;
    } while (cursor);

    return models;
  }

  async sendPrompt(agent: Agent, prompt: string, options: SendPromptOptions = {}): Promise<CodexSessionPromptResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const turnParams: Record<string, unknown> = {
      threadId: session.threadId,
      input: [
        {
          type: 'text',
          text: prompt,
          text_elements: [],
        },
      ],
      cwd: expandHome(agent.folder),
    };
    if (options.model) {
      turnParams.model = options.model;
    }
    if (options.reasoningEffort) {
      turnParams.effort = options.reasoningEffort;
    }

    const response = await this.client.request<TurnStartResponse>('turn/start', turnParams);

    return {
      threadId: session.threadId,
      turnId: response.turn.id,
    };
  }

  async hydrateAgent(agent: Agent): Promise<string | null> {
    if (!agent.codexThreadId) {
      return null;
    }

    await this.start();
    const session = await this.ensureSession(agent);
    return session.threadId;
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

  async respondToClientRequest(response: ClientRequestResponse): Promise<void> {
    const pending = this.pendingClientRequests.get(response.id);
    if (!pending) {
      throw new Error(`Unknown client request '${response.id}'.`);
    }

    this.pendingClientRequests.delete(response.id);
    pending.responder.resolve(mcpServerElicitationResponseFromDecision(response.payload?.decision ?? 'deny'));
    this.emitForThread(pending.threadId, {
      turnId: pending.turnId,
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    });
  }

  private async ensureSession(agent: Agent): Promise<AgentSession> {
    const existing = this.sessionsByAgentId.get(agent.id);
    if (existing) {
      return existing;
    }

    const cwd = expandHome(agent.folder);
    const threadConfig = buildCodexClawThreadConfig(agent, this.options.clawMcpEnabled ?? false);
    const shouldResume = Boolean(agent.codexThreadId);
    const response = shouldResume
      ? await this.client.request<ThreadResumeResponse>('thread/resume', {
        threadId: agent.codexThreadId,
        cwd,
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        ...threadConfig,
      })
      : await this.client.request<ThreadStartResponse>('thread/start', {
        cwd,
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        serviceName: 'codex_claw',
        ...threadConfig,
      });

    const session = {
      agentId: agent.id,
      threadId: response.thread.id,
    };
    this.sessionsByAgentId.set(agent.id, session);
    this.agentIdsByThreadId.set(session.threadId, agent.id);

    if (shouldResume) {
      const messages = codexThreadHistoryToRendererMessages(response.thread, agent.id);
      if (messages.length > 0) {
        this.emit({
          agentId: agent.id,
          threadId: session.threadId,
          type: 'thread.historyLoaded',
          payload: {
            messages,
          },
        });
      }
    }

    return session;
  }

  private handleNotification(notification: CodexNotification): void {
    switch (notification.method) {
      case 'thread/started': {
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

      case 'thread/settings/updated': {
        const params = notification.params as { threadId: string; threadSettings: unknown };
        this.emitForThread(params.threadId, {
          type: 'thread.settingsUpdated',
          payload: {
            threadSettings: params.threadSettings,
          },
        });
        return;
      }

      case 'thread/tokenUsage/updated': {
        const params = notification.params as { threadId: string; turnId: string; tokenUsage: CodexThreadTokenUsage };
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'thread.tokenUsageUpdated',
          payload: {
            contextUsage: contextUsageFromCodexTokenUsage(params.tokenUsage),
          },
        });
        return;
      }

      case 'thread/status/changed': {
        const params = notification.params as { threadId: string; status: CodexThreadStatus };
        this.emitForThread(params.threadId, {
          type: 'agent.statusChanged',
          payload: agentStatusFromCodexThreadStatus(params.status),
        });
        return;
      }

      case 'turn/started': {
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

      case 'item/agentMessage/delta': {
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

      case 'item/started':
      case 'item/completed': {
        const params = notification.params as { threadId: string; turnId: string; item: unknown };
        this.logMcpToolItem(notification.method, params.threadId, params.item);
        const toolPart = codexThreadItemToToolPart(params.item);
        if (toolPart) {
          this.emitForThread(params.threadId, {
            turnId: params.turnId,
            type: notification.method === 'item/started' ? 'item.started' : 'item.completed',
            payload: { toolPart },
          });
        }
        return;
      }

      case 'rawResponseItem/completed': {
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

      case 'item/commandExecution/outputDelta': {
        const params = notification.params as { threadId: string; turnId: string; itemId: string; delta: string };
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'item.updated',
          payload: commandOutputDeltaToToolPartUpdate(params.itemId, params.delta),
        });
        return;
      }

      case 'item/fileChange/patchUpdated': {
        const params = notification.params as { threadId: string; turnId: string; itemId: string; changes: unknown[] };
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'item.updated',
          payload: fileChangePatchToToolPartUpdate(params.itemId, params.changes),
        });
        return;
      }

      case 'item/mcpToolCall/progress': {
        const params = notification.params as { threadId: string; turnId: string; itemId: string; message: string };
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'item.updated',
          payload: mcpProgressToToolPartUpdate(params.itemId, params.message),
        });
        return;
      }

      case 'serverRequest/resolved': {
        const params = notification.params as { threadId: string; requestId: string | number };
        const pending = this.pendingClientRequests.get(String(params.requestId));
        this.pendingClientRequests.delete(String(params.requestId));
        if (pending) {
          this.emitForThread(params.threadId, {
            turnId: pending.turnId,
            type: 'agent.statusChanged',
            payload: { type: 'working' },
          });
        }
        return;
      }

      case 'account/rateLimits/updated': {
        const params = notification.params as { rateLimits: CodexRateLimitSnapshot };
        this.emit({
          type: 'account.rateLimitsUpdated',
          payload: {
            rateLimits: params.rateLimits,
          },
        });
        return;
      }

      case 'turn/completed': {
        const params = notification.params as { threadId: string; turn: CodexTurn };
        this.emitForThread(params.threadId, {
          turnId: params.turn.id,
          type: 'turn.completed',
          payload: {
            status: params.turn.status,
          },
        });
        return;
      }

      default:
        warnMain('codex-notification', 'not implemented', {
          method: notification.method,
          ...summarizeNotificationParams(notification.params),
        });
    }
  }

  private handleServerRequest(request: CodexServerRequest, responder: CodexServerRequestResponder): boolean {
    switch (request.method) {
      case 'mcpServer/elicitation/request':
        return this.handleMcpServerElicitationRequest(request, responder);
      default:
        return false;
    }
  }

  private handleMcpServerElicitationRequest(request: CodexServerRequest, responder: CodexServerRequestResponder): boolean {
    const clientRequest = clientRequestFromMcpServerElicitation(request);
    if (!clientRequest || !isRecord(request.params) || typeof request.params.threadId !== 'string') {
      return false;
    }

    const threadId = request.params.threadId;
    const turnId = typeof request.params.turnId === 'string' ? request.params.turnId : undefined;
    if (!this.agentIdsByThreadId.has(threadId)) {
      return false;
    }

    this.pendingClientRequests.set(clientRequest.id, {
      responder,
      threadId,
      turnId,
    });

    this.emitForThread(threadId, {
      turnId,
      type: 'approval.requested',
      payload: clientRequest,
    });

    return true;
  }

  private logMcpToolItem(method: 'item/started' | 'item/completed', threadId: string, item: unknown): void {
    if (!isRecord(item) || item.type !== 'mcpToolCall') {
      return;
    }

    logMain('codex-event', method, {
      agentId: this.agentIdsByThreadId.get(threadId),
      itemId: typeof item.id === 'string' ? item.id : undefined,
      server: typeof item.server === 'string' ? item.server : undefined,
      tool: typeof item.tool === 'string' ? item.tool : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      hasResult: item.result !== null && item.result !== undefined,
      resultKeys: isRecord(item.result) ? Object.keys(item.result) : undefined,
      hasError: item.error !== null && item.error !== undefined,
    });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function codexModelToOption(model: CodexModelListResponse['data'][number]): CodexModelOption {
  return {
    id: model.id,
    model: model.model,
    displayName: model.displayName,
    description: model.description,
    hidden: model.hidden,
    supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({
      reasoningEffort: effort.reasoningEffort,
      description: effort.description,
    })),
    defaultReasoningEffort: model.defaultReasoningEffort,
    isDefault: model.isDefault,
  };
}

function contextUsageFromCodexTokenUsage(tokenUsage: CodexThreadTokenUsage): AgentContextUsage {
  const modelContextWindow = tokenUsage.modelContextWindow;
  const contextTokens = tokenUsage.last.totalTokens;
  const usedPercent = typeof modelContextWindow === 'number' && modelContextWindow > 0
    ? Math.min(100, Math.max(0, (contextTokens / modelContextWindow) * 100))
    : null;

  return {
    totalTokens: tokenUsage.total.totalTokens,
    inputTokens: tokenUsage.total.inputTokens,
    cachedInputTokens: tokenUsage.total.cachedInputTokens,
    outputTokens: tokenUsage.total.outputTokens,
    reasoningOutputTokens: tokenUsage.total.reasoningOutputTokens,
    lastTotalTokens: tokenUsage.last.totalTokens,
    modelContextWindow,
    usedPercent,
  };
}

function summarizeNotificationParams(params: unknown): Record<string, unknown> {
  if (!isRecord(params)) {
    return { paramType: typeof params };
  }

  return {
    paramKeys: Object.keys(params),
    threadId: stringValue(params.threadId),
    turnId: stringValue(params.turnId),
    itemId: stringValue(params.itemId),
    requestId: stringValue(params.requestId),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function agentStatusFromCodexThreadStatus(status: CodexThreadStatus): AgentStatus {
  switch (status.type) {
    case 'active':
      if (status.activeFlags.includes('waitingOnApproval')) {
        return { type: 'awaitingInput', detail: 'Waiting for approval' };
      }
      if (status.activeFlags.includes('waitingOnUserInput')) {
        return { type: 'awaitingInput', detail: 'Waiting for user input' };
      }
      return { type: 'working' };
    case 'idle':
    case 'notLoaded':
      return { type: 'idle' };
    case 'systemError':
      return { type: 'error', message: 'Codex app-server reported a system error.' };
  }
}

function clientRequestFromMcpServerElicitation(request: CodexServerRequest): ClientRequest | null {
  if (!isRecord(request.params)) {
    return null;
  }

  const params = request.params;
  if (
    params.mode !== 'form' ||
    typeof params.serverName !== 'string' ||
    typeof params.message !== 'string' ||
    !isRecord(params._meta) ||
    params._meta.codex_approval_kind !== 'mcp_tool_call'
  ) {
    return null;
  }

  const meta = params._meta;
  const serverName = params.serverName;
  const toolName = stringValue(meta.tool_name) ?? stringValue(meta.tool_title) ?? 'tool';
  const confirmation: ConfirmToolRequest = {
    argumentsPreview: argumentsPreviewFromMcpToolApprovalMeta(meta),
    integrationId: serverName,
    integrationName: stringValue(meta.connector_name) ?? serverName,
    summary: params.message.trim() || `Allow ${serverName} to run ${toolName}?`,
    toolName,
    allowConversation: persistSupports(meta.persist, 'session'),
    allowAlways: persistSupports(meta.persist, 'always'),
  };

  return {
    id: String(request.id),
    kind: 'confirm_tool',
    payload: {
      confirmation,
    },
  };
}

function argumentsPreviewFromMcpToolApprovalMeta(meta: Record<string, unknown>): string {
  const displayParams = displayParamsPreview(meta.tool_params_display);
  if (displayParams) {
    return displayParams;
  }

  if (meta.tool_params !== undefined) {
    return JSON.stringify(meta.tool_params, null, 2);
  }

  return '';
}

function displayParamsPreview(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  const lines = value
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.name !== 'string') {
        return '';
      }

      const label = typeof entry.display_name === 'string' && entry.display_name.trim()
        ? entry.display_name.trim()
        : entry.name;
      return `${label}: ${formatPreviewValue(entry.value)}`;
    })
    .filter(Boolean);

  return lines.join('\n');
}

function formatPreviewValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function persistSupports(value: unknown, expectedMode: 'always' | 'session'): boolean {
  if (typeof value === 'string') {
    return value === expectedMode;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => entry === expectedMode);
  }

  return false;
}

function mcpServerElicitationResponseFromDecision(decision: ToolConfirmationDecision): {
  action: 'accept' | 'decline';
  content: null;
  _meta: { persist: 'always' | 'session' } | null;
} {
  switch (decision) {
    case 'allow':
      return { action: 'accept', content: null, _meta: null };
    case 'allow_conversation':
      return { action: 'accept', content: null, _meta: { persist: 'session' } };
    case 'always_allow':
      return { action: 'accept', content: null, _meta: { persist: 'always' } };
    case 'deny':
      return { action: 'decline', content: null, _meta: null };
  }
}
