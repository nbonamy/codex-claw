import os from 'node:os';
import path from 'node:path';
import type { Agent, AgentContextUsage, AgentStatus, AskUserAnswers, AskUserQuestion, BackendModelOption, BackendSkillSummary, ClientRequest, ClientRequestResponse, ConfirmToolRequest, MainToRendererEvent, RendererMessage, SendPromptOptions, ToolConfirmationDecision } from '../../shared/contracts';
import { logMain, warnMain } from '../log';
import { buildCodexClawThreadConfig } from '../mcp/codex-config';
import type { CodexRpcClient, CodexServerRequest, CodexServerRequestResponder } from './rpc-client';
import {
  codexThreadItemToToolPart,
  commandOutputDeltaToToolPartUpdate,
  fileChangePatchToToolPartUpdate,
  lineDiffFromUnifiedDiff,
  mcpProgressToToolPartUpdate,
} from './tool-part-adapter';
import {
  codexSkillToSummary,
} from './protocol';
import type {
  CodexNotification,
  CodexModelListResponse,
  CodexRawResponseItem,
  CodexRateLimitSnapshot,
  CodexReviewTarget,
  CodexSkillsListResponse,
  CodexThread,
  CodexThreadGoal,
  CodexThreadStatus,
  CodexThreadTokenUsage,
  CodexTurnPlanStep,
  CodexSessionEvent,
  CodexSessionPromptResult,
  ReviewStartResponse,
  ThreadCompactStartResponse,
  CodexTurn,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadRollbackResponse,
  ThreadStartResponse,
  TurnInterruptResponse,
  TurnStartResponse,
  TurnSteerResponse,
} from './protocol';
import { rawResponseItemToEvent } from './raw-response-item-adapter';
import { codexThreadHistoryToRendererMessages } from './thread-history-adapter';

type AgentSession = {
  agentId: string;
  threadId: string;
};

type PendingClientRequest = {
  kind: 'ask_user' | 'mcp_tool_approval';
  responder: CodexServerRequestResponder;
  threadId: string;
  turnId?: string;
};

type EventListener = (event: CodexSessionEvent) => void;

export type CodexAgentSessionManagerOptions = {
  clawMcpServerUrl?: string | null;
};

export type CodexSessionCommandResult = {
  threadId: string;
  turnId?: string;
};

export type CodexSessionGoalSetResult = {
  threadId: string;
  goal: CodexThreadGoal;
};

export type CodexSessionGoalClearResult = {
  threadId: string;
  cleared: boolean;
};

export class CodexAgentSessionManager {
  private seq = 0;
  private readonly sessionsByAgentId = new Map<string, AgentSession>();
  private readonly agentIdsByThreadId = new Map<string, string>();
  private readonly activeTurnIdsByThreadId = new Map<string, string>();
  private readonly turnIdsByThreadId = new Map<string, string[]>();
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

  async listModels(includeHidden = false): Promise<BackendModelOption[]> {
    await this.start();

    const models: BackendModelOption[] = [];
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

  async listSkills(agent: Agent, forceReload = false): Promise<BackendSkillSummary[]> {
    await this.start();

    const response = await this.client.request<CodexSkillsListResponse>('skills/list', {
      cwds: [expandHome(agent.folder)],
      forceReload,
    });
    const entry = response.data[0];
    if (!entry) {
      return [];
    }

    return entry.skills
      .filter((skill) => skill.enabled)
      .map(codexSkillToSummary);
  }

  async sendPrompt(agent: Agent, prompt: string, options: SendPromptOptions = {}): Promise<CodexSessionPromptResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const codexOptions = options.backendOptions?.kind === 'codex' ? options.backendOptions : undefined;
    const turnParams: Record<string, unknown> = {
      threadId: session.threadId,
      input: [
        {
          type: 'text',
          text: prompt,
          text_elements: [],
        },
        ...(codexOptions?.skills ?? []).map((skill) => ({
          type: 'skill',
          name: skill.name,
          path: skill.path,
        })),
      ],
      cwd: expandHome(agent.folder),
    };
    if (options.model) {
      turnParams.model = options.model;
    }
    if (codexOptions?.reasoningEffort) {
      turnParams.effort = codexOptions.reasoningEffort;
    }
    if (options.planMode) {
      const collaborationSettings: Record<string, unknown> = {
        reasoning_effort: codexOptions?.reasoningEffort ?? 'medium',
        developer_instructions: null,
      };
      if (options.model) {
        collaborationSettings.model = options.model;
      }
      turnParams.collaborationMode = {
        mode: 'plan',
        settings: collaborationSettings,
      };
    } else if (options.planMode === false && options.model) {
      turnParams.collaborationMode = {
        mode: 'default',
        settings: {
          model: options.model,
          reasoning_effort: codexOptions?.reasoningEffort ?? null,
          developer_instructions: null,
        },
      };
    }

    const response = await this.client.request<TurnStartResponse>('turn/start', turnParams);
    this.activeTurnIdsByThreadId.set(session.threadId, response.turn.id);
    this.recordTurnId(session.threadId, response.turn.id);

    return {
      threadId: session.threadId,
      turnId: response.turn.id,
    };
  }

