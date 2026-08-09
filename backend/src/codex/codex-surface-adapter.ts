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
  DevicePairingSession,
  DevicePairingStatus,
  RendererMessage,
  RendererMessagePart,
  RendererToolPart,
  RendererToolPartUpdate,
  PairedDevice,
  SendPromptOptions,
  CodexAuthentication,
  SubagentActivityChange,
  SubagentIdentityChange,
  SubagentOperationChange,
  SubagentStatusChange,
} from '@codex-claw/core/contracts';
import type { BackendEvent } from '@codex-claw/core/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { codexApprovalPresetFromDefaults } from '@codex-claw/core/codex-approval-presets';
import type { CodexConversation, CodexSurface } from '@codex-app-sdk/backend';
import type {
  CodexConversationEvent,
  CodexConversationSummary,
  CodexConversationSnapshot,
  CodexSurfaceApproval,
  CodexSurfaceClientRequest,
  CodexSurfaceEvent,
  CodexSurfaceReviewTarget,
  CodexSurfaceSnapshot,
  CodexSurfaceSkill,
  CodexSurfaceThreadStatus,
  SendCodexMessageOptions,
  SurfaceMessage,
  SurfaceMessagePart,
  SurfaceMessageToolPart,
  SurfaceMessageToolPartUpdate,
} from '@codex-app-sdk/core/surface';

type AdapterListener = (event: BackendEvent) => void;

const AGENT_HISTORY_CACHE_TTL_MS = 15 * 60 * 1_000;

type AgentConversation = {
  agent: Agent;
  completedCompactionItemIds: Set<string>;
  compactionStartedTurnIds: Set<string>;
  handle: CodexConversation;
  suppressEvents: boolean;
  unsubscribe: () => void;
};

type SubagentOwner = {
  agentId: string;
  rootConversationId: string;
};

export class CodexSurfaceAgentAdapter {
  private readonly listeners = new Set<AdapterListener>();
  private readonly sessionsByAgentId = new Map<string, AgentConversation>();
  private readonly historyHydratedAtByAgentId = new Map<string, number>();
  private readonly agentIdsByThreadId = new Map<string, string>();
  private readonly approvalOwners = new Map<string, AgentConversation>();
  private readonly clientRequestOwners = new Map<string, AgentConversation>();
  private readonly subagentOwners = new Map<string, SubagentOwner>();
  private readonly conversationSummaries = new Map<string, CodexConversationSummary>();
  private readonly lastSubagentIdentityByConversationId = new Map<string, string>();
  private readonly subagentIdentityLoads = new Map<string, Promise<void>>();
  private readonly liveSubagentConversationIds = new Set<string>();
  private readonly unsubscribeSurface: () => void;
  private closed = false;

