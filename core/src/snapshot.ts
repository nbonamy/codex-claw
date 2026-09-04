import type {
  Agent,
  AgentSubagentTree,
  AgentBackend,
  AgentContextUsage,
  ApprovalPreset,
  BackendDefaults,
  BackendApprovalRequest,
  AgentGitStatus,
  AgentStatus,
  AccountRateLimits,
  AppSnapshot,
  AppSnapshotMetadata,
  ClientRequest,
  CreateAgentInput,
  CreateQuickChatInput,
  MainToRendererEvent,
  PromptAttachment,
  RendererMessage,
  RendererMessagePart,
  RendererToolPart,
  RendererToolPartUpdate,
  SendPromptOptions,
  SubagentActivityChange,
  SubagentIdentityChange,
  SubagentOperationChange,
  SubagentStatusChange,
  SubagentStatus,
  ThreadGoal,
  TurnGitDiff,
  ThreadPlan,
  ThreadPlanStep,
  UpdateAgentInput,
  WorkBacklogAssignment,
} from './contracts';
import { defaultGeneralSettings, defaultPluginSettings, defaultSourceFolderState, defaultThemeSettings } from './settings';
import { createEntityId } from './ids';
import { defaultTeamColor } from './team-colors';
import { toolOutputText } from './tool-output';
import { codexApprovalPresetFromThreadSettings, codexBackendDefaultsWithApprovalPreset } from './codex-approval-presets';
import { workItemAssignmentKey } from './work-assignments';
import { appText } from './app-text';

const seedCreatedAt = '2026-06-05T00:00:00.000Z';
const seedTeamId = 'team-codex-claw';
type ToolPart = RendererToolPart;

export function createEmptySnapshot(): AppSnapshot {
  return {
    teams: [
      createDefaultTeam(),
    ],
    agents: [],
    automations: [],
    activeTeamId: seedTeamId,
    activeAgentId: null,
    messages: [],
    queuedPrompts: [],
    workRoutingRequests: [],
    backendApprovals: {},
    agentGitStatuses: {},
    turnGitDiffs: {},
    subagentTrees: {},
    backendRuntimes: [{
      backend: 'codex',
      status: 'notConfigured',
      detail: { key: 'backend.codexNotConnected' },
    }, {
      backend: 'claude',
      status: 'notConfigured',
      detail: { key: 'backend.claudeNotStarted' },
    }],
    workBacklog: createDefaultWorkBacklogState(),
    remoteConnections: createDefaultRemoteConnectionsState(),
    general: { ...defaultGeneralSettings, plugins: { ...defaultPluginSettings } },
    sourceFolder: { ...defaultSourceFolderState },
    theme: { ...defaultThemeSettings },
  };
}

export function createInitialSnapshot(): AppSnapshot {
  const agents = createSeedAgents();

  return {
    teams: [
      {
        ...createDefaultTeam(),
        agentIds: agents.map((agent) => agent.id),
      },
    ],
    agents,
    automations: [],
    activeTeamId: seedTeamId,
    activeAgentId: agents[0]?.id ?? null,
    messages: [],
    queuedPrompts: [],
    workRoutingRequests: [],
    backendApprovals: {},
    agentGitStatuses: {},
    turnGitDiffs: {},
    subagentTrees: {},
    backendRuntimes: [{
      backend: 'codex',
      status: 'notConfigured',
      detail: { key: 'backend.codexNotConnected' },
    }, {
      backend: 'claude',
      status: 'notConfigured',
      detail: { key: 'backend.claudeNotStarted' },
    }],
    workBacklog: createDefaultWorkBacklogState(),
    remoteConnections: createDefaultRemoteConnectionsState(),
    general: { ...defaultGeneralSettings, plugins: { ...defaultPluginSettings } },
    sourceFolder: { ...defaultSourceFolderState },
    theme: { ...defaultThemeSettings },
  };
}

function createDefaultWorkBacklogState(): AppSnapshot['workBacklog'] {
  return {
    connections: [{
      provider: 'github',
      status: 'disconnected',
    }],
    providerConfigurations: {},
    providerSettings: {},
    assignments: {},
  };
}

export function createDefaultRemoteConnectionsState(): AppSnapshot['remoteConnections'] {
  return {
    connections: [],
  };
}

export function createAgentFromInput(input: CreateAgentInput, createdAt = new Date().toISOString(), teamId = seedTeamId, id = createEntityId('agent')): Agent {
  const name = normalizedOptionalString(input.name) ?? null;
  const backend = normalizedBackend(input.backend);
  const delegatedByAgentId = normalizedOptionalString(input.delegatedByAgentId);

  return {
    id,
    teamId,
    ...(delegatedByAgentId ? { delegatedByAgentId } : {}),
    name,
    avatar: normalizedOptionalString(input.avatar),
    folder: normalizedFolder(input.folder),
    backend,
    backendDefaults: normalizedBackendDefaults(input.backendDefaults, backend) ?? defaultBackendDefaults(backend),
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };
}

export function createAgentInSnapshot(snapshot: AppSnapshot, input: CreateAgentInput, createdAt = new Date().toISOString(), id = createEntityId('agent'), options: { select?: boolean } = {}): AppSnapshot {
  const agent = createAgentFromInput(input, createdAt, targetTeamId(snapshot, input.teamId), id);
  return insertAgentInSnapshot(snapshot, agent, options.select);
}

export function createQuickChatInSnapshot(snapshot: AppSnapshot, input: CreateQuickChatInput, createdAt = new Date().toISOString(), id = createEntityId('agent')): AppSnapshot {
  const agent = createAgentFromInput({
    name: null,
    folder: '',
    backend: 'codex',
    ...(input.teamId ? { teamId: input.teamId } : {}),
  }, createdAt, targetTeamId(snapshot, input.teamId), id);
  agent.folder = null;
  agent.sessionKind = 'quickChat';
  return insertAgentInSnapshot(snapshot, agent);
}

function insertAgentInSnapshot(snapshot: AppSnapshot, agent: Agent, select = true): AppSnapshot {
  snapshot.agents.push(agent);
  attachAgentToTeam(snapshot, agent);
  if (select) {
    snapshot.activeTeamId = agent.teamId ?? snapshot.activeTeamId;
    snapshot.activeAgentId = agent.id;
  }
  return snapshot;
}

export function updateAgentFromInput(snapshot: AppSnapshot, input: UpdateAgentInput, updatedAt = new Date().toISOString()): Agent | null {
  const agent = findAgent(snapshot, input.id);
  if (!agent) {
    return null;
  }
  agent.name = normalizedOptionalString(input.name) ?? null;
  agent.updatedAt = updatedAt;

  return agent;
}

export function updateAgentOpenInApplication(
  snapshot: AppSnapshot,
  agentId: string,
  application: Agent['openInApplication'],
  updatedAt = new Date().toISOString(),
): Agent | null {
  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return null;
  }

  agent.openInApplication = application;
  agent.updatedAt = updatedAt;
  return agent;
}