  async compactThread(agent: Agent): Promise<CodexSessionCommandResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    await this.client.request<ThreadCompactStartResponse>('thread/compact/start', {
      threadId: session.threadId,
    });

    return {
      threadId: session.threadId,
    };
  }

  async setThreadGoal(agent: Agent, objective: string): Promise<CodexSessionGoalSetResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const response = await this.client.request<{ goal: CodexThreadGoal }>('thread/goal/set', {
      threadId: session.threadId,
      objective,
      status: 'active',
    });

    return {
      threadId: session.threadId,
      goal: response.goal,
    };
  }

  async clearThreadGoal(agent: Agent): Promise<CodexSessionGoalClearResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const response = await this.client.request<{ cleared: boolean }>('thread/goal/clear', {
      threadId: session.threadId,
    });

    return {
      threadId: session.threadId,
      cleared: response.cleared,
    };
  }

  async reviewThread(agent: Agent, target: CodexReviewTarget): Promise<CodexSessionCommandResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const response = await this.client.request<ReviewStartResponse>('review/start', {
      threadId: session.threadId,
      target,
      delivery: 'inline',
    });
    if (response.reviewThreadId !== session.threadId) {
      throw new Error(`Codex review/start returned unexpected review thread '${response.reviewThreadId}' for inline review on thread '${session.threadId}'.`);
    }
    this.activeTurnIdsByThreadId.set(response.reviewThreadId, response.turn.id);
    this.recordTurnId(response.reviewThreadId, response.turn.id);

    return {
      threadId: session.threadId,
      turnId: response.turn.id,
    };
  }

  async steerPrompt(agent: Agent, prompt: string): Promise<CodexSessionPromptResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const expectedTurnId = this.activeTurnIdsByThreadId.get(session.threadId);
    if (!expectedTurnId) {
      throw new Error('No active Codex turn to steer.');
    }

    const response = await this.client.request<TurnSteerResponse>('turn/steer', {
      threadId: session.threadId,
      expectedTurnId,
      input: [
        {
          type: 'text',
          text: prompt,
          text_elements: [],
        },
      ],
    });
    this.activeTurnIdsByThreadId.set(session.threadId, response.turnId);

    return {
      threadId: session.threadId,
      turnId: response.turnId,
    };
  }

  async interruptTurn(agent: Agent): Promise<CodexSessionPromptResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const turnId = this.activeTurnIdsByThreadId.get(session.threadId);
    if (!turnId) {
      throw new Error('No active Codex turn to interrupt.');
    }

    logMain('codex-interrupt', 'sending turn/interrupt', {
      agentId: agent.id,
      threadId: session.threadId,
      turnId,
    });

    await this.client.request<TurnInterruptResponse>('turn/interrupt', {
      threadId: session.threadId,
      turnId,
    });

    logMain('codex-interrupt', 'turn/interrupt acknowledged', {
      agentId: agent.id,
      threadId: session.threadId,
      turnId,
    });

    return {
      threadId: session.threadId,
      turnId,
    };
  }

  async rollbackToTurn(agent: Agent, targetTurnId: string): Promise<{ threadId: string; messages: RendererMessage[] }> {
    await this.start();

    const session = await this.ensureSession(agent);
    const turnIds = await this.turnIdsForRollback(session.threadId, targetTurnId);
    const targetIndex = turnIds.indexOf(targetTurnId);
    if (targetIndex === -1) {
      throw new Error(`Cannot roll back to unknown Codex turn '${targetTurnId}'.`);
    }

    const numTurns = turnIds.length - targetIndex;
    if (numTurns < 1) {
      throw new Error('Cannot roll back without at least one Codex turn.');
    }

    const response = await this.client.request<ThreadRollbackResponse>('thread/rollback', {
      threadId: session.threadId,
      numTurns,
    });
    this.recordThreadTurns(response.thread);
    this.activeTurnIdsByThreadId.delete(session.threadId);

    return {
      threadId: session.threadId,
      messages: codexThreadHistoryToRendererMessages(response.thread, agent.id),
    };
  }

  async hydrateAgent(agent: Agent): Promise<string | null> {
    if (!codexThreadId(agent)) {
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
    if (pending.kind === 'ask_user') {
      pending.responder.resolve(toolRequestUserInputResponseFromAnswers(response.payload?.answers));
    } else {
      pending.responder.resolve(mcpServerElicitationResponseFromDecision(response.payload?.decision ?? 'deny'));
    }
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
    const threadConfig = buildCodexClawThreadConfig(agent, this.options.clawMcpServerUrl ?? null);
    const existingThreadId = codexThreadId(agent);
    const shouldResume = Boolean(existingThreadId);
    const response = shouldResume
      ? await this.client.request<ThreadResumeResponse>('thread/resume', {
        threadId: existingThreadId,
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
    this.recordThreadTurns(response.thread);

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
      case 'skills/changed': {
        this.emit({
          type: 'skills.changed',
          payload: {},
        });
        return;
      }

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
        const mode = collaborationModeFromThreadSettings(params.threadSettings);
        if (mode) {
          this.emitForThread(params.threadId, {
            type: 'thread.modeUpdated',
            payload: {
              mode,
            },
          });
        }
        return;
      }

      case 'thread/goal/updated': {
        const params = notification.params as { threadId: string; turnId: string | null; goal: CodexThreadGoal };
        this.emitForThread(params.threadId, {
          turnId: params.turnId ?? undefined,
          type: 'thread.goalUpdated',
          payload: {
            goal: params.goal,
          },
        });
        return;
      }

      case 'thread/goal/cleared': {
        const params = notification.params as { threadId: string };
        this.emitForThread(params.threadId, {
          type: 'thread.goalCleared',
          payload: {},
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
        this.activeTurnIdsByThreadId.set(params.threadId, params.turn.id);
        this.recordTurnId(params.threadId, params.turn.id);
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

      case 'item/plan/delta': {
        const params = notification.params as { threadId: string; turnId: string; itemId: string; delta: string };
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'turn.proposedPlanDelta',
          payload: {
            itemId: params.itemId,
            delta: params.delta,
          },
        });
        return;
      }

      case 'turn/plan/updated': {
        const params = notification.params as { threadId: string; turnId: string; explanation: string | null; plan: CodexTurnPlanStep[] };
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'turn.planUpdated',
          payload: {
            explanation: params.explanation,
            plan: params.plan,
          },
        });
        return;
      }

      case 'turn/diff/updated': {
        const params = notification.params as { threadId: string; turnId: string; diff: string };
        const lineDiff = lineDiffFromUnifiedDiff(params.diff);
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'diff.updated',
          payload: {
            addedLines: lineDiff.addedLines,
            diff: params.diff,
            removedLines: lineDiff.removedLines,
          },
        });
        return;
      }

      case 'item/started':
      case 'item/completed': {
        const params = notification.params as { threadId: string; turnId: string; item: unknown };
        if (notification.method === 'item/started' && isContextCompactionItem(params.item)) {
          this.emitForThread(params.threadId, {
            turnId: params.turnId,
            type: 'context.compactionStarted',
            payload: {
              itemId: params.item.id,
            },
          });
          return;
        }
        const reviewText = notification.method === 'item/completed' ? exitedReviewText(params.item) : '';
        const planText = notification.method === 'item/completed' ? completedPlanText(params.item) : '';
        this.logMcpToolItem(notification.method, params.threadId, params.item);
        const toolPart = codexThreadItemToToolPart(params.item);
        if (toolPart) {
          this.emitForThread(params.threadId, {
            turnId: params.turnId,
            type: notification.method === 'item/started' ? 'item.started' : 'item.completed',
            payload: { toolPart },
          });
        }
        if (planText) {
          this.emitForThread(params.threadId, {
            turnId: params.turnId,
            type: 'turn.proposedPlanCompleted',
            payload: {
              itemId: codexItemId(params.item),
              markdown: planText,
            },
          });
        }
        if (reviewText) {
          this.emitForThread(params.threadId, {
            turnId: params.turnId,
            type: 'message.delta',
            payload: {
              itemId: codexItemId(params.item),
              delta: reviewText,
            },
          });
          this.emitForThread(params.threadId, {
            turnId: params.turnId,
            type: 'turn.completed',
            payload: {
              status: 'completed',
            },
          });
        }
        return;
      }

      case 'thread/compacted': {
        const params = notification.params as { threadId: string; turnId: string };
        this.emitForThread(params.threadId, {
          turnId: params.turnId,
          type: 'context.compactionStarted',
          payload: {},
        });
        return;
      }

      case 'rawResponseItem/completed': {
        const params = notification.params as { threadId: string; turnId: string; item: CodexRawResponseItem };
        const event = rawResponseItemToEvent(params.item);
        this.logRawResponseItem(params.threadId, params.item, event);
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
        if (this.activeTurnIdsByThreadId.get(params.threadId) === params.turn.id) {
          this.activeTurnIdsByThreadId.delete(params.threadId);
        }
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
      case 'item/tool/requestUserInput':
        return this.handleToolRequestUserInput(request, responder);
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
      kind: 'mcp_tool_approval',
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

  private handleToolRequestUserInput(request: CodexServerRequest, responder: CodexServerRequestResponder): boolean {
    const clientRequest = clientRequestFromToolRequestUserInput(request);
    if (!clientRequest || !isRecord(request.params) || typeof request.params.threadId !== 'string') {
      return false;
    }

    const threadId = request.params.threadId;
    const turnId = typeof request.params.turnId === 'string' ? request.params.turnId : undefined;
    if (!this.agentIdsByThreadId.has(threadId)) {
      return false;
    }

    this.pendingClientRequests.set(clientRequest.id, {
      kind: 'ask_user',
      responder,
      threadId,
      turnId,
    });

    this.emitForThread(threadId, {
      turnId,
      type: 'toolInput.requested',
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

  private logRawResponseItem(threadId: string, item: CodexRawResponseItem, event: Pick<MainToRendererEvent, 'type' | 'payload'> | null): void {
    logMain('codex-raw-response', event ? 'adapted' : 'ignored', {
      agentId: this.agentIdsByThreadId.get(threadId),
      itemId: rawItemString(item.id) ?? rawItemString(item.call_id),
      itemType: rawItemString(item.type),
      role: rawItemString(item.role),
      eventType: event?.type,
      textLength: rawResponseTextLength(item),
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

  private async turnIdsForRollback(threadId: string, targetTurnId: string): Promise<string[]> {
    const knownTurnIds = this.turnIdsByThreadId.get(threadId) ?? [];
    if (knownTurnIds.includes(targetTurnId)) {
      return knownTurnIds;
    }

    const response = await this.client.request<ThreadReadResponse>('thread/read', {
      threadId,
      includeTurns: true,
    });
    this.recordThreadTurns(response.thread);
    return this.turnIdsByThreadId.get(threadId) ?? [];
  }

  private recordThreadTurns(thread: CodexThread): void {
    const turnIds = Array.isArray(thread.turns)
      ? thread.turns.map((turn) => turn.id).filter((turnId): turnId is string => Boolean(turnId))
      : [];
    if (turnIds.length > 0) {
      this.turnIdsByThreadId.set(thread.id, turnIds);
    } else if (!this.turnIdsByThreadId.has(thread.id)) {
      this.turnIdsByThreadId.set(thread.id, []);
    }
  }

  private recordTurnId(threadId: string, turnId: string): void {
    const turnIds = this.turnIdsByThreadId.get(threadId) ?? [];
    if (!turnIds.includes(turnId)) {
      this.turnIdsByThreadId.set(threadId, [...turnIds, turnId]);
    }
  }
}

function codexThreadId(agent: Agent): string | undefined {
  return agent.backendSession?.kind === 'codex' ? agent.backendSession.threadId : undefined;
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

function rawItemString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function rawResponseTextLength(item: CodexRawResponseItem): number | undefined {
  const content = Array.isArray(item.content) ? item.content : [];
  const length = content.reduce((total, part) => {
    if (!isRecord(part) || typeof part.text !== 'string') {
      return total;
    }

    return total + part.text.length;
  }, 0);
  return length > 0 ? length : undefined;
}

function collaborationModeFromThreadSettings(threadSettings: unknown): 'default' | 'plan' | null {
  if (!isRecord(threadSettings) || !isRecord(threadSettings.collaborationMode)) {
    return null;
  }

  const mode = threadSettings.collaborationMode.mode;
  return mode === 'default' || mode === 'plan' ? mode : null;
}

function codexModelToOption(model: CodexModelListResponse['data'][number]): BackendModelOption {
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

function clientRequestFromToolRequestUserInput(request: CodexServerRequest): ClientRequest | null {
  if (!isRecord(request.params)) {
    return null;
  }

  const params = request.params;
  if (
    typeof params.itemId !== 'string' ||
    !Array.isArray(params.questions)
  ) {
    return null;
  }

  const questions = params.questions.map(toolRequestUserInputQuestion).filter((question): question is AskUserQuestion => question !== null);
  if (questions.length === 0) {
    return null;
  }

  return {
    id: String(request.id),
    kind: 'ask_user',
    payload: {
      request: {
        itemId: params.itemId,
        questions,
      },
    },
  };
}

function toolRequestUserInputQuestion(value: unknown): AskUserQuestion | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.header !== 'string' ||
    typeof value.question !== 'string' ||
    typeof value.isOther !== 'boolean' ||
    typeof value.isSecret !== 'boolean'
  ) {
    return null;
  }

  return {
    id: value.id,
    header: value.header,
    question: value.question,
    isOther: value.isOther,
    isSecret: value.isSecret,
    ...(typeof value.multiSelect === 'boolean' ? { multiSelect: value.multiSelect } : {}),
    options: toolRequestUserInputOptions(value.options),
  };
}

function toolRequestUserInputOptions(value: unknown): AskUserQuestion['options'] {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.label !== 'string' || typeof entry.description !== 'string') {
      return null;
    }

    return {
      label: entry.label,
      description: entry.description,
    };
  }).filter((entry): entry is NonNullable<AskUserQuestion['options']>[number] => entry !== null);
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

function toolRequestUserInputResponseFromAnswers(answers: AskUserAnswers | undefined): { answers: AskUserAnswers } {
  return {
    answers: answers ?? {},
  };
}

function isContextCompactionItem(item: unknown): item is { id: string; type: 'contextCompaction' } {
  return isRecord(item) && item.type === 'contextCompaction' && typeof item.id === 'string';
}

function exitedReviewText(item: unknown): string {
  return isRecord(item) && item.type === 'exitedReviewMode' && typeof item.review === 'string'
    ? item.review
    : '';
}

function completedPlanText(item: unknown): string {
  return isRecord(item) && item.type === 'plan' && typeof item.text === 'string'
    ? item.text
    : '';
}

function codexItemId(item: unknown): string | undefined {
  return isRecord(item) && typeof item.id === 'string' ? item.id : undefined;
}
