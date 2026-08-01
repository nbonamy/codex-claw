import os from 'node:os';
import path from 'node:path';
import type {
  Agent,
  AgentStatus,
  ApprovalPreset,
  BackendApprovalRequest,
  BackendModelOption,
  BackendRuntimeStatus,
  BackendSkillSummary,
  ClientRequest,
  ClientRequestResponse,
  ConversationSummary,
  RendererMessage,
  RendererMessagePart,
  RendererToolPart,
  RendererToolPartUpdate,
  SendPromptOptions,
  CodexAuthentication,
} from '@codex-claw/shared/contracts';
import type { BackendEvent } from '@codex-claw/shared/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { codexApprovalPresetFromDefaults } from '@codex-claw/shared/codex-approval-presets';
import type { CodexConversation, CodexSurface } from 'codex-app-sdk/node';
import type {
  CodexConversationEvent,
  CodexConversationSnapshot,
  CodexSurfaceApproval,
  CodexSurfaceClientRequest,
  CodexSurfaceEvent,
  CodexSurfaceReviewTarget,
  CodexSurfaceSnapshot,
  SurfaceMessage,
  SurfaceMessagePart,
  SurfaceMessageToolPart,
  SurfaceMessageToolPartUpdate,
} from 'codex-app-sdk/surface';

type AdapterListener = (event: BackendEvent) => void;

type AgentConversation = {
  agent: Agent;
  completedCompactionItemIds: Set<string>;
  compactionStartedTurnIds: Set<string>;
  handle: CodexConversation;
  suppressEvents: boolean;
  unsubscribe: () => void;
};

export class CodexSurfaceAgentAdapter {
  private readonly listeners = new Set<AdapterListener>();
  private readonly sessionsByAgentId = new Map<string, AgentConversation>();
  private readonly agentIdsByThreadId = new Map<string, string>();
  private readonly approvalOwners = new Map<string, AgentConversation>();
  private readonly clientRequestOwners = new Map<string, AgentConversation>();
  private readonly unsubscribeSurface: () => void;
  private closed = false;

  constructor(private readonly surface: CodexSurface) {
    this.unsubscribeSurface = surface.onEvent((event) => this.handleSurfaceEvent(event));
  }

  async start(): Promise<void> {
    await this.surface.connect();
  }

  async getAuthentication(): Promise<CodexAuthentication> {
    return authenticationFromSurface((await this.surface.refreshAccount()).authentication);
  }

  async startChatGptLogin() {
    return this.surface.startChatGptLogin();
  }

  async cancelChatGptLogin(): Promise<CodexAuthentication> {
    return authenticationFromSurface((await this.surface.cancelLogin()).authentication);
  }

  async logout(): Promise<CodexAuthentication> {
    return authenticationFromSurface((await this.surface.logout()).authentication);
  }

  getRuntimeStatus(): BackendRuntimeStatus {
    return runtimeStatus(this.surface.getSnapshot());
  }

  getCapabilities(agent?: Agent) {
    const session = agent ? this.sessionsByAgentId.get(agent.id) : undefined;
    const presets = session?.handle.getSnapshot().approvalPresets
      ?? this.surface.getSnapshot().approvalPresets;
    return {
      ...codexBackendCapabilities,
      approvalPresets: presets.length > 0 ? [...presets] : codexBackendCapabilities.approvalPresets,
    };
  }

  async listModels(): Promise<BackendModelOption[]> {
    const models = await this.surface.listModels({ includeHidden: false, forceReload: true });
    return models.map((model) => ({
      ...model,
      supportedReasoningEfforts: model.supportedReasoningEfforts?.map((effort) => ({ ...effort })),
    }));
  }

  async listSkills(agent: Agent, forceReload = false): Promise<BackendSkillSummary[]> {
    const skills = await this.surface.listSkills({ cwd: expandHome(agent.folder), forceReload });
    return skills.map((skill) => ({ id: skill.path, ...skill }));
  }