export function appendUserPrompt(
  snapshot: AppSnapshot,
  agentId: string,
  prompt: string,
  createdAt = new Date().toISOString(),
  attachments: readonly PromptAttachment[] = [],
): RendererMessage {
  const message = createUserMessage(agentId, prompt, createdAt, 'message', undefined, attachments);
  snapshot.messages.push(message);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

export function appendSteerPrompt(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  prompt: string,
  createdAt = new Date().toISOString(),
  attachments: readonly PromptAttachment[] = [],
): RendererMessage {
  const message = createUserMessage(agentId, prompt, createdAt, `steer-${turnId}`, turnId, attachments);
  const existing = snapshot.messages.find((candidate) => (
    candidate.agentId === agentId && candidate.id === message.id
  ));
  if (existing) return existing;

  const activeAssistantMessage = findAssistantMessage(snapshot, agentId, turnId);
  if (activeAssistantMessage?.parts.length === 0 && activeAssistantMessage.id.startsWith(`${assistantMessageId(turnId)}-segment-`)) {
    snapshot.messages = snapshot.messages.filter((message) => message.id !== activeAssistantMessage.id);
  } else if (activeAssistantMessage) {
    activeAssistantMessage.status = 'complete';
  }

  snapshot.messages.push(message);
  ensureAssistantMessage(snapshot, agentId, turnId, assistantSegmentMessageId(turnId, createdAt), createdAt);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

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
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

export function updateAgentFolder(snapshot: AppSnapshot, agentId: string, folder: string, updatedAt = new Date().toISOString()): Agent | null {
  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return null;
  }

  const nextFolder = normalizedFolder(folder);
  if (nextFolder !== agent.folder) {
    delete agent.workspace;
    delete agent.pullRequest;
  }
  agent.folder = nextFolder;
  clearAgentRuntimeState(agent);
  agent.updatedAt = updatedAt;

  return agent;
}

export function updateAgentWorkspace(
  snapshot: AppSnapshot,
  agentId: string,
  workspace: Agent['workspace'],
  updatedAt = new Date().toISOString(),
): Agent | null {
  const agent = findAgent(snapshot, agentId);
  if (!agent) return null;

  if (workspace) {
    agent.workspace = { ...workspace };
  } else {
    delete agent.workspace;
  }
  agent.updatedAt = updatedAt;
  return agent;
}

export function selectAgent(snapshot: AppSnapshot, agentId: string): AppSnapshot {
  const agent = findAgent(snapshot, agentId);
  if (agent) {
    snapshot.activeAgentId = agentId;
    const team = snapshot.teams.find((candidate) => candidate.id === agent.teamId);
    if (team) {
      snapshot.activeTeamId = team.id;
      team.activeAgentId = agentId;
    }
  }

  return snapshot;
}

export function snapshotMetadata(snapshot: AppSnapshot): AppSnapshotMetadata {
  const { messages: _messages, ...metadata } = snapshot;
  return metadata;
}

export function applySnapshotMetadata(snapshot: AppSnapshot, metadata: AppSnapshotMetadata): void {
  const { messages: _messages, ...safeMetadata } = metadata as AppSnapshotMetadata & { messages?: AppSnapshot['messages'] };
  Object.assign(snapshot, safeMetadata);
}

export function applyMainEventToSnapshot(snapshot: AppSnapshot, event: MainToRendererEvent): void {
  if (event.type === 'snapshot.updated') {
    const nextSnapshot = event.payload as AppSnapshotMetadata;
    if (isRecord(nextSnapshot) && Array.isArray(nextSnapshot.teams) && Array.isArray(nextSnapshot.agents)) {
      applySnapshotMetadata(snapshot, nextSnapshot);
    }
    return;
  }

  if (event.type === 'workRouting.requested') {
    const request = workRoutingRequest(event.payload);
    if (request) {
      snapshot.workRoutingRequests = [
        ...(snapshot.workRoutingRequests ?? []).filter((candidate) => candidate.id !== request.id),
        request,
      ];
    }
    return;
  }

  if (event.type === 'workRouting.resolved') {
    const id = isRecord(event.payload) && typeof event.payload.id === 'string' ? event.payload.id : '';
    if (id) {
      snapshot.workRoutingRequests = (snapshot.workRoutingRequests ?? []).filter((candidate) => candidate.id !== id);
    }
    return;
  }

  if (event.type === 'backend.statusChanged') {
    const payload = event.payload as unknown;
    if (isRecord(payload) && isBackend(payload.backend) && isBackendRuntimeStatus(payload.status)) {
      setBackendRuntimeStatus(snapshot, {
        backend: payload.backend,
        status: payload.status,
        detail: appText(payload.detail),
        capabilities: isRecord(payload.capabilities) ? backendCapabilities(payload.capabilities) : undefined,
      });
    }
    return;
  }

  if (event.type === 'account.rateLimitsUpdated') {
    const rateLimits = accountRateLimits(event.payload);
    if (rateLimits) {
      snapshot.accountRateLimits = rateLimits;
    }
    return;
  }

  if (event.type === 'workBacklog.assignmentUpdated') {
    const assignment = workBacklogAssignment(event.payload);
    if (assignment) {
      snapshot.workBacklog.assignments = {
        ...snapshot.workBacklog.assignments,
        [workItemAssignmentKey(assignment)]: assignment,
      };
    }
    return;
  }

  if (!event.agentId) {
    return;
  }

  if (event.type === 'agent.updated') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent && isRecord(event.payload)) {
      const statusText = event.payload.statusText;
      Object.assign(agent, event.payload);
      if (statusText === null) {
        delete agent.statusText;
      }
    }
    return;
  }

  if (event.type === 'agent.statusChanged') {
    setAgentStatus(snapshot, event.agentId, event.payload as AgentStatus);
    return;
  }

  if (event.type === 'thread.started') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent && event.backend === 'claude' && typeof event.backendSessionId === 'string') {
      const payload = isRecord(event.payload) ? event.payload : {};
      const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model : undefined;
      const reasoningEffort = typeof payload.reasoningEffort === 'string' && payload.reasoningEffort.trim()
        ? payload.reasoningEffort
        : undefined;
      agent.backend = 'claude';
      agent.backendSession = {
        kind: 'claude',
        sessionId: event.backendSessionId,
        transport: 'stdio',
        ...(model ? { model } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
      };
      const defaults = agent.backendDefaults?.kind === 'claude'
        ? agent.backendDefaults
        : { kind: 'claude' as const };
      agent.backendDefaults = {
        ...defaults,
        ...(model ? { model } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
      };
      if (model && !reasoningEffort) {
        delete agent.backendDefaults.reasoningEffort;
      }
      return;
    }

    if (agent && event.threadId) {
      if (snapshot.subagentTrees[event.agentId]?.rootConversationId !== event.threadId) {
        delete snapshot.subagentTrees[event.agentId];
      }
      agent.backend = 'codex';
      agent.backendSession = { kind: 'codex', threadId: event.threadId };
      agent.status = { type: 'idle' };
    }
    return;
  }

  if (event.type === 'subagent.operationChanged') {
    applySubagentOperationChange(snapshot, event.agentId, event.payload);
    return;
  }

  if (event.type === 'subagent.activityChanged') {
    applySubagentActivityChange(snapshot, event.agentId, event.payload);
    return;
  }

  if (event.type === 'subagent.identityChanged') {
    applySubagentIdentityChange(snapshot, event.agentId, event.payload);
    return;
  }

  if (event.type === 'subagent.statusChanged') {
    applySubagentStatusChange(snapshot, event.agentId, event.payload, event.occurredAt);
    return;
  }

  if (event.type === 'thread.historyLoaded') {
    const payload = event.payload as { messages?: unknown };
    const messages = rendererMessages(payload.messages, event.agentId);
    const replace = isRecord(event.payload) && event.payload.replace === true;
    const preserveKnownTurns = isRecord(event.payload) && event.payload.preserveKnownTurns === true;
    const preserveKnownMessages = isRecord(event.payload) && event.payload.preserveKnownMessages === true;
    hydrateAgentMessages(snapshot, event.agentId, messages, {
      preserveKnownMessages,
      preserveKnownTurns,
      replace,
    });
    return;
  }

  if (event.type === 'thread.settingsUpdated' && event.threadId) {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      agent.backend = 'codex';
      agent.backendSession = { kind: 'codex', threadId: event.threadId };
      const payload = isRecord(event.payload) ? event.payload : {};
      const approvalPreset = codexApprovalPresetFromThreadSettings(payload.threadSettings);
      if (approvalPreset) {
        agent.backendDefaults = codexBackendDefaultsWithApprovalPreset(agent.backendDefaults, approvalPreset);
      }
      if (isRecord(payload.threadSettings)) {
        const defaults = agent.backendDefaults?.kind === 'codex'
          ? agent.backendDefaults
          : { kind: 'codex' as const };
        agent.backendDefaults = {
          ...defaults,
          ...(typeof payload.threadSettings.model === 'string'
            ? { model: payload.threadSettings.model }
            : {}),
          ...(typeof payload.threadSettings.reasoningEffort === 'string'
            ? { reasoningEffort: payload.threadSettings.reasoningEffort }
            : {}),
          ...('serviceTier' in payload.threadSettings && (typeof payload.threadSettings.serviceTier === 'string' || payload.threadSettings.serviceTier === null)
            ? { serviceTier: payload.threadSettings.serviceTier }
            : {}),
        };
      }
    }
    return;
  }

  if (event.type === 'thread.tokenUsageUpdated') {
    const agent = findAgent(snapshot, event.agentId);
    const contextUsage = agentContextUsage(event.payload);
    if (agent && contextUsage) {
      agent.contextUsage = contextUsage;
    }
    return;
  }

  if (event.type === 'turn.started') {
    if (event.turnId) {
      ensureAssistantMessage(snapshot, event.agentId, event.turnId, assistantMessageId(event.turnId), event.occurredAt);
      pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    }
    setAgentStatus(snapshot, event.agentId, { type: 'working' });
    return;
  }

  if (event.type === 'turn.planUpdated' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const plan = threadPlan(event.payload, event.threadId, event.turnId, event.occurredAt);
    if (agent && plan) {
      const operation = planProgressOperation(agent, event.turnId);
      agent.plan = plan;
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, plan.markdown, 'completed', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanDelta' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    appendAgentPlanMarkdownDelta(snapshot, event.agentId, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'running', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanCompleted' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    updateAgentPlanMarkdown(snapshot, event.agentId, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'completed', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'thread.goalUpdated') {
    const agent = findAgent(snapshot, event.agentId);
    const goal = threadGoal(event.payload);
    if (agent && goal) {
      agent.goal = goal;
    }
    return;
  }

  if (event.type === 'thread.goalCleared') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      delete agent.goal;
    }
    return;
  }

  if (event.type === 'thread.modeUpdated') {
    return;
  }

  if (event.type === 'message.delta' && event.turnId) {
    const payload = event.payload as { delta?: unknown; itemId?: unknown; phase?: unknown };
    appendAssistantDeltaWithPlanFilter(
      snapshot,
      event.agentId,
      typeof event.threadId === 'string' ? event.threadId : undefined,
      event.turnId,
      typeof payload.delta === 'string' ? payload.delta : '',
      typeof payload.itemId === 'string' ? payload.itemId : undefined,
      event.occurredAt,
      payload.phase === 'commentary' || payload.phase === 'final_answer' ? payload.phase : undefined,
    );
    return;
  }

  if (event.type === 'message.updated') {
    const payload = isRecord(event.payload) ? event.payload : {};
    const [message] = rendererMessages([payload.message], event.agentId);
    if (!message) return;
    const messageIndex = snapshot.messages.findIndex((candidate) => (
      candidate.agentId === event.agentId && candidate.id === message.id
    ));
    if (messageIndex === -1) snapshot.messages.push(message);
    else snapshot.messages.splice(messageIndex, 1, message);
    pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    return;
  }

  if (event.type === 'message.userSubmitted') {
    const payload = isRecord(event.payload) ? event.payload : {};
    const [message] = rendererMessages([payload.message], event.agentId);
    if (message && !snapshot.messages.some((candidate) => candidate.id === message.id)) {
      snapshot.messages.push(message);
      pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    }
    return;
  }

  if (event.type === 'message.steer' && event.turnId) {
    const payload = event.payload as { prompt?: unknown; attachments?: unknown };
    if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
      appendSteerPrompt(
        snapshot,
        event.agentId,
        event.turnId,
        payload.prompt,
        event.occurredAt,
        promptAttachments(payload.attachments),
      );
    }
    return;
  }

  if (event.type === 'agent.promptQueued' && event.agentId) {
    const payload = event.payload as { id?: unknown; text?: unknown; options?: unknown; submitted?: unknown };
    if (typeof payload.id === 'string' && typeof payload.text === 'string') {
      const queuedPrompts = snapshot.queuedPrompts ?? [];
      if (!queuedPrompts.some((prompt) => prompt.agentId === event.agentId && prompt.id === payload.id)) {
        snapshot.queuedPrompts = [...queuedPrompts, {
          id: payload.id,
          agentId: event.agentId,
          text: payload.text,
          createdAt: event.occurredAt,
          ...(payload.options ? { options: payload.options as SendPromptOptions } : {}),
          ...(payload.submitted === true ? { submitted: true } : {}),
        }];
      }
    }
    return;
  }

  if (event.type === 'agent.promptRetryScheduled' && event.agentId) {
    const payload = event.payload as { id?: unknown; attempts?: unknown; lastError?: unknown; retryAt?: unknown };
    const queuedPrompt = (snapshot.queuedPrompts ?? []).find((prompt) => (
      prompt.agentId === event.agentId && prompt.id === payload.id
    ));
    if (
      queuedPrompt &&
      typeof payload.attempts === 'number' &&
      typeof payload.lastError === 'string'
    ) {
      queuedPrompt.attempts = payload.attempts;
      queuedPrompt.lastError = payload.lastError;
      queuedPrompt.submitted = true;
      if (typeof payload.retryAt === 'string') queuedPrompt.retryAt = payload.retryAt;
      else delete queuedPrompt.retryAt;
    }
    return;
  }

  if (event.type === 'agent.promptDequeued') {
    const payload = event.payload as { ids?: unknown };
    if (Array.isArray(payload.ids)) {
      const ids = new Set(payload.ids.filter((id): id is string => typeof id === 'string'));
      snapshot.queuedPrompts = (snapshot.queuedPrompts ?? []).filter((prompt) => (
        prompt.agentId !== event.agentId || !ids.has(prompt.id)
      ));
    }
    return;
  }

  if (event.type === 'backendApproval.requested' && event.agentId) {
    const approval = backendApprovalRequest(event.payload);
    if (approval) {
      const approvals = snapshot.backendApprovals[event.agentId] ?? [];
      snapshot.backendApprovals[event.agentId] = [
        ...approvals.filter((candidate) => candidate.id !== approval.id),
        approval,
      ];
      setAgentStatus(snapshot, event.agentId, { type: 'awaitingInput', detail: approval.title });
    }
    return;
  }

  if (event.type === 'backendApproval.resolved') {
    const approval = backendApprovalRequest(event.payload);
    if (approval) {
      const agentIds = event.agentId ? [event.agentId] : Object.keys(snapshot.backendApprovals);
      for (const agentId of agentIds) {
        snapshot.backendApprovals[agentId] = (snapshot.backendApprovals[agentId] ?? []).filter((candidate) => candidate.id !== approval.id);
      }
    }
    return;
  }

  if (event.type === 'context.compactionStarted' && event.turnId) {
    appendCompactionMarker(snapshot, event.agentId, event.turnId, event.occurredAt);
    return;
  }

  if (event.type === 'context.compactionCompleted' && event.turnId) {
    for (const message of findCompactionMessages(snapshot, event.agentId, event.turnId)) {
      message.status = 'complete';
    }
    return;
  }

  if ((event.type === 'item.started' || event.type === 'item.completed') && event.turnId) {
    const payload = event.payload as { toolPart?: unknown };
    const toolPart = rendererToolPart(payload.toolPart);
    if (toolPart) {
      upsertAssistantToolPart(snapshot, event.agentId, event.turnId, toolPart, event.occurredAt);
    }
    return;
  }

  if (event.type === 'item.updated' && event.turnId) {
    updateAssistantToolPart(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    return;
  }

  if (event.type === 'diff.updated' && event.turnId) {
    updateTurnGitDiff(snapshot, event.turnId, event.payload, event.occurredAt);
    updateAssistantTurnDiff(snapshot, event.agentId, event.turnId, event.payload);
    return;
  }

  if (event.type === 'git.statusUpdated' && event.agentId) {
    updateAgentGitStatus(snapshot, event.agentId, event.payload);
    return;
  }

  if (event.type === 'approval.requested' && event.turnId) {
    applyApprovalRequest(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    const confirmation = confirmToolRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: confirmation?.payload.confirmation.summary,
    });
    return;
  }

  if (event.type === 'toolInput.requested' && event.turnId) {
    applyToolInputRequest(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    const request = askUserRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: request?.payload.request.questions[0]?.question ?? 'Waiting for user input',
    });
    return;
  }

  if (event.type === 'turn.completed' && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    if (agent?.plan?.kind === 'execution' && agent.plan.turnId === event.turnId) {
      agent.plan.status = finalizedThreadPlanStatus(agent.plan, event.payload);
      agent.plan.updatedAt = event.occurredAt;
    }
    completeAssistantMessage(snapshot, event.agentId, event.turnId);
    setAgentStatus(snapshot, event.agentId, { type: 'idle' });
    return;
  }

  if (event.type === 'error') {
    const payload = event.payload as { message?: unknown; willRetry?: unknown };
    const message = typeof payload.message === 'string' ? payload.message : 'Backend error';
    if (payload.willRetry === true) {
      setAgentStatus(snapshot, event.agentId, { type: 'working', detail: message });
      return;
    }
    appendSystemMessage(snapshot, event.agentId, message, event.occurredAt);
    setAgentStatus(snapshot, event.agentId, { type: 'error', message });
  }
}