  constructor(
    private readonly surface: CodexSurface,
    private readonly closeSurface: () => Promise<void> = () => surface.close(),
  ) {
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

  async getDevicePairingStatus(): Promise<DevicePairingStatus> {
    const status = await this.surface.readRemoteControlStatus();
    const requirements = await this.surface.readConfigRequirements();
    return {
      ...status,
      allowRemoteControl: requirements?.allowRemoteControl ?? null,
    };
  }

  async enableDevicePairing(): Promise<DevicePairingStatus> {
    const status = await this.surface.enableRemoteControl();
    const requirements = await this.surface.readConfigRequirements();
    return {
      ...status,
      allowRemoteControl: requirements?.allowRemoteControl ?? null,
    };
  }

  async disableDevicePairing(): Promise<DevicePairingStatus> {
    const status = await this.surface.disableRemoteControl();
    const requirements = await this.surface.readConfigRequirements();
    return {
      ...status,
      allowRemoteControl: requirements?.allowRemoteControl ?? null,
    };
  }

  async startDevicePairing(): Promise<DevicePairingSession> {
    const pairing = await this.surface.startRemoteControlPairing({ manualCode: true });
    return {
      pairingCode: pairing.pairingCode,
      manualPairingCode: pairing.manualPairingCode,
      environmentId: pairing.environmentId,
      expiresAt: epochTimestampToIso(pairing.expiresAt),
    };
  }

  async checkDevicePairing(session: DevicePairingSession): Promise<boolean> {
    const result = await this.surface.readRemoteControlPairingStatus(
      session.pairingCode
        ? { pairingCode: session.pairingCode }
        : { manualPairingCode: session.manualPairingCode ?? null },
    );
    return result.claimed;
  }

  async listPairedDevices(environmentId: string): Promise<PairedDevice[]> {
    const clients = await this.surface.listRemoteControlClients({ environmentId, limit: 100 });
    return clients.data.map((client) => ({
      clientId: client.clientId,
      displayName: client.displayName,
      deviceType: client.deviceType,
      platform: client.platform,
      osVersion: client.osVersion,
      deviceModel: client.deviceModel,
      appVersion: client.appVersion,
      lastSeenAt: client.lastSeenAt === null ? null : epochTimestampToIso(client.lastSeenAt),
    }));
  }

  async revokePairedDevice(environmentId: string, clientId: string): Promise<void> {
    await this.surface.revokeRemoteControlClient({ environmentId, clientId });
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
      serviceTiers: model.serviceTiers?.map((tier) => ({ ...tier })),
    }));
  }

  async listSkills(agent: Agent, forceReload = false): Promise<BackendSkillSummary[]> {
    const skills = await this.surface.listSkills({ cwd: expandHome(agent.folder), forceReload });
    return skills.map((skill) => ({ id: skill.path, ...skill }));
  }

  async sendPrompt(agent: Agent, prompt: string, options: SendPromptOptions = {}) {
    const session = await this.ensureSession(agent);
    const beforeTurnIds = session.handle.getSnapshot().turnIds;
    const snapshot = await session.handle.sendMessage(prompt, surfacePromptOptions(options));
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

  async steerPrompt(agent: Agent, prompt: string, options?: SendPromptOptions) {
    const session = await this.ensureSession(agent);
    const beforeTurnIds = session.handle.getSnapshot().turnIds;
    const snapshot = await session.handle.steerMessage(prompt, surfacePromptOptions(options));
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
    this.historyHydratedAtByAgentId.delete(agentId);
    if (this.agentIdsByThreadId.get(session.handle.id) === agentId) {
      this.agentIdsByThreadId.delete(session.handle.id);
    }
    for (const [conversationId, owner] of this.subagentOwners) {
      if (owner.agentId !== agentId) continue;
      this.subagentOwners.delete(conversationId);
      this.lastSubagentIdentityByConversationId.delete(conversationId);
      this.subagentIdentityLoads.delete(conversationId);
      this.liveSubagentConversationIds.delete(conversationId);
    }
    this.removePendingOwners(session);
    this.surface.forgetConversation(session.handle.id);
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
    const owner = this.subagentOwners.get(threadId);
    if (owner?.agentId === agentId && this.liveSubagentConversationIds.has(threadId)) {
      return surfaceMessages(this.surface.conversation(threadId).getSnapshot().messages, agentId);
    }
    const history = await this.surface.conversation(threadId).readHistory();
    const messages = surfaceMessages(history.messages, agentId);
    const session = this.sessionsByAgentId.get(agentId);
    if (session && session.handle.id !== threadId) {
      const status = subagentStatusFromHistory(history.threadStatus, messages);
      if (status) {
        this.subagentOwners.set(threadId, {
          agentId,
          rootConversationId: session.handle.id,
        });
        this.emitSubagentStatus(
          session,
          threadId,
          status,
          messages.at(-1)?.createdAt ?? new Date().toISOString(),
        );
      }
    }
    return session && session.handle.id !== threadId ? messages.slice(-1) : messages;
  }

  async readConversationSummary(agent: Agent, threadId: string): Promise<ConversationSummary> {
    const session = await this.ensureSession(agent);
    this.subagentOwners.set(threadId, {
      agentId: agent.id,
      rootConversationId: session.handle.id,
    });
    const summary = await this.surface.readConversationSummary(threadId);
    this.conversationSummaries.set(summary.id, summary);
    this.emitSubagentIdentity(session, summary);
    return conversationSummary(summary);
  }

  async loadOlderHistory(agent: Agent): Promise<{ hasOlder: boolean }> {
    const session = await this.ensureSession(agent);
    const loadOlderHistory = (session.handle as CodexConversation & {
      loadOlderHistory?: () => Promise<{ hasOlder: boolean }>;
    }).loadOlderHistory;
    if (!loadOlderHistory) throw new Error('The Codex SDK does not support demand-paged conversation history.');
    const page = await loadOlderHistory();
    return { hasOlder: page.hasOlder };
  }

  async listConversations(agent: Agent): Promise<ConversationSummary[]> {
    const conversations = await this.surface.listConversations({ cwd: expandHome(agent.folder), limit: 30 });
    for (const conversation of conversations) {
      this.conversationSummaries.set(conversation.id, conversation);
      const owner = this.subagentOwners.get(conversation.id);
      const session = owner ? this.sessionsByAgentId.get(owner.agentId) : undefined;
      if (session && session.handle.id === owner?.rootConversationId) {
        this.emitSubagentIdentity(session, conversation);
      }
    }
    return conversations.map(conversationSummary);
  }

  async resumeConversation(agent: Agent, threadId: string) {
    const session = await this.bindAndLoad(agent, threadId, false);
    return {
      threadId,
      messages: surfaceMessages(session.handle.getSnapshot().messages, agent.id),
    };
  }

  async forkConversation(agent: Agent, targetAgent: Agent, messageIndex?: number) {
    const source = await this.ensureSession(agent);
    const result = await (messageIndex === undefined ? source.handle.fork(
      { cwd: expandHome(agent.folder) },
      { extensionContext: targetAgent },
    ) : source.handle.forkMessage(
      messageIndex,
      { cwd: expandHome(agent.folder) },
      { extensionContext: targetAgent },
    ));
    this.bindRuntime(targetAgent, result.conversationId, false);
    return {
      threadId: result.conversationId,
      messages: surfaceMessages(result.snapshot.messages, targetAgent.id),
      activeTurnId: result.snapshot.activeTurnId,
    };
  }

  async hydrateAgent(agent: Agent): Promise<string | null> {
    const threadId = codexThreadId(agent);
    if (!threadId) return null;
    const existing = this.sessionsByAgentId.get(agent.id);
    if (existing?.handle.id === threadId) {
      existing.agent = agent;
      const currentSnapshot = existing.handle.getSnapshot();
      if (currentSnapshot.activeTurnId !== null) {
        // This adapter already owns the live session and receives its events in
        // the background. Keep that richer in-memory transcript authoritative
        // instead of replacing it with load's five-turn bootstrap page.
        return threadId;
      }
      const hydratedAt = this.historyHydratedAtByAgentId.get(agent.id) ?? 0;
      if (Date.now() - hydratedAt < AGENT_HISTORY_CACHE_TTL_MS) return threadId;

      const wasSuppressingEvents = existing.suppressEvents;
      existing.suppressEvents = true;
      try {
        await existing.handle.load({ cwd: expandHome(agent.folder), extensionContext: agent });
        this.historyHydratedAtByAgentId.set(agent.id, Date.now());
        const snapshot = existing.handle.getSnapshot();
        // Publish load's full initial page now. Older messages remain behind
        // the SDK's demand-paging cursor until the conversation requests them.
        this.publishInitial(existing, snapshot, true, true);
        existing.suppressEvents = wasSuppressingEvents;
      } finally {
        existing.suppressEvents = wasSuppressingEvents;
      }
      return threadId;
    }
    await this.bindAndLoad(agent, threadId, true);
    this.historyHydratedAtByAgentId.set(agent.id, Date.now());
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
    this.historyHydratedAtByAgentId.clear();
    this.agentIdsByThreadId.clear();
    this.approvalOwners.clear();
    this.clientRequestOwners.clear();
    this.subagentOwners.clear();
    this.conversationSummaries.clear();
    this.lastSubagentIdentityByConversationId.clear();
    this.subagentIdentityLoads.clear();
    this.liveSubagentConversationIds.clear();
    await this.closeSurface();
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
      snapshot = session.handle.getSnapshot();
      if (emitHistory) this.publishInitial(session, snapshot, true);
      else this.rememberPending(session, snapshot);
      session.suppressEvents = false;

      const requestedPreset = codexApprovalPresetFromDefaults(agent.backendDefaults);
      const effectivePreset = effectiveApprovalPreset(requestedPreset, snapshot.approvalPresets);
      if (effectivePreset && snapshot.approvalPreset !== effectivePreset) {
        await session.handle.updateSettings({ approvalPreset: effectivePreset });
      }
      if (emitHistory) {
        if (interruptedTurnId) {
          this.emitThread(session, {
            type: 'turn.completed',
            turnId: interruptedTurnId,
            payload: { status: 'interrupted' },
          });
        }
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
    preserveKnownTurns = false,
  ): void {
    this.emitThread(session, { type: 'thread.started', payload: { cwd: conversationCwd(snapshot) } });
    if (emitHistory) {
      this.emitHistory(session, snapshot.messages, undefined, {
        completeStreaming: snapshot.activeTurnId === null,
        preserveKnownTurns,
      });
    }
    this.emitSettings(
      session,
      snapshot.approvalPreset,
      snapshot.selectedModelId,
      snapshot.selectedReasoningEffort,
      snapshot.selectedServiceTier,
      snapshot.planMode,
    );
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
    if (event.type === 'conversation.summaryUpserted') {
      this.conversationSummaries.set(event.conversationId, event.payload.summary);
      const owner = this.subagentOwners.get(event.conversationId);
      const session = owner ? this.sessionsByAgentId.get(owner.agentId) : undefined;
      if (session && session.handle.id === owner?.rootConversationId) {
        this.emitSubagentIdentity(session, event.payload.summary);
      }
      return;
    }
    if (event.type === 'conversation.summaryRemoved') {
      this.conversationSummaries.delete(event.conversationId);
      this.lastSubagentIdentityByConversationId.delete(event.conversationId);
      return;
    }
    if ('conversationId' in event) {
      const owner = this.subagentOwners.get(event.conversationId);
      if (!owner) return;
      const session = this.sessionsByAgentId.get(owner.agentId);
      if (!session || session.handle.id !== owner.rootConversationId) return;
      if (
        event.origin === 'notification' &&
        event.type !== 'conversation.historyReplaced' &&
        event.type !== 'conversation.historyPrepended'
      ) {
        this.liveSubagentConversationIds.add(event.conversationId);
      }
      this.refreshSubagentIdentity(session, event.conversationId);
      if (event.type === 'subagent.toolCallChanged') {
        this.emitSubagentToolCall(session, event);
      } else if (event.type === 'subagent.activity') {
        this.emitSubagentActivity(session, event);
      } else if (event.type === 'turn.started') {
        this.emitSubagentStatus(session, event.conversationId, 'running', event.occurredAt);
      } else if (event.type === 'turn.completed') {
        this.emitSubagentStatus(
          session,
          event.conversationId,
          subagentStatusFromTurn(event.payload.status),
          event.occurredAt,
          event.payload.error?.message ?? undefined,
        );
      } else if (event.type === 'turn.error' && !event.payload.willRetry) {
        this.emitSubagentStatus(
          session,
          event.conversationId,
          'errored',
          event.occurredAt,
          event.payload.error.message,
        );
      }
      return;
    }
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
      this.emit({
        backend: 'codex',
        type: 'skills.changed',
        payload: skillsChangedPayload(event.payload.cwd, event.payload.skills, event.payload.status),
        occurredAt: event.occurredAt,
      });
      return;
    }
    if (event.type === 'remoteControl.statusChanged') {
      this.emit({
        backend: 'codex',
        type: 'devicePairing.statusChanged',
        payload: event.payload.status,
        occurredAt: event.occurredAt,
      });
    }
  }

  private handleConversationEvent(session: AgentConversation, event: CodexConversationEvent): void {
    if (session.suppressEvents) return;
    this.historyHydratedAtByAgentId.set(session.agent.id, Date.now());
    const metadata = { occurredAt: event.occurredAt };
    switch (event.type) {
      case 'conversation.summaryUpserted':
      case 'conversation.summaryRemoved':
        return;
      case 'conversation.historyReplaced':
        if (event.origin === 'action') return;
        this.emitHistory(session, event.payload.messages, event.occurredAt, { preserveKnownTurns: true });
        return;
      case 'conversation.historyPrepended':
        this.emitHistory(session, event.payload.messages, event.occurredAt, { preserveKnownMessages: true });
        return;
      case 'conversation.activityChanged':
        this.emitStatus(session, statusFromSnapshot(session.handle.getSnapshot()), event.occurredAt);
        return;
      case 'conversation.settingsChanged':
        this.emitSettings(
          session,
          event.payload.approvalPreset,
          event.payload.selectedModelId,
          event.payload.selectedReasoningEffort,
          event.payload.selectedServiceTier,
          event.payload.planMode,
          event.occurredAt,
        );
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
          this.emitThread(session, {
            type: 'skills.changed',
            payload: skillsChangedPayload(event.payload.cwd, event.payload.skills, event.payload.status),
            ...metadata,
          });
        }
        return;
      case 'conversation.permissionsChanged':
        return;
      case 'conversation.diffUpdated':
        if (event.payload.diff) this.emitDiff(session, event.payload.diff, event.occurredAt);
        return;
      case 'subagent.toolCallChanged': {
        this.emitSubagentToolCall(session, event);
        return;
      }
      case 'subagent.activity': {
        this.emitSubagentActivity(session, event);
        return;
      }
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
        if (event.payload.message.role === 'user') {
          // Claw inserts local prompts before calling the SDK. Notification-origin
          // prompts instead come from outside Claw, such as a paired remote client.
          if (event.origin === 'action' && event.payload.message.metadata?.reviewPrompt !== true) return;
          const [message] = surfaceMessages([event.payload.message], session.agent.id);
          if (!message) return;
          this.emitThread(session, {
            type: 'message.userSubmitted',
            turnId: event.turnId,
            payload: { message },
            ...metadata,
          });
          return;
        }
        this.emitAppendedMessage(session, event.payload.message, event.turnId, event.occurredAt);
        return;
      case 'message.delta':
        this.emitThread(session, {
          type: 'message.delta', turnId: event.turnId,
          payload: { messageId: event.payload.messageId, itemId: event.payload.itemId, delta: event.payload.delta },
          ...metadata,
        });
        return;
      case 'message.updated': {
        const [message] = surfaceMessages([event.payload.message], session.agent.id);
        if (!message) return;
        this.emitThread(session, {
          type: 'message.updated', turnId: event.turnId,
          payload: { message },
          ...metadata,
        });
        return;
      }
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
      case 'file.activity':
        this.emitThread(session, {
          type: 'file.activity', turnId: event.turnId,
          payload: { ...event.payload },
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
        // Manual compaction emits an action-origin start against the last known
        // turn before app-server reports the actual compaction item. The
        // notification turn is authoritative; accepting both can render two
        // markers and leave the speculative one running forever.
        if (event.origin === 'action') return;
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
        if (!session.compactionStartedTurnIds.delete(event.turnId)) {
          this.emitThread(session, {
            type: 'context.compactionStarted', turnId: event.turnId,
            payload: { itemId: event.payload.itemId }, ...metadata,
          });
        }
        this.emitThread(session, {
          type: 'context.compactionCompleted', turnId: event.turnId,
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
    options: {
      completeStreaming?: boolean;
      preserveKnownMessages?: boolean;
      preserveKnownTurns?: boolean;
    } = {},
  ): void {
    const preserveHistory = options.preserveKnownMessages || options.preserveKnownTurns;
    const historyState = (session.handle.getSnapshot() as CodexConversationSnapshot & {
      historyState?: { hasOlder?: boolean };
    }).historyState;
    this.emitThread(session, {
      type: 'thread.historyLoaded',
      payload: {
        messages: surfaceMessages(messages, session.agent.id, options.completeStreaming),
        replace: !preserveHistory,
        ...(typeof historyState?.hasOlder === 'boolean' ? { hasOlderMessages: historyState.hasOlder } : {}),
        ...(options.preserveKnownTurns ? { preserveKnownTurns: true } : {}),
        ...(options.preserveKnownMessages ? { preserveKnownMessages: true } : {}),
      },
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  private emitSettings(
    session: AgentConversation,
    preset: ApprovalPreset | null,
    selectedModelId: string | null,
    selectedReasoningEffort: string | null,
    selectedServiceTier: string | null | undefined,
    planMode: boolean,
    occurredAt?: string,
  ): void {
    if (preset || selectedModelId || selectedReasoningEffort || selectedServiceTier !== undefined) {
      this.emitThread(session, {
        type: 'thread.settingsUpdated',
        payload: {
          threadSettings: {
            ...(preset ? threadSettingsForPreset(preset) : {}),
            ...(selectedModelId ? { model: selectedModelId } : {}),
            ...(selectedReasoningEffort ? { reasoningEffort: selectedReasoningEffort } : {}),
            ...(selectedServiceTier === undefined ? {} : { serviceTier: selectedServiceTier }),
          },
        },
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

  private emitSubagentToolCall(
    session: AgentConversation,
    event: Extract<CodexConversationEvent, { type: 'subagent.toolCallChanged' }>,
  ): void {
    const toolCall = event.payload.toolCall;
    const owner = { agentId: session.agent.id, rootConversationId: session.handle.id };
    for (const conversationId of toolCall.receiverConversationIds) {
      this.subagentOwners.set(conversationId, owner);
    }
    const operation: SubagentOperationChange['operation'] = {
      id: toolCall.id,
      ...(event.turnId ? { turnId: event.turnId } : {}),
      lifecycle: event.payload.lifecycle,
      kind: toolCall.tool,
      status: toolCall.status,
      senderConversationId: toolCall.senderConversationId,
      receiverConversationIds: [...toolCall.receiverConversationIds],
      ...(toolCall.prompt ? { prompt: toolCall.prompt } : {}),
      ...(toolCall.model ? { model: toolCall.model } : {}),
      ...(toolCall.reasoningEffort ? { reasoningEffort: toolCall.reasoningEffort } : {}),
      occurredAt: event.occurredAt,
    };
    const agentStates: SubagentOperationChange['agentStates'] = {};
    for (const [conversationId, state] of Object.entries(toolCall.agentStates)) {
      this.subagentOwners.set(conversationId, owner);
      agentStates[conversationId] = {
        status: state.status,
        ...(state.message ? { message: state.message } : {}),
      };
    }
    this.emitThread(session, {
      type: 'subagent.operationChanged',
      turnId: event.turnId,
      payload: {
        rootConversationId: session.handle.id,
        operation,
        agentStates,
      } satisfies SubagentOperationChange,
      occurredAt: event.occurredAt,
    });
    for (const conversationId of new Set([
      ...toolCall.receiverConversationIds,
      ...Object.keys(toolCall.agentStates),
    ])) {
      const summary = this.conversationSummaries.get(conversationId);
      if (summary) this.emitSubagentIdentity(session, summary);
      this.refreshSubagentIdentity(session, conversationId);
    }
  }

  private emitSubagentActivity(
    session: AgentConversation,
    event: Extract<CodexConversationEvent, { type: 'subagent.activity' }>,
  ): void {
    const activity: SubagentActivityChange['activity'] = {
      id: event.payload.activity.id,
      ...(event.turnId ? { turnId: event.turnId } : {}),
      lifecycle: event.payload.lifecycle,
      kind: event.payload.activity.kind,
      conversationId: event.payload.activity.agentConversationId,
      agentPath: event.payload.activity.agentPath,
      occurredAt: event.occurredAt,
    };
    if (activity.conversationId === session.handle.id) return;
    this.subagentOwners.set(activity.conversationId, {
      agentId: session.agent.id,
      rootConversationId: session.handle.id,
    });
    this.emitThread(session, {
      type: 'subagent.activityChanged',
      turnId: event.turnId,
      payload: {
        rootConversationId: session.handle.id,
        parentConversationId: event.conversationId,
        activity,
      } satisfies SubagentActivityChange,
      occurredAt: event.occurredAt,
    });
    const summary = this.conversationSummaries.get(activity.conversationId);
    if (summary) this.emitSubagentIdentity(session, summary);
    this.refreshSubagentIdentity(session, activity.conversationId);
  }

  private refreshSubagentIdentity(session: AgentConversation, conversationId: string): void {
    if (this.lastSubagentIdentityByConversationId.has(conversationId)) return;
    if (this.subagentIdentityLoads.has(conversationId)) return;
    const load = this.surface.readConversationSummary(conversationId).then((summary) => {
      const owner = this.subagentOwners.get(conversationId);
      if (owner?.agentId !== session.agent.id || owner.rootConversationId !== session.handle.id) return;
      this.conversationSummaries.set(summary.id, summary);
      this.emitSubagentIdentity(session, summary);
    }).catch(() => undefined).finally(() => {
      if (this.subagentIdentityLoads.get(conversationId) === load) {
        this.subagentIdentityLoads.delete(conversationId);
      }
    });
    this.subagentIdentityLoads.set(conversationId, load);
  }

  private emitSubagentIdentity(session: AgentConversation, summary: CodexConversationSummary): void {
    if (summary.id === session.handle.id) return;
    if (!summary.agentNickname && !summary.agentRole) return;
    const identityKey = `${summary.agentNickname ?? ''}\u0000${summary.agentRole ?? ''}`;
    if (this.lastSubagentIdentityByConversationId.get(summary.id) === identityKey) return;
    this.lastSubagentIdentityByConversationId.set(summary.id, identityKey);
    this.emitThread(session, {
      type: 'subagent.identityChanged',
      payload: {
        rootConversationId: session.handle.id,
        conversationId: summary.id,
        ...(summary.agentNickname ? { agentNickname: summary.agentNickname } : {}),
        ...(summary.agentRole ? { agentRole: summary.agentRole } : {}),
      } satisfies SubagentIdentityChange,
      occurredAt: summary.updatedAt,
    });
  }

  private emitSubagentStatus(
    session: AgentConversation,
    conversationId: string,
    status: SubagentStatusChange['status'],
    occurredAt: string,
    statusMessage?: string,
  ): void {
    this.emitThread(session, {
      type: 'subagent.statusChanged',
      payload: {
        rootConversationId: session.handle.id,
        conversationId,
        status,
        ...(statusMessage ? { statusMessage } : {}),
      } satisfies SubagentStatusChange,
      occurredAt,
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

function epochTimestampToIso(value: bigint): string {
  const numericValue = Number(value);
  const milliseconds = Math.abs(numericValue) < 100_000_000_000 ? numericValue * 1_000 : numericValue;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error('Codex returned an invalid remote-control timestamp.');
  return date.toISOString();
}

function conversationSummary(conversation: CodexConversationSummary): ConversationSummary {
  return {
    id: conversation.id,
    ...(conversation.sessionId ? { sessionId: conversation.sessionId } : {}),
    ...(conversation.parentConversationId ? { parentConversationId: conversation.parentConversationId } : {}),
    ...(conversation.agentNickname ? { agentNickname: conversation.agentNickname } : {}),
    ...(conversation.agentRole ? { agentRole: conversation.agentRole } : {}),
    title: conversation.title,
    preview: conversation.preview,
    status: conversation.status,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.turnCount,
    ref: { backend: 'codex', threadId: conversation.id },
  };
}

function subagentStatusFromTurn(
  status: Extract<CodexConversationEvent, { type: 'turn.completed' }>['payload']['status'],
): SubagentStatusChange['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'interrupted') return 'interrupted';
  if (status === 'failed') return 'errored';
  return 'running';
}

function subagentStatusFromHistory(
  threadStatus: CodexSurfaceThreadStatus | null,
  messages: readonly RendererMessage[],
): SubagentStatusChange['status'] | null {
  if (threadStatus?.type === 'active') return 'running';
  if (threadStatus?.type === 'systemError') return 'errored';
  if (threadStatus?.type !== 'idle') return null;
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  if (assistantMessages.some((message) => message.status === 'error')) return 'errored';
  return assistantMessages.some((message) => message.status === 'complete') ? 'completed' : null;
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

function surfacePromptOptions(options: SendPromptOptions = {}): SendCodexMessageOptions {
  const backendOptions = options.backendOptions?.kind === 'codex' ? options.backendOptions : undefined;
  return {
    ...(options.attachments?.length ? { attachments: options.attachments } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(typeof options.planMode === 'boolean' ? { planMode: options.planMode } : {}),
    ...(options.reasoningEffort || backendOptions?.reasoningEffort
      ? { reasoningEffort: options.reasoningEffort ?? backendOptions?.reasoningEffort ?? undefined }
      : {}),
    ...(options.serviceTier !== undefined || backendOptions?.serviceTier !== undefined
      ? { serviceTier: options.serviceTier !== undefined ? options.serviceTier : backendOptions?.serviceTier }
      : {}),
    ...((options.skills?.length ?? 0) > 0 || (backendOptions?.skills?.length ?? 0) > 0
      ? { skills: options.skills?.length ? options.skills : backendOptions?.skills }
      : {}),
  };
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

function skillsChangedPayload(
  cwd: string | null,
  skills: readonly CodexSurfaceSkill[],
  status: 'loaded',
): { cwd: string | null; skills: BackendSkillSummary[]; status: 'loaded' } {
  return {
    cwd,
    skills: skills.map((skill) => ({ id: skill.path, ...skill })),
    status,
  };
}

function rendererToolPart(part: SurfaceMessageToolPart): RendererToolPart {
  return {
    ...part,
    kind: part.kind ?? 'generic',
  };
}

function rendererToolUpdate(update: SurfaceMessageToolPartUpdate): RendererToolPartUpdate {
  const { fallbackToolPart, ...rest } = update;
  return {
    ...rest,
    ...(fallbackToolPart ? { fallbackToolPart: rendererToolPart(fallbackToolPart) } : {}),
  };
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