  async sendPrompt(agent: Agent, prompt: string, options: SendPromptOptions = {}) {
    const session = await this.ensureSession(agent);
    const beforeTurnIds = session.handle.getSnapshot().turnIds;
    const backendOptions = options.backendOptions?.kind === 'codex' ? options.backendOptions : undefined;
    const snapshot = await session.handle.sendMessage(prompt, {
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(typeof options.planMode === 'boolean' ? { planMode: options.planMode } : {}),
      ...(options.reasoningEffort || backendOptions?.reasoningEffort
        ? { reasoningEffort: options.reasoningEffort ?? backendOptions?.reasoningEffort ?? undefined }
        : {}),
      ...((options.skills?.length ?? 0) > 0 || (backendOptions?.skills?.length ?? 0) > 0
        ? { skills: options.skills?.length ? options.skills : backendOptions?.skills }
        : {}),
    });
    return { threadId: session.handle.id, turnId: resultTurnId(snapshot, beforeTurnIds) };
  }

  async compactThread(agent: Agent) {
    const session = await this.ensureSession(agent);
    const beforeTurnIds = session.handle.getSnapshot().turnIds;
    const snapshot = await session.handle.compact();
    return { threadId: session.handle.id, turnId: resultTurnId(snapshot, beforeTurnIds) };
  }

  async setConversationTitle(agent: Agent, title: string): Promise<void> {
    const session = await this.ensureSession(agent);
    await session.handle.rename(title);
  }

  async setThreadGoal(agent: Agent, objective: string) {
    const session = await this.ensureSession(agent);
    const snapshot = await session.handle.setGoal(objective);
    if (!snapshot.goal) throw new Error('Codex did not return the updated goal.');
    return { threadId: session.handle.id, goal: snapshot.goal };
  }

  async clearThreadGoal(agent: Agent) {
    const session = await this.ensureSession(agent);
    await session.handle.clearGoal();
    return { threadId: session.handle.id, cleared: true };
  }

  async setApprovalPreset(agent: Agent, preset: ApprovalPreset) {
    const session = await this.ensureSession(agent);
    const effective = effectiveApprovalPreset(preset, session.handle.getSnapshot().approvalPresets);
    if (!effective) throw new Error('No Claw approval preset satisfies the Codex app-server requirements.');
    await session.handle.updateSettings({ approvalPreset: effective });
    return { threadId: session.handle.id, approvalPreset: effective };
  }

  async reviewThread(agent: Agent, target: CodexSurfaceReviewTarget) {
    const session = await this.ensureSession(agent);
    const beforeTurnIds = session.handle.getSnapshot().turnIds;
    const snapshot = await session.handle.startReview({ target });
    return { threadId: session.handle.id, turnId: resultTurnId(snapshot, beforeTurnIds) };
  }

  async steerPrompt(agent: Agent, prompt: string) {
    const session = await this.ensureSession(agent);
    const beforeTurnIds = session.handle.getSnapshot().turnIds;
    const snapshot = await session.handle.steerMessage(prompt);
    return { threadId: session.handle.id, turnId: resultTurnId(snapshot, beforeTurnIds) };
  }

  async interruptTurn(agent: Agent) {
    const session = await this.ensureSession(agent);
    const turnId = session.handle.getSnapshot().activeTurnId;
    if (!turnId) throw new Error('No active Codex turn to interrupt.');
    await session.handle.interrupt();
    return { threadId: session.handle.id, turnId };
  }

  forgetAgentSession(agentId: string): void {
    const session = this.sessionsByAgentId.get(agentId);
    if (!session) return;
    session.unsubscribe();
    this.sessionsByAgentId.delete(agentId);
    if (this.agentIdsByThreadId.get(session.handle.id) === agentId) {
      this.agentIdsByThreadId.delete(session.handle.id);
    }
    this.removePendingOwners(session);
  }

  async rollbackToTurn(agent: Agent, turnId: string) {
    const session = await this.ensureSession(agent);
    const snapshot = await session.handle.rollbackToTurn(turnId);
    return {
      threadId: session.handle.id,
      messages: surfaceMessages(snapshot.messages, agent.id),
    };
  }

  async readConversationMessages(threadId: string, agentId: string): Promise<RendererMessage[]> {
    await this.start();
    const history = await this.surface.conversation(threadId).readHistory();
    return surfaceMessages(history.messages, agentId);
  }