function applySubagentOperationChange(snapshot: AppSnapshot, agentId: string, value: unknown): void {
  if (!isRecord(value) || typeof value.rootConversationId !== 'string' || !isRecord(value.operation)) return;
  const operation = value.operation;
  if (
    typeof operation.id !== 'string' ||
    !isSubagentOperationKind(operation.kind) ||
    !isSubagentOperationLifecycle(operation.lifecycle) ||
    !isSubagentOperationStatus(operation.status) ||
    typeof operation.senderConversationId !== 'string' ||
    !Array.isArray(operation.receiverConversationIds) ||
    operation.receiverConversationIds.some((id) => typeof id !== 'string') ||
    typeof operation.occurredAt !== 'string'
  ) return;

  const tree = ensureSubagentTree(snapshot, agentId, value.rootConversationId);
  const receiverConversationIds = [...operation.receiverConversationIds] as string[];
  tree.operations[operation.id] = {
    id: operation.id,
    ...(typeof operation.turnId === 'string' ? { turnId: operation.turnId } : {}),
    lifecycle: operation.lifecycle,
    kind: operation.kind,
    status: operation.status,
    senderConversationId: operation.senderConversationId,
    receiverConversationIds,
    ...(typeof operation.prompt === 'string' ? { prompt: operation.prompt } : {}),
    ...(typeof operation.model === 'string' ? { model: operation.model } : {}),
    ...(typeof operation.reasoningEffort === 'string' ? { reasoningEffort: operation.reasoningEffort } : {}),
    occurredAt: operation.occurredAt,
  };

  const agentStates = isRecord(value.agentStates) ? value.agentStates : {};
  const conversationIds = new Set([...receiverConversationIds, ...Object.keys(agentStates)]);
  for (const conversationId of conversationIds) {
    if (conversationId === value.rootConversationId) continue;
    const state = isRecord(agentStates[conversationId]) ? agentStates[conversationId] : null;
    const status = state && isSubagentStatus(state.status) ? state.status : null;
    const existing = tree.nodes[conversationId];
    tree.nodes[conversationId] = {
      conversationId,
      parentConversationId: existing?.parentConversationId ?? operation.senderConversationId,
      createdAt: existing?.createdAt ?? operation.occurredAt,
      status: status ?? existing?.status ?? 'pendingInit',
      ...(typeof state?.message === 'string'
        ? { statusMessage: state.message }
        : existing?.statusMessage ? { statusMessage: existing.statusMessage } : {}),
      ...(existing?.agentPath ? { agentPath: existing.agentPath } : {}),
      ...(existing?.agentNickname ? { agentNickname: existing.agentNickname } : {}),
      ...(existing?.agentRole ? { agentRole: existing.agentRole } : {}),
      ...(typeof operation.prompt === 'string'
        ? { prompt: operation.prompt }
        : existing?.prompt ? { prompt: existing.prompt } : {}),
      ...(typeof operation.model === 'string'
        ? { model: operation.model }
        : existing?.model ? { model: existing.model } : {}),
      ...(typeof operation.reasoningEffort === 'string'
        ? { reasoningEffort: operation.reasoningEffort }
        : existing?.reasoningEffort ? { reasoningEffort: existing.reasoningEffort } : {}),
      updatedAt: operation.occurredAt,
    };
  }
}

function applySubagentActivityChange(snapshot: AppSnapshot, agentId: string, value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.rootConversationId !== 'string' ||
    typeof value.parentConversationId !== 'string' ||
    !isRecord(value.activity)
  ) return;
  const activity = value.activity;
  if (
    typeof activity.id !== 'string' ||
    !isSubagentOperationLifecycle(activity.lifecycle) ||
    !isSubagentActivityKind(activity.kind) ||
    typeof activity.conversationId !== 'string' ||
    typeof activity.agentPath !== 'string' ||
    typeof activity.occurredAt !== 'string'
  ) return;
  if (activity.conversationId === value.rootConversationId) return;

  const tree = ensureSubagentTree(snapshot, agentId, value.rootConversationId);
  tree.activities[activity.id] = {
    id: activity.id,
    ...(typeof activity.turnId === 'string' ? { turnId: activity.turnId } : {}),
    lifecycle: activity.lifecycle,
    kind: activity.kind,
    conversationId: activity.conversationId,
    agentPath: activity.agentPath,
    occurredAt: activity.occurredAt,
  };
  const existing = tree.nodes[activity.conversationId];
  tree.nodes[activity.conversationId] = {
    conversationId: activity.conversationId,
    parentConversationId: existing?.parentConversationId ?? value.parentConversationId,
    createdAt: existing?.createdAt ?? activity.occurredAt,
    status: activity.kind === 'interrupted' ? 'interrupted' : existing?.status ?? 'running',
    ...(existing?.statusMessage ? { statusMessage: existing.statusMessage } : {}),
    agentPath: activity.agentPath,
    ...(existing?.agentNickname ? { agentNickname: existing.agentNickname } : {}),
    ...(existing?.agentRole ? { agentRole: existing.agentRole } : {}),
    ...(existing?.prompt ? { prompt: existing.prompt } : {}),
    ...(existing?.model ? { model: existing.model } : {}),
    ...(existing?.reasoningEffort ? { reasoningEffort: existing.reasoningEffort } : {}),
    updatedAt: activity.occurredAt,
  };
}

