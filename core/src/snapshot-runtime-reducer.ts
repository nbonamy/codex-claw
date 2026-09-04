import type {
  AccountRateLimits,
  AgentContextUsage,
  AgentGitStatus,
  AgentStatus,
  ApprovalPreset,
  AppSnapshot,
  AppSnapshotMetadata,
  ClientRequest,
  MainToRendererEvent,
  ThreadGoal,
  WorkBacklogAssignment,
} from './contracts';
import {
  findAgentInSnapshot as findAgent,
  setAgentStatusInSnapshot as setAgentStatus,
} from './agent-manager';
import { appText } from './app-text';
import { codexApprovalPresetFromThreadSettings, codexBackendDefaultsWithApprovalPreset } from './codex-approval-presets';
import { applySnapshotMetadata } from './snapshot-construction';
import { workItemAssignmentKey } from './work-assignments';

export function applyRuntimeEventToSnapshot(snapshot: AppSnapshot, event: MainToRendererEvent): boolean {
  if (event.type === 'snapshot.updated') {
    const nextSnapshot = event.payload as AppSnapshotMetadata;
    if (isRecord(nextSnapshot) && Array.isArray(nextSnapshot.teams) && Array.isArray(nextSnapshot.agents)) {
      applySnapshotMetadata(snapshot, nextSnapshot);
    }
    return true;
  }

  if (event.type === 'workRouting.requested') {
    const request = workRoutingRequest(event.payload);
    if (request) {
      snapshot.workRoutingRequests = [
        ...(snapshot.workRoutingRequests ?? []).filter((candidate) => candidate.id !== request.id),
        request,
      ];
    }
    return true;
  }

  if (event.type === 'workRouting.resolved') {
    const id = isRecord(event.payload) && typeof event.payload.id === 'string' ? event.payload.id : '';
    if (id) {
      snapshot.workRoutingRequests = (snapshot.workRoutingRequests ?? []).filter((candidate) => candidate.id !== id);
    }
    return true;
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
    return true;
  }

  if (event.type === 'account.rateLimitsUpdated') {
    const rateLimits = accountRateLimits(event.payload);
    if (rateLimits) {
      snapshot.accountRateLimits = rateLimits;
    }
    return true;
  }

  if (event.type === 'workBacklog.assignmentUpdated') {
    const assignment = workBacklogAssignment(event.payload);
    if (assignment) {
      snapshot.workBacklog.assignments = {
        ...snapshot.workBacklog.assignments,
        [workItemAssignmentKey(assignment)]: assignment,
      };
    }
    return true;
  }

  if (!event.agentId) {
    return true;
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
    return true;
  }

  if (event.type === 'agent.statusChanged') {
    setAgentStatus(snapshot, event.agentId, event.payload as AgentStatus);
    return true;
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
      return true;
    }

    if (agent && event.threadId) {
      agent.backend = 'codex';
      agent.backendSession = { kind: 'codex', threadId: event.threadId };
      agent.status = { type: 'idle' };
    }
    return true;
  }

  if (event.type === 'thread.settingsUpdated') {
    if (event.threadId) {
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
    }
    return true;
  }

  if (event.type === 'thread.tokenUsageUpdated') {
    const agent = findAgent(snapshot, event.agentId);
    const contextUsage = agentContextUsage(event.payload);
    if (agent && contextUsage) {
      agent.contextUsage = contextUsage;
    }
    return true;
  }

  if (event.type === 'thread.goalUpdated') {
    const agent = findAgent(snapshot, event.agentId);
    const goal = threadGoal(event.payload);
    if (agent && goal) {
      agent.goal = goal;
    }
    return true;
  }

  if (event.type === 'thread.goalCleared') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      delete agent.goal;
    }
    return true;
  }

  if (event.type === 'thread.modeUpdated') {
    return true;
  }

  if (event.type === 'git.statusUpdated' && event.agentId) {
    updateAgentGitStatus(snapshot, event.agentId, event.payload);
    return true;
  }

  return false;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
