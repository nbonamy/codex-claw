import os from 'node:os';
import path from 'node:path';
import type { Agent, AgentContextUsage, AgentStatus, AskUserAnswers, AskUserQuestion, BackendModelOption, BackendSkillSummary, ClientRequest, ClientRequestResponse, CodexApprovalPreset, ConfirmToolRequest, ConversationSummary, MainToRendererEvent, RendererMessage, SendPromptOptions, ToolConfirmationDecision } from '@codex-claw/shared/contracts';
import { codexApprovalPresetFromDefaults } from '@codex-claw/shared/codex-approval-presets';
import { codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import type { Settings, v2 } from 'codex-app-sdk/codex';
import { logMain, warnMain } from '../log';
import { buildCodexClawThreadConfig } from '../mcp/codex-config';
import type { CodexRpcClient, CodexServerRequest, CodexServerRequestResponder } from './rpc-client';
import {
  codexThreadItemToToolPart,
  commandOutputDeltaToToolPartUpdate,
  fileChangePatchToToolPartUpdate,
  lineDiffFromUnifiedDiff,
  mcpProgressToToolPartUpdate,
  shouldForwardCommandExecutionOutput,
} from './tool-part-adapter';
import {
  codexSkillToSummary,
} from './protocol';
import type {
  CodexNotification,
  CodexModelListResponse,
  CodexConfigRequirements,
  CodexConfigRequirementsReadResponse,
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
  ThreadListResponse,
  CodexTurn,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadRollbackResponse,
  ThreadSetNameResponse,
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
  model: string | null;
};

type PendingClientRequest = {
  kind: 'ask_user' | 'mcp_tool_approval';
  responder: CodexServerRequestResponder;
  threadId: string;
  turnId?: string;
};

type McpServerElicitationRequest = Extract<CodexServerRequest, { method: 'mcpServer/elicitation/request' }>;
type ToolRequestUserInputRequest = Extract<CodexServerRequest, { method: 'item/tool/requestUserInput' }>;

type EventListener = (event: CodexSessionEvent) => void;

export type CodexAgentSessionManagerOptions = {
  clawMcpServerUrl?: string | null;
  readConfigRequirements?: boolean;
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

export type CodexSessionApprovalPresetResult = {
  threadId: string;
  approvalPreset: CodexApprovalPreset;
};

export class CodexAgentSessionManager {
  private seq = 0;
  private readonly sessionsByAgentId = new Map<string, AgentSession>();
  private readonly agentIdsByThreadId = new Map<string, string>();
  private readonly activeTurnIdsByThreadId = new Map<string, string>();
  private readonly turnIdsByThreadId = new Map<string, string[]>();
  private readonly pendingClientRequests = new Map<string, PendingClientRequest>();
  private readonly commandOutputForwardItemIds = new Set<string>();
  private readonly listeners = new Set<EventListener>();
  private initialized = false;
  private startPromise: Promise<void> | null = null;
  private configRequirements: CodexConfigRequirements | null = null;
  private configRequirementsPromise: Promise<CodexConfigRequirements | null> | null = null;

  constructor(
    private readonly client: CodexRpcClient,
    private readonly options: CodexAgentSessionManagerOptions = {},
  ) {
    this.client.onNotification((message) => this.handleNotification(message as CodexNotification));
    this.client.onAnyServerRequest((request, responder) => this.handleServerRequest(request, responder));
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
        await this.readConfigRequirements();
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
      const response: v2.ModelListResponse = await this.client.request('model/list', {
        cursor,
        includeHidden,
      });
      models.push(...response.data.map(codexModelToOption));
      cursor = response.nextCursor;
    } while (cursor);

    return models;
  }

  getCapabilities() {
    return {
      ...codexBackendCapabilities,
      approvalPresets: allowedCodexApprovalPresets(this.configRequirements),
    };
  }

  async listSkills(agent: Agent, forceReload = false): Promise<BackendSkillSummary[]> {
    await this.start();

    const response = await this.client.request('skills/list', {
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
    const turnParams: v2.TurnStartParams = {
      threadId: session.threadId,
      input: [
        {
          type: 'text',
          text: prompt,
          text_elements: [],
        },
        ...(codexOptions?.skills ?? []).map((skill): v2.UserInput => ({
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
    if (typeof options.planMode === 'boolean') {
      const collaborationModel = options.model ?? session.model;
      if (!collaborationModel) {
        throw new Error('Codex did not report the active model required for collaboration mode.');
      }
      const collaborationSettings: Settings = {
        model: collaborationModel,
        reasoning_effort: codexOptions?.reasoningEffort ?? (options.planMode ? 'medium' : null),
        developer_instructions: null,
      };
      turnParams.collaborationMode = {
        mode: options.planMode ? 'plan' : 'default',
        settings: collaborationSettings,
      };
    }

    const response = await this.client.request('turn/start', turnParams);
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
    await this.client.request('thread/compact/start', {
      threadId: session.threadId,
    });

    return {
      threadId: session.threadId,
    };
  }

  async setConversationTitle(agent: Agent, title: string): Promise<void> {
    await this.start();

    const session = await this.ensureSession(agent);
    await this.client.request('thread/name/set', {
      threadId: session.threadId,
      name: title,
    });
  }

  async setThreadGoal(agent: Agent, objective: string): Promise<CodexSessionGoalSetResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const response = await this.client.request('thread/goal/set', {
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
    const response = await this.client.request('thread/goal/clear', {
      threadId: session.threadId,
    });

    return {
      threadId: session.threadId,
      cleared: response.cleared,
    };
  }

  async setApprovalPreset(agent: Agent, preset: CodexApprovalPreset): Promise<CodexSessionApprovalPresetResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const effectivePreset = await this.effectiveApprovalPreset(preset);
    if (!effectivePreset) {
      warnMain('codex', 'codex approval preset update skipped because no Claw preset satisfies app-server config requirements', {
        requestedPreset: preset,
      });
      throw new Error('No Claw approval preset satisfies the Codex app-server requirements.');
    }

    await this.client.request('thread/settings/update', {
      threadId: session.threadId,
      ...codexApprovalThreadSettingsUpdateParams(effectivePreset, expandHome(agent.folder)),
    });

    return {
      threadId: session.threadId,
      approvalPreset: effectivePreset,
    };
  }

  async reviewThread(agent: Agent, target: CodexReviewTarget): Promise<CodexSessionCommandResult> {
    await this.start();

    const session = await this.ensureSession(agent);
    const response = await this.client.request('review/start', {
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

    const response = await this.client.request('turn/steer', {
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

    await this.client.request('turn/interrupt', {
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

  forgetAgentSession(agentId: string): void {
    const existing = this.sessionsByAgentId.get(agentId);
    if (!existing) {
      return;
    }

    this.sessionsByAgentId.delete(agentId);
    if (this.agentIdsByThreadId.get(existing.threadId) === agentId) {
      this.agentIdsByThreadId.delete(existing.threadId);
    }
    this.activeTurnIdsByThreadId.delete(existing.threadId);
    this.turnIdsByThreadId.delete(existing.threadId);
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

    const response = await this.client.request('thread/rollback', {
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

  async readConversationMessages(threadId: string, agentId: string): Promise<RendererMessage[]> {
    await this.start();
    const response = await this.client.request('thread/read', {
      threadId,
      includeTurns: true,
    });
    this.recordThreadTurns(response.thread);
    return codexThreadHistoryToRendererMessages(response.thread, agentId);
  }

  async listConversations(agent: Agent): Promise<ConversationSummary[]> {
    await this.start();
    const response = await this.client.request('thread/list', {
      cwd: expandHome(agent.folder),
      archived: false,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      limit: 30,
    });

    return response.data.map((thread) => ({
      id: thread.id,
      title: conversationTitle(thread),
      updatedAt: timestampSecondsToIso(thread.updatedAt ?? thread.createdAt),
      messageCount: Array.isArray(thread.turns) ? thread.turns.length : 0,
      ref: {
        backend: 'codex',
        threadId: thread.id,
      },
    }));
  }

  async resumeConversation(agent: Agent, threadId: string): Promise<{ threadId: string; messages: RendererMessage[] }> {
    await this.start();

    const cwd = expandHome(agent.folder);
    const approvalSettings = await this.approvalThreadStartParamsForAgent(agent);
    const threadConfig = buildCodexClawThreadConfig(agent, this.options.clawMcpServerUrl ?? null);
    const response = await this.client.request('thread/resume', {
      threadId,
      cwd,
      ...approvalSettings.params,
      ...threadConfig,
    });
    this.recordSession(agent.id, response.thread.id, response.model);
    this.recordThreadTurns(response.thread);
    this.activeTurnIdsByThreadId.delete(response.thread.id);

    return {
      threadId: response.thread.id,
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
    this.commandOutputForwardItemIds.clear();
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
    const approvalSettings = await this.approvalThreadStartParamsForAgent(agent);
    const threadConfig = buildCodexClawThreadConfig(agent, this.options.clawMcpServerUrl ?? null);
    const existingThreadId = codexThreadId(agent);
    const response = existingThreadId
      ? await this.client.request('thread/resume', {
        threadId: existingThreadId,
        cwd,
        ...approvalSettings.params,
        ...threadConfig,
      })
      : await this.client.request('thread/start', {
        cwd,
        ...approvalSettings.params,
        serviceName: 'codex_claw',
        ...threadConfig,
      });

    const session = this.recordSession(agent.id, response.thread.id, response.model);
    this.recordThreadTurns(response.thread);

    if (existingThreadId) {
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

  private async approvalThreadStartParamsForAgent(agent: Agent): Promise<{
    preset: CodexApprovalPreset | null;
    params: ReturnType<typeof codexApprovalThreadStartParams> | Record<string, never>;
  }> {
    const requestedPreset = codexApprovalPresetFromDefaults(agent.backendDefaults);
    const effectivePreset = await this.effectiveApprovalPreset(requestedPreset);
    if (!effectivePreset) {
      warnMain('codex', 'codex approval settings omitted because no Claw preset satisfies app-server config requirements', {
        agentId: agent.id,
        requestedPreset,
      });
      return {
        preset: null,
        params: {},
      };
    }

    if (effectivePreset !== requestedPreset) {
      warnMain('codex', 'codex approval preset clamped to app-server config requirements', {
        agentId: agent.id,
        requestedPreset,
        effectivePreset,
      });
    }

    return {
      preset: effectivePreset,
      params: codexApprovalThreadStartParams(effectivePreset),
    };
  }

  private async effectiveApprovalPreset(requestedPreset: CodexApprovalPreset): Promise<CodexApprovalPreset | null> {
    const requirements = await this.readConfigRequirements();
    return effectiveCodexApprovalPreset(requestedPreset, requirements);
  }

  private async readConfigRequirements(): Promise<CodexConfigRequirements | null> {
    if (!this.options.readConfigRequirements) {
      return null;
    }

    if (!this.configRequirementsPromise) {
      this.configRequirementsPromise = this.client.request('configRequirements/read', undefined)
        .then((response) => {
          this.configRequirements = response.requirements ?? null;
          this.emit({
            backend: 'codex',
            type: 'backend.statusChanged',
            payload: {
              backend: 'codex',
              status: 'running',
              detail: 'Codex backend connected.',
              capabilities: this.getCapabilities(),
            },
          });
          return this.configRequirements;
        })
        .catch((error: unknown) => {
          warnMain('codex', 'Unable to read Codex config requirements; falling back to configured approval defaults.', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
    }

    return this.configRequirementsPromise;
  }

  private recordSession(agentId: string, threadId: string, model: string | null = null): AgentSession {
    const existing = this.sessionsByAgentId.get(agentId);
    if (existing && existing.threadId !== threadId && this.agentIdsByThreadId.get(existing.threadId) === agentId) {
      this.agentIdsByThreadId.delete(existing.threadId);
      this.activeTurnIdsByThreadId.delete(existing.threadId);
    }

    const session = {
      agentId,
      threadId,
      model,
    };
    this.sessionsByAgentId.set(agentId, session);
    this.agentIdsByThreadId.set(threadId, agentId);
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
        const itemId = codexItemId(params.item);
        const includeCommandOutput = this.shouldForwardCommandOutput(notification.method, params.item, itemId);
        this.logMcpToolItem(notification.method, params.threadId, params.item);
        const toolPart = codexThreadItemToToolPart(params.item, { includeCommandOutput });
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
        if (!this.commandOutputForwardItemIds.has(params.itemId)) {
          return;
        }
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

      case 'paramKeys':
      case 'mcpServer/startupStatus/updated':
      case 'remoteControl/status/changed': {
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

  private handleMcpServerElicitationRequest(request: McpServerElicitationRequest, responder: CodexServerRequestResponder): boolean {
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

  private handleToolRequestUserInput(request: ToolRequestUserInputRequest, responder: CodexServerRequestResponder): boolean {
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

  private shouldForwardCommandOutput(method: 'item/started' | 'item/completed', item: unknown, itemId: string | undefined): boolean {
    if (!itemId) {
      return false;
    }

    if (method === 'item/started') {
      if (shouldForwardCommandExecutionOutput(item)) {
        this.commandOutputForwardItemIds.add(itemId);
        return true;
      }
      this.commandOutputForwardItemIds.delete(itemId);
      return false;
    }

    const shouldForward = this.commandOutputForwardItemIds.has(itemId) || shouldForwardCommandExecutionOutput(item);
    this.commandOutputForwardItemIds.delete(itemId);
    return shouldForward;
  }

  private async turnIdsForRollback(threadId: string, targetTurnId: string): Promise<string[]> {
    const knownTurnIds = this.turnIdsByThreadId.get(threadId) ?? [];
    if (knownTurnIds.includes(targetTurnId)) {
      return knownTurnIds;
    }

    const response = await this.client.request('thread/read', {
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

function conversationTitle(thread: CodexThread): string {
  const name = typeof thread.name === 'string' ? thread.name.trim() : '';
  if (name) {
    return name;
  }

  const preview = typeof thread.preview === 'string' ? thread.preview.trim() : '';
  return preview || 'Untitled conversation';
}

function timestampSecondsToIso(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return new Date(0).toISOString();
  }

  return new Date(value * 1000).toISOString();
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

function codexApprovalThreadStartParams(preset: CodexApprovalPreset): {
  approvalPolicy: 'never' | 'on-request';
  approvalsReviewer: 'user' | 'auto_review';
  sandbox: 'danger-full-access' | 'workspace-write';
} {
  if (preset === 'full-access') {
    return {
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      sandbox: 'danger-full-access',
    };
  }

  return {
    approvalPolicy: 'on-request',
    approvalsReviewer: preset === 'approve-for-me' ? 'auto_review' : 'user',
    sandbox: 'workspace-write',
  };
}

function codexApprovalThreadSettingsUpdateParams(preset: CodexApprovalPreset, cwd: string): {
  approvalPolicy: 'never' | 'on-request';
  approvalsReviewer: 'user' | 'auto_review';
  sandboxPolicy: v2.SandboxPolicy;
} {
  if (preset === 'full-access') {
    return {
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      sandboxPolicy: {
        type: 'dangerFullAccess',
      },
    };
  }

  return {
    approvalPolicy: 'on-request',
    approvalsReviewer: preset === 'approve-for-me' ? 'auto_review' : 'user',
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots: [cwd],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    },
  };
}

function effectiveCodexApprovalPreset(
  requestedPreset: CodexApprovalPreset,
  requirements: CodexConfigRequirements | null,
): CodexApprovalPreset | null {
  if (isCodexApprovalPresetAllowed(requestedPreset, requirements)) {
    return requestedPreset;
  }

  for (const candidate of ['approve-for-me', 'ask-for-approval', 'full-access'] as const) {
    if (isCodexApprovalPresetAllowed(candidate, requirements)) {
      return candidate;
    }
  }

  return null;
}

function allowedCodexApprovalPresets(requirements: CodexConfigRequirements | null): CodexApprovalPreset[] {
  return (['ask-for-approval', 'approve-for-me', 'full-access'] as const)
    .filter((preset) => isCodexApprovalPresetAllowed(preset, requirements));
}

function isCodexApprovalPresetAllowed(
  preset: CodexApprovalPreset,
  requirements: CodexConfigRequirements | null,
): boolean {
  if (!requirements) {
    return true;
  }

  if (preset === 'full-access') {
    return (
      requirementAllows(requirements.allowedApprovalPolicies, 'never') &&
      requirementAllows(requirements.allowedApprovalsReviewers, 'user') &&
      requirementAllows(requirements.allowedSandboxModes, 'danger-full-access') &&
      requirementAllows(requirements.allowedPermissions, ':danger-full-access')
    );
  }

  return (
    requirementAllows(requirements.allowedApprovalPolicies, 'on-request') &&
    requirementAllows(requirements.allowedApprovalsReviewers, preset === 'approve-for-me' ? 'auto_review' : 'user') &&
    requirementAllows(requirements.allowedSandboxModes, 'workspace-write') &&
    requirementAllows(requirements.allowedPermissions, ':workspace')
  );
}

function requirementAllows(values: unknown[] | null | undefined, value: string): boolean {
  return !Array.isArray(values) || values.length === 0 || values.includes(value);
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

function clientRequestFromMcpServerElicitation(request: McpServerElicitationRequest): ClientRequest | null {
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

function clientRequestFromToolRequestUserInput(request: ToolRequestUserInputRequest): ClientRequest | null {
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