function applySubagentIdentityChange(snapshot: AppSnapshot, agentId: string, value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.rootConversationId !== 'string' ||
    typeof value.conversationId !== 'string'
  ) return;
  const tree = snapshot.subagentTrees[agentId];
  if (!tree || tree.rootConversationId !== value.rootConversationId) return;
  const existing = tree.nodes[value.conversationId];
  if (!existing) return;
  const change: SubagentIdentityChange = {
    rootConversationId: value.rootConversationId,
    conversationId: value.conversationId,
    ...(typeof value.agentNickname === 'string' ? { agentNickname: value.agentNickname } : {}),
    ...(typeof value.agentRole === 'string' ? { agentRole: value.agentRole } : {}),
  };
  const updatedNode = { ...existing };
  if (change.agentNickname) updatedNode.agentNickname = change.agentNickname;
  else delete updatedNode.agentNickname;
  if (change.agentRole) updatedNode.agentRole = change.agentRole;
  else delete updatedNode.agentRole;
  tree.nodes[value.conversationId] = updatedNode;
}

function applySubagentStatusChange(
  snapshot: AppSnapshot,
  agentId: string,
  value: unknown,
  occurredAt: string,
): void {
  if (
    !isRecord(value) ||
    typeof value.rootConversationId !== 'string' ||
    typeof value.conversationId !== 'string' ||
    !isSubagentStatus(value.status)
  ) return;
  if (value.conversationId === value.rootConversationId) return;

  const tree = snapshot.subagentTrees[agentId];
  if (!tree || tree.rootConversationId !== value.rootConversationId) return;
  const existing = tree.nodes[value.conversationId];
  if (!existing) return;
  const change: SubagentStatusChange = {
    rootConversationId: value.rootConversationId,
    conversationId: value.conversationId,
    status: value.status,
    ...(typeof value.statusMessage === 'string' ? { statusMessage: value.statusMessage } : {}),
  };
  const updatedNode = {
    ...existing,
    status: change.status,
    updatedAt: occurredAt,
  };
  if (change.statusMessage) updatedNode.statusMessage = change.statusMessage;
  else delete updatedNode.statusMessage;
  tree.nodes[value.conversationId] = updatedNode;
}

function ensureSubagentTree(snapshot: AppSnapshot, agentId: string, rootConversationId: string): AgentSubagentTree {
  const existing = snapshot.subagentTrees[agentId];
  if (existing?.rootConversationId === rootConversationId) return existing;
  const created: AgentSubagentTree = {
    rootConversationId,
    nodes: {},
    operations: {},
    activities: {},
  };
  snapshot.subagentTrees[agentId] = created;
  return created;
}

function isSubagentStatus(value: unknown): value is SubagentStatus {
  return value === 'pendingInit' || value === 'running' || value === 'interrupted' || value === 'completed' ||
    value === 'errored' || value === 'shutdown' || value === 'notFound';
}

function isSubagentOperationKind(value: unknown): value is SubagentOperationChange['operation']['kind'] {
  return value === 'spawnAgent' || value === 'sendInput' || value === 'resumeAgent' || value === 'wait' || value === 'closeAgent';
}

function isSubagentOperationLifecycle(value: unknown): value is SubagentOperationChange['operation']['lifecycle'] {
  return value === 'started' || value === 'completed';
}

function isSubagentOperationStatus(value: unknown): value is SubagentOperationChange['operation']['status'] {
  return value === 'inProgress' || value === 'completed' || value === 'failed';
}

function isSubagentActivityKind(value: unknown): value is SubagentActivityChange['activity']['kind'] {
  return value === 'started' || value === 'interacted' || value === 'interrupted';
}

export function formatThreadPlanMarkdown(input: Pick<ThreadPlan, 'explanation' | 'steps'>): string {
  const explanation = input.explanation.trim();
  const steps = input.steps.map((entry) => {
    const marker = entry.status === 'completed' ? '- [x]' : '- [ ]';
    return `${marker} ${entry.step}`;
  });

  return [explanation, ...steps].filter(Boolean).join('\n');
}

function threadPlan(payload: unknown, threadId: string, turnId: string, updatedAt: string): ThreadPlan | null {
  if (!isRecord(payload)) {
    return null;
  }

  const explanation = typeof payload.explanation === 'string' && payload.explanation.trim()
    ? payload.explanation.trim()
    : '';
  const plan = Array.isArray(payload.plan) ? payload.plan : [];
  const steps = plan.map((entry): ThreadPlanStep | null => {
    if (!isRecord(entry) || typeof entry.step !== 'string') {
      return null;
    }

    const step = entry.step.trim();
    if (!step) {
      return null;
    }

    return {
      step,
      status: isThreadPlanStepStatus(entry.status) ? entry.status : 'pending',
    };
  }).filter((step): step is ThreadPlanStep => Boolean(step));

  const markdown = formatThreadPlanMarkdown({ explanation, steps });
  if (!markdown) {
    return null;
  }

  return {
    threadId,
    turnId,
    kind: 'execution',
    status: executionThreadPlanStatus(steps),
    explanation,
    steps,
    markdown,
    updatedAt,
  };
}

function executionThreadPlanStatus(steps: ThreadPlanStep[]): ThreadPlan['status'] {
  return steps.length > 0 && steps.every((step) => step.status === 'completed')
    ? 'completed'
    : 'inProgress';
}

function finalizedThreadPlanStatus(plan: ThreadPlan, payload: unknown): ThreadPlan['status'] {
  const turnStatus = turnCompletionStatus(payload);
  if (turnStatus === 'interrupted') return 'interrupted';
  if (turnStatus === 'failed') return 'failed';
  return plan.steps.length > 0 && plan.steps.every((step) => step.status === 'completed')
    ? 'completed'
    : 'incomplete';
}

function turnCompletionStatus(payload: unknown): string {
  if (!isRecord(payload)) return '';
  if (typeof payload.status === 'string') return payload.status;
  return isRecord(payload.turn) && typeof payload.turn.status === 'string'
    ? payload.turn.status
    : '';
}

function isThreadPlanStepStatus(value: unknown): value is ThreadPlanStep['status'] {
  return value === 'pending' || value === 'inProgress' || value === 'completed';
}

function appendAgentPlanMarkdownDelta(
  snapshot: AppSnapshot,
  agentId: string,
  threadId: string,
  turnId: string,
  payload: unknown,
  updatedAt: string,
): void {
  if (!isRecord(payload) || typeof payload.delta !== 'string' || !payload.delta) {
    return;
  }

  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return;
  }

  const existingMarkdown = agent.plan?.turnId === turnId ? agent.plan.markdown : '';
  setAgentPlanMarkdown(agent, threadId, turnId, `${existingMarkdown}${payload.delta}`, updatedAt, 'inProgress', { trim: false });
}

function updateAgentPlanMarkdown(
  snapshot: AppSnapshot,
  agentId: string,
  threadId: string,
  turnId: string,
  payload: unknown,
  updatedAt: string,
): void {
  if (!isRecord(payload) || typeof payload.markdown !== 'string') {
    return;
  }

  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    return;
  }

  setAgentPlanMarkdown(agent, threadId, turnId, payload.markdown, updatedAt, 'completed');
}

function setAgentPlanMarkdown(agent: Agent, threadId: string, turnId: string, markdown: string, updatedAt: string, status: ThreadPlan['status'], options: { trim?: boolean } = {}): void {
  const content = markdown.trim();
  if (!content) {
    return;
  }
  const nextMarkdown = options.trim === false ? markdown : content;

  if (
    agent.plan?.turnId === turnId &&
    agent.plan.kind === 'proposed' &&
    agent.plan.status === status &&
    agent.plan.markdown === nextMarkdown
  ) {
    return;
  }

  agent.plan = {
    threadId,
    turnId,
    kind: 'proposed',
    status,
    explanation: '',
    steps: [],
    markdown: nextMarkdown,
    updatedAt,
  };
}

function appendAssistantDeltaWithPlanFilter(
  snapshot: AppSnapshot,
  agentId: string,
  threadId: string | undefined,
  turnId: string,
  delta: string,
  itemId: string | undefined,
  updatedAt: string,
  phase?: 'commentary' | 'final_answer',
): void {
  if (!delta) {
    return;
  }

  if (!threadId) {
    appendAssistantDelta(snapshot, agentId, turnId, delta, updatedAt, itemId, phase);
    return;
  }

  const agent = findAgent(snapshot, agentId);
  if (!agent) {
    appendAssistantDelta(snapshot, agentId, turnId, delta, updatedAt, itemId, phase);
    return;
  }

  let remaining = delta;
  let capturing = isCapturingProposedPlan(snapshot, agentId, turnId);
  const operation = planProgressOperation(agent, turnId);

  while (remaining) {
    if (capturing) {
      const closeIndex = lowerIndexOf(remaining, '</proposed_plan>');
      const planDelta = closeIndex >= 0 ? remaining.slice(0, closeIndex) : remaining;
      if (planDelta) {
        appendAgentPlanMarkdownText(agent, threadId, turnId, planDelta, updatedAt);
      }
      if (closeIndex >= 0 && agent.plan?.turnId === turnId) {
        setAgentPlanMarkdown(agent, threadId, turnId, agent.plan.markdown, updatedAt, 'completed');
      }
      if (agent.plan?.turnId === turnId) {
        upsertPlanProgressToolPart(
          snapshot,
          agentId,
          turnId,
          agent.plan.markdown,
          closeIndex >= 0 ? 'completed' : 'running',
          operation,
          updatedAt,
          closeIndex < 0,
        );
      }

      if (closeIndex < 0) {
        return;
      }

      remaining = remaining.slice(closeIndex + '</proposed_plan>'.length);
      capturing = false;
      continue;
    }

    const openIndex = lowerIndexOf(remaining, '<proposed_plan>');
    if (openIndex < 0) {
      appendAssistantDelta(snapshot, agentId, turnId, remaining, updatedAt, itemId, phase);
      return;
    }

    const visibleDelta = remaining.slice(0, openIndex);
    if (visibleDelta) {
      appendAssistantDelta(snapshot, agentId, turnId, visibleDelta, updatedAt, itemId, phase);
    }

    remaining = remaining.slice(openIndex + '<proposed_plan>'.length);
    capturing = true;
    upsertPlanProgressToolPart(
      snapshot,
      agentId,
      turnId,
      agent.plan?.turnId === turnId ? agent.plan.markdown : '',
      'running',
      operation,
      updatedAt,
      true,
    );
  }
}