  async listConversations(agent: Agent): Promise<ConversationSummary[]> {
    const conversations = await this.surface.listConversations({ cwd: expandHome(agent.folder), limit: 30 });
    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.turnCount,
      ref: { backend: 'codex', threadId: conversation.id },
    }));
  }

  async resumeConversation(agent: Agent, threadId: string) {
    const session = await this.bindAndLoad(agent, threadId, false);
    return {
      threadId,
      messages: surfaceMessages(session.handle.getSnapshot().messages, agent.id),
    };
  }

  async hydrateAgent(agent: Agent): Promise<string | null> {
    const threadId = codexThreadId(agent);
    if (!threadId) return null;
    await this.bindAndLoad(agent, threadId, true);
    return threadId;
  }

  async respondToClientRequest(response: ClientRequestResponse): Promise<void> {
    const approvalOwner = this.approvalOwners.get(response.id);
    if (approvalOwner) {
      const allow = response.payload?.decision !== 'deny' && response.payload?.cancelled !== true;
      const scope = response.payload?.decision === 'allow_conversation' || response.payload?.decision === 'always_allow'
        ? 'session'
        : 'once';
      await approvalOwner.handle.resolveApproval(response.id, allow ? 'approve' : 'deny', scope);
      return;
    }
    const requestOwner = this.clientRequestOwners.get(response.id);
    if (requestOwner) {
      await requestOwner.handle.respondToClientRequest(response);
      return;
    }
    await this.surface.respondToClientRequest(response);
  }

  onEvent(listener: AdapterListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeSurface();
    for (const session of this.sessionsByAgentId.values()) session.unsubscribe();
    this.sessionsByAgentId.clear();
    this.agentIdsByThreadId.clear();
    this.approvalOwners.clear();
    this.clientRequestOwners.clear();
    await this.surface.close();
  }

  private async ensureSession(agent: Agent): Promise<AgentConversation> {
    const existing = this.sessionsByAgentId.get(agent.id);
    const requestedThreadId = codexThreadId(agent);
    if (existing && (!requestedThreadId || existing.handle.id === requestedThreadId)) {
      existing.agent = agent;
      return existing;
    }
    if (existing) this.forgetAgentSession(agent.id);
    if (requestedThreadId) return this.bindAndLoad(agent, requestedThreadId, false);

    await this.start();
    const requestedPreset = codexApprovalPresetFromDefaults(agent.backendDefaults);
    const effectivePreset = effectiveApprovalPreset(requestedPreset, this.surface.getSnapshot().approvalPresets);
    const snapshot = await this.surface.createConversation({
      cwd: expandHome(agent.folder),
      ...(effectivePreset ? { approvalPreset: effectivePreset } : {}),
    }, { extensionContext: agent });
    const threadId = snapshot.activeConversationId;
    if (!threadId) throw new Error('Codex did not create a conversation.');
    return this.bindRuntime(agent, threadId, true, false);
  }

  private async bindAndLoad(
    agent: Agent,
    threadId: string,
    emitHistory: boolean,
  ): Promise<AgentConversation> {
    const existing = this.sessionsByAgentId.get(agent.id);
    if (existing && existing.handle.id === threadId) {
      existing.agent = agent;
      const snapshot = existing.handle.getSnapshot();
      if (emitHistory) this.publishInitial(existing, snapshot, true);
      else this.rememberPending(existing, snapshot);
      return existing;
    }

    await this.start();
    const session = this.bindRuntime(agent, threadId, false, true);
    try {
      let snapshot = await session.handle.load({ cwd: expandHome(agent.folder), extensionContext: agent });
      const interruptedTurnId = snapshot.activeTurnId;
      if (interruptedTurnId) {
        // A newly created Claw backend has no ownership of an old in-progress
        // turn. Leaving it active here permanently disables the composer after
        // an app restart, so ask app-server to end that orphaned turn before
        // exposing the hydrated conversation.
        snapshot = await session.handle.interrupt();
      }
      const requestedPreset = codexApprovalPresetFromDefaults(agent.backendDefaults);
      const effectivePreset = effectiveApprovalPreset(requestedPreset, snapshot.approvalPresets);
      if (effectivePreset && snapshot.approvalPreset !== effectivePreset) {
        snapshot = await session.handle.updateSettings({ approvalPreset: effectivePreset });
      }
      session.suppressEvents = false;
      snapshot = session.handle.getSnapshot();
      if (emitHistory) {
        this.publishInitial(session, snapshot, true);
        if (interruptedTurnId) {
          this.emitThread(session, {
            type: 'turn.completed',
            turnId: interruptedTurnId,
            payload: { status: 'interrupted' },
          });
        }
      } else {
        this.rememberPending(session, snapshot);
      }
      return session;
    } catch (error) {
      this.forgetAgentSession(agent.id);
      throw error;
    }
  }

  private bindRuntime(
    agent: Agent,
    threadId: string,
    publishInitial: boolean,
    suppressEvents = false,
  ): AgentConversation {
    const otherAgentId = this.agentIdsByThreadId.get(threadId);
    if (otherAgentId && otherAgentId !== agent.id) this.forgetAgentSession(otherAgentId);
    this.forgetAgentSession(agent.id);
    const handle = this.surface.conversation(threadId);
    const session: AgentConversation = {
      agent,
      completedCompactionItemIds: new Set(),
      compactionStartedTurnIds: new Set(),
      handle,
      suppressEvents,
      unsubscribe: () => undefined,
    };
    session.unsubscribe = handle.onEvent((event) => this.handleConversationEvent(session, event));
    this.sessionsByAgentId.set(agent.id, session);
    this.agentIdsByThreadId.set(threadId, agent.id);
    if (publishInitial) this.publishInitial(session, handle.getSnapshot(), false);
    return session;
  }

  private publishInitial(
    session: AgentConversation,
    snapshot: CodexConversationSnapshot,
    emitHistory: boolean,
  ): void {
    this.emitThread(session, { type: 'thread.started', payload: { cwd: conversationCwd(snapshot) } });
    if (emitHistory) this.emitHistory(session, snapshot.messages, undefined, snapshot.activeTurnId === null);
    this.emitSettings(session, snapshot.approvalPreset, snapshot.planMode);
    if (snapshot.goal) this.emitThread(session, { type: 'thread.goalUpdated', payload: { goal: snapshot.goal } });
    if (snapshot.contextUsage) {
      this.emitThread(session, { type: 'thread.tokenUsageUpdated', payload: { contextUsage: snapshot.contextUsage } });
    }
    if (snapshot.turnGitDiff) this.emitDiff(session, snapshot.turnGitDiff);
    this.emitStatus(session, statusFromSnapshot(snapshot));
    this.rememberPending(session, snapshot, true);
  }

  private rememberPending(
    session: AgentConversation,
    snapshot: CodexConversationSnapshot,
    emit = false,
  ): void {
    for (const request of snapshot.clientRequests) {
      this.clientRequestOwners.set(request.id, session);
      if (emit) this.emitClientRequest(session, request);
    }
    for (const approval of snapshot.approvals) {
      this.approvalOwners.set(approval.id, session);
      if (emit) this.emitApprovalRequested(session, approval);
    }
  }

  private handleSurfaceEvent(event: CodexSurfaceEvent): void {
    if ('conversationId' in event) return;
    if (event.type === 'surface.statusChanged') {
      this.emit({ backend: 'codex', type: 'backend.statusChanged', payload: runtimeStatus(this.surface.getSnapshot()), occurredAt: event.occurredAt });
      return;
    }
    if (event.type === 'rateLimits.changed' && event.payload.rateLimits) {
      this.emit({
        backend: 'codex',
        type: 'account.rateLimitsUpdated',
        payload: { rateLimits: event.payload.rateLimits.rateLimits },
        occurredAt: event.occurredAt,
      });
      return;
    }
    if (event.type === 'catalog.skillsChanged' && event.payload.status === 'loaded') {
      this.emit({ backend: 'codex', type: 'skills.changed', payload: {}, occurredAt: event.occurredAt });
    }
  }

  private handleConversationEvent(session: AgentConversation, event: CodexConversationEvent): void {
    if (session.suppressEvents) return;
    const metadata = { occurredAt: event.occurredAt };
    switch (event.type) {
      case 'conversation.summaryUpserted':
      case 'conversation.summaryRemoved':
        return;
      case 'conversation.historyReplaced':
        if (event.origin === 'action') return;
        this.emitHistory(session, event.payload.messages, event.occurredAt);
        return;
      case 'conversation.activityChanged':
        this.emitStatus(session, statusFromSnapshot(session.handle.getSnapshot()), event.occurredAt);
        return;
      case 'conversation.settingsChanged':
        this.emitSettings(session, event.payload.approvalPreset, event.payload.planMode, event.occurredAt);
        return;
      case 'conversation.goalChanged':
        if (event.origin === 'action') return;
        this.emitThread(session, event.payload.goal
          ? { type: 'thread.goalUpdated', turnId: event.turnId, payload: { goal: event.payload.goal }, ...metadata }
          : { type: 'thread.goalCleared', turnId: event.turnId, payload: {}, ...metadata });
        return;
      case 'conversation.contextUsageChanged':
        if (event.payload.contextUsage) {
          this.emitThread(session, {
            type: 'thread.tokenUsageUpdated', turnId: event.turnId,
            payload: { contextUsage: event.payload.contextUsage }, ...metadata,
          });
        }
        return;
      case 'conversation.skillsChanged':
        if (event.payload.status === 'loaded') {
          this.emitThread(session, { type: 'skills.changed', payload: {}, ...metadata });
        }
        return;
      case 'conversation.permissionsChanged':
        return;
      case 'conversation.diffUpdated':
        if (event.payload.diff) this.emitDiff(session, event.payload.diff, event.occurredAt);
        return;
      case 'turn.started':
        this.emitThread(session, {
          type: 'turn.started', turnId: event.turnId,
          payload: { status: 'inProgress', startedAt: event.payload.startedAt }, ...metadata,
        });
        return;
      case 'turn.completed':
        this.emitThread(session, {
          type: 'turn.completed', turnId: event.turnId,
          payload: { ...event.payload }, ...metadata,
        });
        return;
      case 'turn.error':
        this.emitThread(session, {
          type: 'error', turnId: event.turnId,
          payload: { message: event.payload.error.message, ...event.payload }, ...metadata,
        });
        return;
      case 'message.appended':
        if (event.payload.message.role === 'user') return;
        this.emitAppendedMessage(session, event.payload.message, event.turnId, event.occurredAt);
        return;
      case 'message.delta':
        this.emitThread(session, {
          type: 'message.delta', turnId: event.turnId,
          payload: { messageId: event.payload.messageId, itemId: event.payload.itemId, delta: event.payload.delta },
          ...metadata,
        });
        return;
      case 'message.updated':
        this.emitHistory(session, session.handle.getSnapshot().messages, event.occurredAt);
        return;
      case 'tool.started':
        this.emitThread(session, {
          type: 'item.started', turnId: event.turnId,
          payload: { messageId: event.payload.messageId, toolPart: rendererToolPart(event.payload.toolPart) },
          ...metadata,
        });
        return;
      case 'tool.updated':
        this.emitThread(session, {
          type: 'item.updated', turnId: event.turnId,
          payload: { messageId: event.payload.messageId, ...rendererToolUpdate(event.payload.update) },
          ...metadata,
        });
        return;
      case 'tool.completed':
        this.emitThread(session, {
          type: 'item.completed', turnId: event.turnId,
          payload: { messageId: event.payload.messageId, toolPart: rendererToolPart(event.payload.toolPart) },
          ...metadata,
        });
        return;
      case 'plan.delta':
        this.emitThread(session, {
          type: 'turn.proposedPlanDelta', turnId: event.turnId,
          payload: { itemId: event.payload.itemId, delta: event.payload.delta, markdown: event.payload.markdown },
          ...metadata,
        });
        return;
      case 'plan.updated':
        this.emitThread(session, {
          type: 'turn.planUpdated', turnId: event.turnId,
          payload: {
            explanation: event.payload.explanation,
            plan: event.payload.steps.map((step) => ({ ...step })),
            markdown: event.payload.markdown,
            status: event.payload.status,
          },
          ...metadata,
        });
        return;
      case 'plan.completed':
        this.emitThread(session, {
          type: 'turn.proposedPlanCompleted', turnId: event.turnId,
          payload: { itemId: event.payload.itemId, markdown: event.payload.markdown }, ...metadata,
        });
        return;
      case 'context.compactionStarted':
        if (session.compactionStartedTurnIds.has(event.turnId)) return;
        session.compactionStartedTurnIds.add(event.turnId);
        this.emitThread(session, {
          type: 'context.compactionStarted', turnId: event.turnId,
          payload: { itemId: event.payload.itemId }, ...metadata,
        });
        return;
      case 'context.compactionCompleted':
        if (event.payload.itemId && session.completedCompactionItemIds.has(event.payload.itemId)) return;
        if (event.payload.itemId) session.completedCompactionItemIds.add(event.payload.itemId);
        if (session.compactionStartedTurnIds.delete(event.turnId)) return;
        this.emitThread(session, {
          type: 'context.compactionStarted', turnId: event.turnId,
          payload: { itemId: event.payload.itemId }, ...metadata,
        });
        return;
      case 'approval.requested':
        this.approvalOwners.set(event.payload.approval.id, session);
        this.emitApprovalRequested(session, event.payload.approval, event.occurredAt);
        return;
      case 'approval.resolved':
        this.approvalOwners.delete(event.payload.approval.id);
        this.emitThread(session, {
          type: 'backendApproval.resolved', turnId: event.turnId,
          payload: {
            approval: backendApproval(event.payload.approval),
            decision: event.payload.decision,
            scope: event.payload.scope,
            reason: event.payload.reason,
          },
          ...metadata,
        });
        return;
      case 'clientRequest.requested':
        this.clientRequestOwners.set(event.payload.request.id, session);
        this.emitClientRequest(session, event.payload.request, event.occurredAt);
        return;
      case 'clientRequest.resolved':
        this.clientRequestOwners.delete(event.payload.request.id);
        this.emitThread(session, {
          type: 'clientRequest.resolved', turnId: event.turnId,
          payload: { id: event.payload.request.id }, ...metadata,
        });
        return;
    }
  }

  private emitAppendedMessage(
    session: AgentConversation,
    message: SurfaceMessage,
    turnId: string | undefined,
    occurredAt: string,
  ): void {
    if (!turnId) {
      this.emitHistory(session, session.handle.getSnapshot().messages, occurredAt);
      return;
    }
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        this.emitThread(session, {
          type: 'message.delta', turnId,
          payload: { messageId: message.id, itemId: part.itemId, delta: part.text }, occurredAt,
        });
      } else if (part.type === 'tool') {
        this.emitThread(session, {
          type: part.status === 'running' ? 'item.started' : 'item.completed', turnId,
          payload: { messageId: message.id, toolPart: rendererToolPart(part) }, occurredAt,
        });
      } else if (part.type === 'attachment' || part.type === 'status') {
        this.emitHistory(session, session.handle.getSnapshot().messages, occurredAt);
        return;
      }
    }
  }

  private emitHistory(
    session: AgentConversation,
    messages: readonly SurfaceMessage[],
    occurredAt?: string,
    completeStreaming = false,
  ): void {
    this.emitThread(session, {
      type: 'thread.historyLoaded',
      payload: { messages: surfaceMessages(messages, session.agent.id, completeStreaming), replace: true },
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  private emitSettings(
    session: AgentConversation,
    preset: ApprovalPreset | null,
    planMode: boolean,
    occurredAt?: string,
  ): void {
    if (preset) {
      this.emitThread(session, {
        type: 'thread.settingsUpdated',
        payload: { threadSettings: threadSettingsForPreset(preset) },
        ...(occurredAt ? { occurredAt } : {}),
      });
    }
    this.emitThread(session, {
      type: 'thread.modeUpdated',
      payload: { mode: planMode ? 'plan' : 'default' },
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  private emitDiff(
    session: AgentConversation,
    diff: NonNullable<CodexConversationSnapshot['turnGitDiff']>,
    occurredAt?: string,
  ): void {
    this.emitThread(session, {
      type: 'diff.updated', turnId: diff.turnId,
      payload: { addedLines: diff.addedLines, removedLines: diff.removedLines, diff: diff.diff },
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  private emitStatus(session: AgentConversation, status: AgentStatus, occurredAt?: string): void {
    this.emitThread(session, {
      type: 'agent.statusChanged', payload: status,
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  private emitClientRequest(
    session: AgentConversation,
    request: CodexSurfaceClientRequest,
    occurredAt?: string,
  ): void {
    const payload: ClientRequest = request.kind === 'ask_user'
      ? {
        id: request.id,
        kind: 'ask_user',
        payload: {
          request: {
            itemId: request.itemId,
            questions: request.payload.request.questions.map((question) => ({
              ...question,
              options: question.options?.map((option) => ({ ...option })) ?? null,
            })),
          },
        },
      }
      : { id: request.id, kind: 'confirm_tool', payload: { confirmation: { ...request.payload.confirmation } } };
    this.emitThread(session, {
      type: request.kind === 'ask_user' ? 'toolInput.requested' : 'approval.requested',
      turnId: request.turnId ?? undefined,
      payload,
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  private emitApprovalRequested(
    session: AgentConversation,
    approval: CodexSurfaceApproval,
    occurredAt?: string,
  ): void {
    this.emitThread(session, {
      type: 'backendApproval.requested',
      turnId: approval.turnId,
      payload: { approval: backendApproval(approval) },
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  private emitThread(
    session: AgentConversation,
    event: Omit<BackendEvent, 'agentId' | 'backend' | 'threadId'>,
  ): void {
    this.emit({
      ...event,
      agentId: session.agent.id,
      backend: 'codex',
      threadId: session.handle.id,
    } as BackendEvent);
  }

  private emit(event: BackendEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private removePendingOwners(session: AgentConversation): void {
    for (const [id, owner] of this.approvalOwners) {
      if (owner === session) this.approvalOwners.delete(id);
    }
    for (const [id, owner] of this.clientRequestOwners) {
      if (owner === session) this.clientRequestOwners.delete(id);
    }
  }
}

function authenticationFromSurface(
  authentication: CodexSurfaceSnapshot['authentication'],
): CodexAuthentication {
  return {
    account: authentication.account ? { ...authentication.account } : null,
    requiresOpenaiAuth: authentication.requiresOpenaiAuth === true,
    login: {
      status: authentication.login.status,
      error: authentication.login.error,
    },
  };
}

function backendApproval(approval: CodexSurfaceApproval): BackendApprovalRequest {
  return {
    id: approval.id,
    kind: approval.kind,
    conversationId: approval.conversationId,
    ...(approval.turnId ? { turnId: approval.turnId } : {}),
    itemId: approval.itemId,
    title: approval.title,
    ...(approval.description ? { description: approval.description } : {}),
    ...(approval.command ? { command: approval.command } : {}),
    ...(approval.cwd ? { cwd: approval.cwd } : {}),
    ...(approval.requestedPermissions
      ? { requestedPermissions: approval.requestedPermissions.map((permission) => ({ ...permission })) }
      : {}),
    ...(approval.allowedScopes ? { allowedScopes: [...approval.allowedScopes] } : {}),
    ...(approval.canDeny === undefined ? {} : { canDeny: approval.canDeny }),
  };
}

function resultTurnId(
  snapshot: CodexConversationSnapshot,
  beforeTurnIds: readonly string[],
): string | undefined {
  if (snapshot.activeTurnId) return snapshot.activeTurnId;
  const known = new Set(beforeTurnIds);
  return [...snapshot.turnIds].reverse().find((turnId) => !known.has(turnId))
    ?? snapshot.turnIds.at(-1);
}

function surfaceMessages(
  messages: readonly SurfaceMessage[],
  agentId: string,
  completeStreaming = false,
): RendererMessage[] {
  return messages.map((message) => ({
    id: message.id,
    agentId,
    ...(message.kind ? { kind: message.kind } : {}),
    role: message.role,
    status: completeStreaming && message.status === 'streaming' ? 'complete' : message.status,
    ...(message.turnId ? { turnId: message.turnId } : {}),
    parts: message.parts.map(rendererPart),
    createdAt: message.createdAt ?? new Date(0).toISOString(),
  }));
}

function rendererPart(part: SurfaceMessagePart): RendererMessagePart {
  if (part.type === 'tool') return rendererToolPart(part);
  if (part.type === 'attachment') return { type: 'attachment', attachment: { ...part.attachment } };
  return { ...part };
}

function rendererToolPart(part: SurfaceMessageToolPart): RendererToolPart {
  return {
    ...part,
    kind: toolKind(part.kind),
  };
}

function rendererToolUpdate(update: SurfaceMessageToolPartUpdate): RendererToolPartUpdate {
  const { fallbackToolPart, ...rest } = update;
  return {
    ...rest,
    ...(fallbackToolPart ? { fallbackToolPart: rendererToolPart(fallbackToolPart) } : {}),
  };
}

function toolKind(kind: string | undefined): RendererToolPart['kind'] {
  return kind === 'command' || kind === 'mcp' || kind === 'dynamic' || kind === 'fileChange'
    ? kind
    : 'generic';
}

function statusFromSnapshot(snapshot: CodexConversationSnapshot): AgentStatus {
  if (snapshot.error) return { type: 'error', message: snapshot.error };
  if (snapshot.threadStatus?.type === 'active') {
    if (snapshot.threadStatus.activeFlags.includes('waitingOnApproval')) {
      return { type: 'awaitingInput', detail: 'Waiting for approval' };
    }
    if (snapshot.threadStatus.activeFlags.includes('waitingOnUserInput')) {
      return { type: 'awaitingInput', detail: 'Waiting for user input' };
    }
  }
  if (snapshot.clientRequests.length > 0 || snapshot.approvals.length > 0) {
    return { type: 'awaitingInput', detail: 'Waiting for user input' };
  }
  return snapshot.busy ? { type: 'working' } : { type: 'idle' };
}

function runtimeStatus(snapshot: CodexSurfaceSnapshot): BackendRuntimeStatus {
  if (snapshot.status === 'connecting') {
    return { backend: 'codex', status: 'starting', detail: 'Connecting to Codex app-server.' };
  }
  if (snapshot.status === 'ready') {
    return { backend: 'codex', status: 'running', detail: 'Codex backend connected.' };
  }
  if (snapshot.status === 'error') {
    return { backend: 'codex', status: 'error', detail: snapshot.error ?? 'Codex app-server failed.' };
  }
  return { backend: 'codex', status: 'notConfigured', detail: 'Codex backend is not connected yet.' };
}

function threadSettingsForPreset(preset: ApprovalPreset): Record<string, unknown> {
  if (preset === 'full-access') {
    return {
      approvalPolicy: 'never', approvalsReviewer: 'user',
      sandboxPolicy: { type: 'dangerFullAccess' }, activePermissionProfile: { id: ':danger-full-access' },
    };
  }
  return {
    approvalPolicy: 'on-request',
    approvalsReviewer: preset === 'approve-for-me' ? 'auto_review' : 'user',
    sandboxPolicy: { type: 'workspaceWrite' }, activePermissionProfile: { id: ':workspace' },
  };
}

function effectiveApprovalPreset(
  requested: ApprovalPreset,
  available: readonly ApprovalPreset[],
): ApprovalPreset | null {
  if (available.includes(requested)) return requested;
  return (['approve-for-me', 'ask-for-approval', 'full-access'] as const)
    .find((preset) => available.includes(preset)) ?? null;
}

function codexThreadId(agent: Agent): string | null {
  return agent.backendSession?.kind === 'codex' ? agent.backendSession.threadId : null;
}

function expandHome(folder: string): string {
  const trimmed = folder.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

function conversationCwd(snapshot: CodexConversationSnapshot): string | undefined {
  return snapshot.conversations.find((conversation) => conversation.id === snapshot.activeConversationId)?.cwd;
}