function appendAgentPlanMarkdownText(agent: Agent, threadId: string, turnId: string, delta: string, updatedAt: string): void {
  const existingMarkdown = agent.plan?.turnId === turnId ? agent.plan.markdown : '';
  setAgentPlanMarkdown(agent, threadId, turnId, `${existingMarkdown}${delta}`, updatedAt, 'inProgress', { trim: false });
}

function lowerIndexOf(value: string, search: string): number {
  return value.toLowerCase().indexOf(search.toLowerCase());
}

function planProgressOperation(agent: Agent, turnId: string): 'update' | 'write' {
  return agent.plan && agent.plan.turnId !== turnId ? 'update' : 'write';
}

function isCapturingProposedPlan(snapshot: AppSnapshot, agentId: string, turnId: string): boolean {
  return Boolean(planProgressToolPart(snapshot, agentId, turnId)?.metadata?.capturingProposedPlan);
}

function planProgressToolPart(snapshot: AppSnapshot, agentId: string, turnId: string): ToolPart | undefined {
  const message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, planProgressToolPartId(turnId));
  return message?.parts.find((part): part is ToolPart => part.type === 'tool' && part.id === planProgressToolPartId(turnId));
}

function upsertPlanProgressToolPart(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  markdown: string,
  status: ToolPart['status'],
  operation: 'update' | 'write',
  createdAt: string,
  capturingProposedPlan = false,
): void {
  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: planProgressToolPartId(turnId),
    kind: 'generic',
    title: 'plan',
    status,
    statusText: JSON.stringify({
      source: 'codex',
      action: 'plan',
      phase: status,
      params: {
        addedLines: planLineCount(markdown),
        operation,
        target: 'plan',
      },
    }),
    metadata: {
      capturingProposedPlan,
      planProgress: true,
    },
  }, createdAt);
}

function planProgressToolPartId(turnId: string): string {
  return `plan-${turnId}`;
}

function planLineCount(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => line.trim()).length;
}

function updateAssistantToolPart(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  payload: unknown,
  createdAt: string,
): void {
  const update = rendererToolPartUpdate(payload);
  if (!update) {
    return;
  }

  let message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, update.itemId) ?? findAssistantMessage(snapshot, agentId, turnId);
  let toolPart = message?.parts.find((part): part is ToolPart => {
    return part.type === 'tool' && part.id === update.itemId;
  });

  if (!toolPart && update.fallbackToolPart) {
    message = message ?? ensureAssistantMessage(snapshot, agentId, turnId, assistantMessageId(turnId), createdAt);
    message.parts.push(update.fallbackToolPart);
    toolPart = update.fallbackToolPart;
  }

  if (!toolPart) {
    return;
  }

  if (update.title) {
    toolPart.title = update.title;
  }

  if (update.status) {
    toolPart.status = update.status;
  }

  if (update.statusText === null) {
    delete toolPart.statusText;
  } else if (update.statusText !== undefined) {
    toolPart.statusText = update.statusText;
  }

  if (update.body !== undefined) {
    toolPart.body = update.body;
  }

  if (update.bodyDelta !== undefined) {
    toolPart.body = `${toolPart.body ?? ''}${update.bodyDelta}`;
  }

  if (update.bodyAppend !== undefined) {
    toolPart.body = [toolPart.body, update.bodyAppend].filter(Boolean).join('\n');
  }

  if ('output' in update) {
    toolPart.output = update.output;
    toolPart.body = update.body ?? toolOutputText(update.output) ?? toolPart.body;
  }

  if ('input' in update) {
    toolPart.input = update.input;
  }

  if (update.metadata) {
    toolPart.metadata = {
      ...(toolPart.metadata ?? {}),
      ...update.metadata,
    };
  }
}

function updateAssistantTurnDiff(snapshot: AppSnapshot, agentId: string, turnId: string, payload: unknown): void {
  if (!isRecord(payload)) {
    return;
  }

  const addedLines = typeof payload.addedLines === 'number' ? payload.addedLines : 0;
  const removedLines = typeof payload.removedLines === 'number' ? payload.removedLines : 0;
  if (!addedLines && !removedLines) {
    return;
  }

  const message = findAssistantMessage(snapshot, agentId, turnId);
  const toolPart = lastRunningFileChangeToolPart(message?.parts);
  if (!toolPart) {
    return;
  }

  const existingDescriptor = toolStatusDescriptor(toolPart.statusText);
  const existingParams = isRecord(existingDescriptor?.params) ? existingDescriptor.params : {};
  toolPart.statusText = JSON.stringify({
    action: typeof existingDescriptor?.action === 'string' ? existingDescriptor.action : 'edit',
    phase: toolPart.status,
    params: {
      ...existingParams,
      addedLines,
      removedLines,
      target: typeof existingParams.target === 'string' ? existingParams.target : toolPart.title,
    },
    source: 'codex',
  });
}

function updateTurnGitDiff(snapshot: AppSnapshot, turnId: string, payload: unknown, updatedAt: string): void {
  if (!isRecord(payload)) {
    return;
  }

  const addedLines = finiteNonNegativeInteger(payload.addedLines);
  const removedLines = finiteNonNegativeInteger(payload.removedLines);
  if (!addedLines && !removedLines) {
    return;
  }

  const diff = typeof payload.diff === 'string' ? payload.diff : undefined;
  const nextDiff: TurnGitDiff = {
    turnId,
    addedLines,
    removedLines,
    updatedAt,
    ...(diff ? { diff } : {}),
  };
  snapshot.turnGitDiffs = {
    ...snapshot.turnGitDiffs,
    [turnId]: nextDiff,
  };
}

function updateAgentGitStatus(snapshot: AppSnapshot, agentId: string, payload: unknown): void {
  if (!isAgentGitStatus(payload)) {
    return;
  }

  snapshot.agentGitStatuses = {
    ...snapshot.agentGitStatuses,
    [agentId]: payload,
  };
}

function isAgentGitStatus(value: unknown): value is AgentGitStatus {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.folder === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.state === 'clean' || value.state === 'dirty' || value.state === 'unknown') &&
    typeof value.ahead === 'number' &&
    typeof value.behind === 'number' &&
    typeof value.changedFiles === 'number' &&
    typeof value.addedLines === 'number' &&
    typeof value.removedLines === 'number' &&
    typeof value.hasUntracked === 'boolean'
  );
}

function finiteNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function toolStatusDescriptor(statusText: unknown): { action?: unknown; params?: unknown } | undefined {
  if (typeof statusText !== 'string' || !statusText.trim().startsWith('{')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(statusText) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function lastRunningFileChangeToolPart(parts: RendererMessagePart[] | undefined): ToolPart | undefined {
  if (!parts) {
    return undefined;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === 'tool' && part.kind === 'fileChange' && part.status === 'running') {
      return part;
    }
  }

  return undefined;
}

function rendererToolPart(value: unknown): ToolPart | null {
  if (
    !isRecord(value) ||
    value.type !== 'tool' ||
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.title !== 'string' ||
    !isToolStatus(value.status)
  ) {
    return null;
  }

  return value as ToolPart;
}

function agentContextUsage(value: unknown): AgentContextUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const usage = isRecord(value.contextUsage) ? value.contextUsage : value;
  const modelContextWindow = typeof usage.modelContextWindow === 'number' ? usage.modelContextWindow : null;
  const usedPercent = typeof usage.usedPercent === 'number' ? usage.usedPercent : null;
  if (
    typeof usage.totalTokens !== 'number' ||
    typeof usage.inputTokens !== 'number' ||
    typeof usage.cachedInputTokens !== 'number' ||
    typeof usage.outputTokens !== 'number' ||
    typeof usage.reasoningOutputTokens !== 'number' ||
    typeof usage.lastTotalTokens !== 'number'
  ) {
    return null;
  }

  return {
    totalTokens: usage.totalTokens,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    lastTotalTokens: usage.lastTotalTokens,
    modelContextWindow,
    usedPercent,
  };
}

function accountRateLimits(value: unknown): AccountRateLimits | null {
  if (!isRecord(value)) {
    return null;
  }

  const rateLimits = isRecord(value.rateLimits) ? value.rateLimits : value;
  return {
    limitId: nullableString(rateLimits.limitId),
    limitName: nullableString(rateLimits.limitName),
    primary: accountRateLimitWindow(rateLimits.primary),
    secondary: accountRateLimitWindow(rateLimits.secondary),
    credits: rateLimits.credits ?? null,
    individualLimit: rateLimits.individualLimit ?? null,
    planType: nullableString(rateLimits.planType),
    rateLimitReachedType: nullableString(rateLimits.rateLimitReachedType),
  };
}

function backendApprovalRequest(value: unknown): BackendApprovalRequest | null {
  const candidate = isRecord(value) && isRecord(value.approval) ? value.approval : value;
  if (
    !isRecord(candidate) ||
    typeof candidate.id !== 'string' ||
    (candidate.kind !== 'command' && candidate.kind !== 'file-change' && candidate.kind !== 'permissions') ||
    typeof candidate.conversationId !== 'string' ||
    typeof candidate.itemId !== 'string' ||
    typeof candidate.title !== 'string'
  ) {
    return null;
  }
  return candidate as BackendApprovalRequest;
}

function accountRateLimitWindow(value: unknown): AccountRateLimits['primary'] {
  if (!isRecord(value) || typeof value.usedPercent !== 'number') {
    return null;
  }

  return {
    usedPercent: value.usedPercent,
    windowDurationMins: typeof value.windowDurationMins === 'number' ? value.windowDurationMins : null,
    resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
  };
}

function workBacklogAssignment(value: unknown): WorkBacklogAssignment | null {
  if (
    !isRecord(value) ||
    value.provider !== 'github' ||
    typeof value.itemId !== 'string' ||
    typeof value.agentId !== 'string' ||
    typeof value.assignedAt !== 'string'
  ) {
    return null;
  }

  const status = value.status === 'working' ? 'inProgress' : value.status;
  if (status !== 'blocked' && status !== 'completed' && status !== 'inProgress' && status !== 'readyForReview') {
    return null;
  }

  return {
    provider: value.provider,
    itemId: value.itemId,
    agentId: value.agentId,
    assignedAt: value.assignedAt,
    policy: value.policy === 'complete' || value.policy === 'review'
      ? value.policy
      : typeof value.automationId === 'string' || typeof value.automationExecutionId === 'string' ? 'complete' : 'review',
    status,
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim() } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    ...(typeof value.automationId === 'string' && value.automationId.trim() ? { automationId: value.automationId.trim() } : {}),
    ...(typeof value.automationExecutionId === 'string' && value.automationExecutionId.trim() ? { automationExecutionId: value.automationExecutionId.trim() } : {}),
    ...(typeof value.completionInstructionsDeliveredAt === 'string' ? { completionInstructionsDeliveredAt: value.completionInstructionsDeliveredAt } : {}),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function threadGoal(value: unknown): ThreadGoal | null {
  const goal = isRecord(value) && isRecord(value.goal) ? value.goal : value;
  if (
    !isRecord(goal) ||
    typeof goal.threadId !== 'string' ||
    typeof goal.objective !== 'string' ||
    !isThreadGoalStatus(goal.status) ||
    (goal.tokenBudget !== null && typeof goal.tokenBudget !== 'number') ||
    typeof goal.tokensUsed !== 'number' ||
    typeof goal.timeUsedSeconds !== 'number' ||
    typeof goal.createdAt !== 'number' ||
    typeof goal.updatedAt !== 'number'
  ) {
    return null;
  }

  return {
    threadId: goal.threadId,
    objective: goal.objective,
    status: goal.status,
    tokenBudget: goal.tokenBudget,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function isThreadGoalStatus(value: unknown): value is ThreadGoal['status'] {
  return value === 'active' ||
    value === 'paused' ||
    value === 'blocked' ||
    value === 'usageLimited' ||
    value === 'budgetLimited' ||
    value === 'complete';
}

function rendererMessages(value: unknown, agentId: string): RendererMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((message): message is RendererMessage => {
    if (
      !isRecord(message) ||
      typeof message.id !== 'string' ||
      message.agentId !== agentId ||
      !isRendererMessageRole(message.role) ||
      !isRendererMessageStatus(message.status) ||
      !Array.isArray(message.parts) ||
      typeof message.createdAt !== 'string' ||
      ('turnId' in message && message.turnId !== undefined && typeof message.turnId !== 'string')
    ) {
      return false;
    }

    return (
      (!('kind' in message) || message.kind === undefined || message.kind === 'compaction' || message.kind === 'steer') &&
      message.parts.every(isRendererMessagePart)
    );
  });
}

function isRendererMessagePart(value: unknown): value is RendererMessagePart {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'text') {
    return typeof value.text === 'string'
      && optionalString(value.itemId)
      && (
        value.phase === undefined
        || value.phase === 'commentary'
        || value.phase === 'final_answer'
      );
  }

  if (value.type === 'reasoning') {
    return typeof value.summary === 'string'
      && typeof value.itemId === 'string'
      && typeof value.summaryIndex === 'number';
  }

  if (value.type === 'status') {
    return typeof value.text === 'string';
  }

  if (value.type === 'attachment') {
    return isRendererMessageAttachment(value.attachment);
  }

  if (value.type === 'media') {
    return isRendererMessageMedia(value.media) && optionalString(value.itemId);
  }

  return rendererToolPart(value) !== null;
}

function isRendererMessageAttachment(value: unknown): boolean {
  if (
    !isRecord(value) ||
    (value.kind !== 'file' && value.kind !== 'image') ||
    typeof value.name !== 'string'
  ) {
    return false;
  }

  return optionalString(value.path) && optionalString(value.url) && optionalString(value.mimeType);
}

function isRendererMessageMedia(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.url === 'string' &&
    optionalString(value.alt) &&
    optionalString(value.mimeType) &&
    optionalString(value.prompt) &&
    optionalString(value.title);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isRendererMessageRole(value: unknown): value is RendererMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isRendererMessageStatus(value: unknown): value is RendererMessage['status'] {
  return value === 'complete' || value === 'streaming' || value === 'error';
}

function hydrateAgentMessages(
  snapshot: AppSnapshot,
  agentId: string,
  messages: RendererMessage[],
  options: { preserveKnownMessages?: boolean; preserveKnownTurns?: boolean; replace?: boolean } = {},
): void {
  if (options.preserveKnownMessages) {
    reconcilePrependedAgentMessages(snapshot, agentId, messages);
    return;
  }
  if (options.preserveKnownTurns) {
    reconcileHydratedAgentTurns(snapshot, agentId, messages);
    return;
  }

  if (options.replace) {
    snapshot.messages = snapshot.messages.filter((message) => message.agentId !== agentId);
  }

  if (messages.length === 0) {
    return;
  }

  const hydratedIds = new Set(messages.map((message) => message.id));
  snapshot.messages = snapshot.messages.filter((message) => {
    return message.agentId !== agentId || !hydratedIds.has(message.id);
  });

  const firstAgentMessageIndex = snapshot.messages.findIndex((message) => message.agentId === agentId);
  if (firstAgentMessageIndex === -1) {
    snapshot.messages.push(...messages);
    pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
    return;
  }

  snapshot.messages.splice(firstAgentMessageIndex, 0, ...messages);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function reconcilePrependedAgentMessages(
  snapshot: AppSnapshot,
  agentId: string,
  messages: RendererMessage[],
): void {
  if (messages.length === 0) return;

  const existingById = new Map(snapshot.messages
    .filter((message) => message.agentId === agentId)
    .map((message) => [message.id, message]));
  const pageMessageIds = new Set<string>();
  const canonicalPage = messages.flatMap((message) => {
    if (pageMessageIds.has(message.id)) return [];
    pageMessageIds.add(message.id);
    return [existingById.get(message.id) ?? message];
  });
  const firstAgentMessageIndex = snapshot.messages.findIndex((message) => message.agentId === agentId);

  // A lifecycle update can hydrate a historical message before the pagination
  // chunk containing it arrives. The chunk is authoritative for placement, so
  // move any overlap into its canonical page position while preserving the
  // richer message object already held by the live transcript.
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (message?.agentId === agentId && pageMessageIds.has(message.id)) {
      snapshot.messages.splice(index, 1);
    }
  }
  if (firstAgentMessageIndex === -1) snapshot.messages.push(...canonicalPage);
  else snapshot.messages.splice(firstAgentMessageIndex, 0, ...canonicalPage);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function reconcileHydratedAgentTurns(snapshot: AppSnapshot, agentId: string, messages: RendererMessage[]): void {
  const existing = snapshot.messages.filter((message) => message.agentId === agentId);
  const knownTurnIds = new Set(existing.flatMap((message) => message.turnId ? [message.turnId] : []));
  const knownMessageIds = new Set(existing.map((message) => message.id));
  // Lifecycle hydration is a refreshed window, not an older page: it can add turns
  // on either side of the richer live transcript while known live turns stay authoritative.
  const additions = messages.filter((message) => (
    message.turnId ? !knownTurnIds.has(message.turnId) : !knownMessageIds.has(message.id)
  ));
  replaceAgentMessagesInPlace(snapshot, agentId, orderAgentMessagesByTurn([...existing, ...additions]));
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function orderAgentMessagesByTurn(messages: RendererMessage[]): RendererMessage[] {
  const groups = new Map<string, { createdAt: string; index: number; messages: RendererMessage[] }>();
  for (const [index, message] of messages.entries()) {
    const key = message.turnId ? `turn:${message.turnId}` : `message:${message.id}`;
    const group = groups.get(key);
    if (group) {
      group.messages.push(message);
      if (message.createdAt < group.createdAt) group.createdAt = message.createdAt;
    } else {
      groups.set(key, { createdAt: message.createdAt, index, messages: [message] });
    }
  }

  return [...groups.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.index - right.index)
    .flatMap((group) => group.messages);
}

function replaceAgentMessagesInPlace(snapshot: AppSnapshot, agentId: string, messages: RendererMessage[]): void {
  const firstAgentMessageIndex = snapshot.messages.findIndex((message) => message.agentId === agentId);
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    if (snapshot.messages[index]?.agentId === agentId) snapshot.messages.splice(index, 1);
  }
  if (firstAgentMessageIndex === -1) snapshot.messages.push(...messages);
  else snapshot.messages.splice(firstAgentMessageIndex, 0, ...messages);
}

function rendererToolPartUpdate(value: unknown): RendererToolPartUpdate | null {
  if (!isRecord(value) || typeof value.itemId !== 'string') {
    return null;
  }

  if ('status' in value && value.status !== undefined && !isToolStatus(value.status)) {
    return null;
  }

  const fallbackToolPart = rendererToolPart(value.fallbackToolPart);
  if ('fallbackToolPart' in value && value.fallbackToolPart !== undefined && !fallbackToolPart) {
    return null;
  }

  const update: RendererToolPartUpdate = {
    itemId: value.itemId,
    title: typeof value.title === 'string' ? value.title : undefined,
    status: isToolStatus(value.status) ? value.status : undefined,
    statusText: value.statusText === null || typeof value.statusText === 'string' ? value.statusText : undefined,
    body: typeof value.body === 'string' ? value.body : undefined,
    bodyDelta: typeof value.bodyDelta === 'string' ? value.bodyDelta : undefined,
    bodyAppend: typeof value.bodyAppend === 'string' ? value.bodyAppend : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    fallbackToolPart: fallbackToolPart ?? undefined,
  };

  if ('input' in value) {
    update.input = value.input;
  }

  if ('output' in value) {
    update.output = value.output;
  }

  return update;
}

function isToolStatus(value: unknown): value is ToolPart['status'] {
  return value === 'running' || value === 'completed' || value === 'failed';
}

function setBackendRuntimeStatus(snapshot: AppSnapshot, status: AppSnapshot['backendRuntimes'][number]): void {
  const existingIndex = snapshot.backendRuntimes.findIndex((candidate) => candidate.backend === status.backend);
  if (existingIndex === -1) {
    snapshot.backendRuntimes.push(status);
    return;
  }

  snapshot.backendRuntimes[existingIndex] = status;
}

function isBackend(value: unknown): value is AppSnapshot['backendRuntimes'][number]['backend'] {
  return value === 'codex' || value === 'claude';
}

function isBackendRuntimeStatus(value: unknown): value is AppSnapshot['backendRuntimes'][number]['status'] {
  return value === 'notConfigured' || value === 'starting' || value === 'running' || value === 'error';
}

type BackendRuntimeCapabilities = NonNullable<AppSnapshot['backendRuntimes'][number]['capabilities']>;

function backendCapabilities(value: Record<string, unknown>): Partial<BackendRuntimeCapabilities> {
  return {
    ...(typeof value.attachments === 'boolean' ? { attachments: value.attachments } : {}),
    ...(typeof value.models === 'boolean' ? { models: value.models } : {}),
    ...(typeof value.skills === 'boolean' ? { skills: value.skills } : {}),
    ...(typeof value.reasoningEffort === 'boolean' ? { reasoningEffort: value.reasoningEffort } : {}),
    ...(typeof value.serviceTier === 'boolean' ? { serviceTier: value.serviceTier } : {}),
    ...(typeof value.thinkingBudget === 'boolean' ? { thinkingBudget: value.thinkingBudget } : {}),
    ...(isBackendPlanModeSupport(value.planMode) ? { planMode: value.planMode } : {}),
    ...(typeof value.goals === 'boolean' ? { goals: value.goals } : {}),
    ...(typeof value.steerPrompt === 'boolean' ? { steerPrompt: value.steerPrompt } : {}),
    ...(typeof value.interrupt === 'boolean' ? { interrupt: value.interrupt } : {}),
    ...(typeof value.history === 'boolean' ? { history: value.history } : {}),
    ...(typeof value.conversationFork === 'boolean' ? { conversationFork: value.conversationFork } : {}),
    ...(typeof value.rollback === 'boolean' ? { rollback: value.rollback } : {}),
    ...(typeof value.editMessage === 'boolean' ? { editMessage: value.editMessage } : {}),
    ...(typeof value.retryMessage === 'boolean' ? { retryMessage: value.retryMessage } : {}),
    ...(typeof value.approvals === 'boolean' ? { approvals: value.approvals } : {}),
    ...(Array.isArray(value.approvalPresets) ? { approvalPresets: value.approvalPresets.filter(isApprovalPreset) } : {}),
    ...(Array.isArray(value.permissionModes) ? { permissionModes: value.permissionModes.flatMap(permissionModeOption) } : {}),
  };
}

function permissionModeOption(value: unknown): NonNullable<BackendRuntimeCapabilities['permissionModes']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    !appText(record.label) ||
    !appText(record.description)
  ) {
    return [];
  }
  return [{
    id: record.id,
    label: appText(record.label)!,
    description: appText(record.description)!,
    ...(typeof record.dangerous === 'boolean' ? { dangerous: record.dangerous } : {}),
  }];
}

function isBackendPlanModeSupport(value: unknown): value is BackendRuntimeCapabilities['planMode'] {
  return value === 'native' || value === 'prompted' || value === 'unsupported';
}

function isApprovalPreset(value: unknown): value is ApprovalPreset {
  return value === 'ask-for-approval' || value === 'approve-for-me' || value === 'full-access';
}

function upsertAssistantToolPart(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  toolPart: ToolPart,
  createdAt: string,
): void {
  const message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, toolPart.id) ??
    ensureAssistantMessage(snapshot, agentId, turnId, assistantMessageId(turnId), createdAt);
  const existingIndex = message.parts.findIndex((part) => part.type === 'tool' && part.id === toolPart.id);

  if (existingIndex >= 0) {
    const existing = message.parts[existingIndex] as ToolPart;
    message.parts[existingIndex] = {
      ...existing,
      ...toolPart,
      body: toolPart.body ?? existing.body,
      input: toolPart.input ?? existing.input,
      output: toolPart.output ?? existing.output,
      statusText: toolPart.statusText ?? (toolPart.status === 'running' ? existing.statusText : undefined),
      metadata: {
        ...(existing.metadata ?? {}),
        ...(toolPart.metadata ?? {}),
      },
    };
    pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
    return;
  }

  message.parts.push(toolPart);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function applyApprovalRequest(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  payload: unknown,
  createdAt: string,
): void {
  const request = confirmToolRequest(payload);
  if (!request) {
    return;
  }

  const confirmation = request.payload.confirmation;
  const toolPart = findPendingMcpToolPart(snapshot, agentId, turnId, confirmation.integrationId, confirmation.toolName);
  const statusText = JSON.stringify({
    source: 'mcp',
    action: 'run',
    phase: 'running',
    params: {
      requestId: request.id,
      tool: `${confirmation.integrationId}.${confirmation.toolName}`,
      confirmationSummary: confirmation.summary,
      argumentsPreview: confirmation.argumentsPreview,
      allowConversation: confirmation.allowConversation === true,
      allowAlways: confirmation.allowAlways === true,
    },
  });
  const input = parseJsonPreview(confirmation.argumentsPreview) ?? (confirmation.argumentsPreview || undefined);

  if (toolPart) {
    toolPart.title = `${confirmation.integrationId}.${confirmation.toolName}`;
    toolPart.status = 'running';
    toolPart.statusText = statusText;
    toolPart.input = toolPart.input ?? input;
    toolPart.metadata = {
      ...(toolPart.metadata ?? {}),
      confirmationRequestId: request.id,
      server: confirmation.integrationId,
      tool: confirmation.toolName,
    };
    return;
  }

  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: `approval-${request.id}`,
    kind: 'mcp',
    title: `${confirmation.integrationId}.${confirmation.toolName}`,
    status: 'running',
    statusText,
    input,
    metadata: {
      confirmationRequestId: request.id,
      server: confirmation.integrationId,
      tool: confirmation.toolName,
    },
  }, createdAt);
}

function applyToolInputRequest(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  payload: unknown,
  createdAt: string,
): void {
  const request = askUserRequest(payload);
  if (!request) {
    return;
  }

  const question = request.payload.request.questions[0];
  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: request.payload.request.itemId,
    kind: 'generic',
    title: 'ask_user_question',
    status: 'running',
    statusText: JSON.stringify({
      source: 'codex',
      action: 'ask_user_question',
      phase: 'running',
      params: {
        requestId: request.id,
        questions: request.payload.request.questions,
      },
    }),
    input: request.payload.request.questions,
    metadata: {
      requestId: request.id,
      question: question?.question,
    },
  }, createdAt);
}

function findPendingMcpToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, server: string, tool: string): ToolPart | undefined {
  const runningMcpTools = findAssistantMessages(snapshot, agentId, turnId).flatMap((message) => (
    message.parts.filter((part): part is ToolPart => {
      if (part.type !== 'tool' || part.kind !== 'mcp' || part.status !== 'running') {
        return false;
      }

      return true;
    })
  ));
  const exactMatch = runningMcpTools.find((part) => {
    const metadataServer = isRecord(part.metadata) ? stringValue(part.metadata.server) : undefined;
    const metadataTool = isRecord(part.metadata) ? stringValue(part.metadata.tool) : undefined;
    return (
      (metadataServer === server && metadataTool === tool) ||
      part.title === `${server}.${tool}` ||
      part.title.endsWith(`.${tool}`)
    );
  });

  return exactMatch ?? (runningMcpTools.length === 1 ? runningMcpTools[0] : undefined);
}

function confirmToolRequest(payload: unknown): Extract<ClientRequest, { kind: 'confirm_tool' }> | null {
  if (
    !isRecord(payload) ||
    payload.kind !== 'confirm_tool' ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.confirmation)
  ) {
    return null;
  }

  const confirmation = payload.payload.confirmation;
  if (
    typeof confirmation.argumentsPreview !== 'string' ||
    typeof confirmation.integrationId !== 'string' ||
    typeof confirmation.integrationName !== 'string' ||
    typeof confirmation.summary !== 'string' ||
    typeof confirmation.toolName !== 'string'
  ) {
    return null;
  }

  return payload as Extract<ClientRequest, { kind: 'confirm_tool' }>;
}

function askUserRequest(payload: unknown): Extract<ClientRequest, { kind: 'ask_user' }> | null {
  if (
    !isRecord(payload) ||
    payload.kind !== 'ask_user' ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.request) ||
    typeof payload.payload.request.itemId !== 'string' ||
    !Array.isArray(payload.payload.request.questions)
  ) {
    return null;
  }

  return payload as Extract<ClientRequest, { kind: 'ask_user' }>;
}

function workRoutingRequest(payload: unknown): Extract<ClientRequest, { kind: 'work_routing' }> | null {
  if (
    !isRecord(payload) ||
    payload.kind !== 'work_routing' ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.request) ||
    typeof payload.payload.request.agentId !== 'string' ||
    typeof payload.payload.request.task !== 'string' ||
    typeof payload.payload.request.suggestedBranchName !== 'string' ||
    !Array.isArray(payload.payload.request.sharedFolderAgentNames) ||
    !payload.payload.request.sharedFolderAgentNames.every((name) => typeof name === 'string')
  ) {
    return null;
  }

  return payload as Extract<ClientRequest, { kind: 'work_routing' }>;
}

function parseJsonPreview(preview: string): unknown {
  if (!preview.trim().startsWith('{') && !preview.trim().startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(preview);
  } catch {
    return undefined;
  }
}

function appendAssistantDelta(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  delta: string,
  createdAt: string,
  itemId?: string,
  phase?: 'commentary' | 'final_answer',
): void {
  const message = ensureAssistantMessage(snapshot, agentId, turnId, assistantMessageId(turnId), createdAt);
  if (message.status !== 'complete') {
    message.status = 'streaming';
  }

  const textPart = message.parts.at(-1);
  if (textPart?.type === 'text' && textPart.itemId === itemId) {
    textPart.text += delta;
    if (phase) textPart.phase = phase;
  } else {
    message.parts.push({
      type: 'text',
      text: delta,
      ...(itemId ? { itemId } : {}),
      ...(phase ? { phase } : {}),
    });
  }
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function appendCompactionMarker(snapshot: AppSnapshot, agentId: string, turnId: string, createdAt: string): RendererMessage {
  const existing = snapshot.messages.find((message) => {
    return message.agentId === agentId && message.id === compactionMessageId(turnId);
  });
  if (existing) {
    return existing;
  }

  const activeAssistantMessage = findAssistantMessage(snapshot, agentId, turnId);
  if (activeAssistantMessage?.parts.length === 0 && activeAssistantMessage.id === assistantMessageId(turnId)) {
    snapshot.messages = snapshot.messages.filter((message) => message !== activeAssistantMessage);
  } else if (activeAssistantMessage) {
    activeAssistantMessage.status = 'complete';
  }

  const message: RendererMessage = {
    id: compactionMessageId(turnId),
    agentId,
    kind: 'compaction',
    role: 'assistant',
    status: 'streaming',
    turnId,
    createdAt,
    parts: [],
  };
  snapshot.messages.push(message);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

function ensureAssistantMessage(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  messageId: string,
  createdAt: string,
): RendererMessage {
  let effectiveMessageId = messageId;
  let effectiveCreatedAt = createdAt;
  const compactionMessage = messageId === assistantMessageId(turnId)
    ? findCompactionMessages(snapshot, agentId, turnId).at(-1)
    : undefined;
  const message = messageId === assistantMessageId(turnId)
    ? findAssistantMessageForAppend(snapshot, agentId, turnId)
    : snapshot.messages.find((candidate) => candidate.id === messageId && candidate.agentId === agentId);

  if (message) {
    return message;
  }
  if (compactionMessage) {
    effectiveMessageId = assistantSegmentMessageId(turnId, compactionMessage.createdAt);
    effectiveCreatedAt = compactionMessage.createdAt;
  }

  const nextMessage: RendererMessage = {
    id: effectiveMessageId,
    agentId,
    role: 'assistant',
    status: 'streaming',
    turnId,
    createdAt: effectiveCreatedAt,
    parts: [],
  };
  snapshot.messages.push(nextMessage);
  return nextMessage;
}

function completeAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): void {
  for (const message of findAssistantMessages(snapshot, agentId, turnId)) {
    message.status = 'complete';
  }
  for (const message of findCompactionMessages(snapshot, agentId, turnId)) {
    message.status = 'complete';
  }

  snapshot.messages = snapshot.messages.filter((message) => (
    message.agentId !== agentId ||
    !isAssistantTurnMessage(message, agentId, turnId) ||
    message.parts.length > 0
  ));
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

function pruneSupersededEmptyAssistantPlaceholders(snapshot: AppSnapshot, agentId: string): void {
  let lastAgentMessageIndex = -1;
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    if (snapshot.messages[index]?.agentId === agentId) {
      lastAgentMessageIndex = index;
      break;
    }
  }

  if (lastAgentMessageIndex === -1) {
    return;
  }

  for (let index = lastAgentMessageIndex - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (message?.agentId === agentId && isPlainEmptyAssistantPlaceholder(message)) {
      snapshot.messages.splice(index, 1);
    }
  }
}

function isPlainEmptyAssistantPlaceholder(message: RendererMessage): boolean {
  return message.role === 'assistant' && message.kind === undefined && message.parts.length === 0;
}

function findAssistantMessageForAppend(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  const compactionMessage = findCompactionMessages(snapshot, agentId, turnId).at(-1);
  if (!compactionMessage) {
    return findAssistantMessage(snapshot, agentId, turnId);
  }

  const compactionIndex = snapshot.messages.indexOf(compactionMessage);
  return snapshot.messages
    .slice(compactionIndex + 1)
    .filter((message) => isAssistantTurnMessage(message, agentId, turnId))
    .at(-1);
}

function findAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  return findAssistantMessages(snapshot, agentId, turnId).at(-1);
}

function findAssistantMessages(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage[] {
  return snapshot.messages.filter((message) => isAssistantTurnMessage(message, agentId, turnId));
}

function isAssistantTurnMessage(message: RendererMessage, agentId: string, turnId: string): boolean {
  const baseId = assistantMessageId(turnId);
  return (
    message.agentId === agentId &&
    message.role === 'assistant' &&
    (message.id === baseId || message.id.startsWith(`${baseId}-segment-`))
  );
}

function findCompactionMessages(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage[] {
  return snapshot.messages.filter((message) => (
    message.agentId === agentId &&
    message.kind === 'compaction' &&
    message.turnId === turnId
  ));
}

function findAssistantMessageWithToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, itemId: string): RendererMessage | undefined {
  return findAssistantMessages(snapshot, agentId, turnId).find((message) => (
    message.parts.some((part) => part.type === 'tool' && part.id === itemId)
  ));
}

function assistantMessageId(turnId: string): string {
  return `assistant-${turnId}`;
}

function assistantSegmentMessageId(turnId: string, createdAt: string): string {
  return `${assistantMessageId(turnId)}-segment-${createdAt.replace(/\W/g, '').toLowerCase()}`;
}

function compactionMessageId(turnId: string): string {
  return `compaction-${turnId}`;
}

function createUserMessage(
  agentId: string,
  prompt: string,
  createdAt: string,
  idPrefix = 'message',
  turnId?: string,
  attachments: readonly PromptAttachment[] = [],
): RendererMessage {
  const isSteer = idPrefix.startsWith('steer-');
  return {
    id: `${idPrefix}-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    ...(isSteer ? { kind: 'steer' as const } : {}),
    role: 'user',
    status: 'complete',
    ...(turnId ? { turnId } : {}),
    createdAt,
    parts: [
      { type: 'text', text: prompt },
      ...attachments.map(promptAttachmentPart),
    ],
  };
}

function promptAttachmentPart(attachment: PromptAttachment): RendererMessagePart {
  const name = attachment.name?.trim() || attachmentFileName(attachment.path) || (
    attachment.type === 'image' ? 'Image' : 'File'
  );
  return {
    type: 'attachment',
    attachment: {
      kind: attachment.type,
      name,
      path: attachment.path,
      ...('mimeType' in attachment && attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
      ...(attachment.type === 'image' && attachment.previewUrl ? { url: attachment.previewUrl } : {}),
    },
  };
}

function promptAttachments(value: unknown): PromptAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || (candidate.type !== 'image' && candidate.type !== 'file') || typeof candidate.path !== 'string') {
      return [];
    }
    return [{
      type: candidate.type,
      path: candidate.path,
      ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
      ...(typeof candidate.mimeType === 'string' ? { mimeType: candidate.mimeType } : {}),
      ...(candidate.type === 'image' && typeof candidate.detail === 'string' && (
        candidate.detail === 'auto' || candidate.detail === 'low' || candidate.detail === 'high' || candidate.detail === 'original'
      ) ? { detail: candidate.detail } : {}),
      ...(candidate.type === 'image' && typeof candidate.previewUrl === 'string' ? { previewUrl: candidate.previewUrl } : {}),
    } satisfies PromptAttachment];
  });
}

function attachmentFileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1)?.trim() ?? '';
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

function activeTeamId(snapshot: AppSnapshot): string {
  if (snapshot.activeTeamId && snapshot.teams.some((team) => team.id === snapshot.activeTeamId)) {
    return snapshot.activeTeamId;
  }

  const activeAgent = snapshot.activeAgentId ? findAgent(snapshot, snapshot.activeAgentId) : undefined;
  if (activeAgent?.teamId) {
    return activeAgent.teamId;
  }

  const activeTeam = snapshot.teams.find((team) => activeAgent && team.agentIds.includes(activeAgent.id));
  return activeTeam?.id ?? snapshot.teams[0]?.id ?? seedTeamId;
}

function targetTeamId(snapshot: AppSnapshot, teamId: string | undefined): string {
  if (teamId && snapshot.teams.some((team) => team.id === teamId)) {
    return teamId;
  }

  return activeTeamId(snapshot);
}

function attachAgentToTeam(snapshot: AppSnapshot, agent: Agent): void {
  let team = snapshot.teams.find((candidate) => candidate.id === agent.teamId);
  if (!team) {
    team = snapshot.teams[0];
  }

  if (!team) {
    return;
  }

  agent.teamId = team.id;
  if (!team.agentIds.includes(agent.id)) {
    team.agentIds.push(agent.id);
  }
  team.activeAgentId = agent.id;
}

function clearAgentRuntimeState(agent: Agent): void {
  delete agent.backendSession;
  delete agent.contextUsage;
  delete agent.plan;
  delete agent.goal;
  delete agent.isRegistered;
  delete agent.mcpSessionId;
  delete agent.statusText;
}

function normalizedBackend(value: AgentBackend | undefined): AgentBackend {
  return value === 'claude' ? 'claude' : 'codex';
}

function defaultBackendDefaults(backend: AgentBackend): Agent['backendDefaults'] {
  return backend === 'claude' ? { kind: 'claude' } : { kind: 'codex' };
}

function normalizedBackendDefaults(defaults: BackendDefaults | undefined, backend: AgentBackend): Agent['backendDefaults'] {
  if (!defaults || defaults.kind !== backend) {
    return undefined;
  }

  return defaults.kind === 'claude' && defaults.thinking
    ? { ...defaults, thinking: { ...defaults.thinking } }
    : { ...defaults };
}

function normalizedFolder(folder: string): string {
  return folder.trim();
}

function normalizedOptionalString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function folderBasename(folder: string): string {
  return normalizedFolder(folder).split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function createDefaultTeam(): AppSnapshot['teams'][number] {
  return {
    id: seedTeamId,
    name: 'Codex Claw',
    avatar: 'CC',
    color: defaultTeamColor,
    agentIds: [],
  };
}

function createSeedAgents(): Agent[] {
  return [
    {
      id: 'agent-dina',
      teamId: seedTeamId,
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    },
    {
      id: 'agent-jesse',
      teamId: seedTeamId,
      name: 'Jesse',
      avatar: 'JE',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    },
  ];
}
