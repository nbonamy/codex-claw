import type {
  AccountRateLimits,
  AgentContextUsage,
  ApprovalPreset,
  AppSnapshot,
  ThreadGoal,
  WorkBacklogAssignment,
} from './contracts';
import {
  findAgentInSnapshot as findAgent,
  setAgentStatusInSnapshot as setAgentStatus,
} from './agent-manager';
import { appText } from './app-text';
import { codexApprovalPresetFromThreadSettings, codexBackendDefaultsWithApprovalPreset } from './codex-approval-presets';
import { replaceAppSnapshot } from './snapshot-construction';
import { decodeAppSnapshot } from './snapshot-guards';
import type { SnapshotEventOwnedBy } from './snapshot-event-ownership';
import { workItemAssignmentKey } from './work-assignments';

export function applyRuntimeEventToSnapshot(
  snapshot: AppSnapshot,
  event: SnapshotEventOwnedBy<'runtime'>,
): void {
  if (event.type === 'snapshot.updated') {
    const decodedSnapshot = decodeAppSnapshot(event.payload);
    if (decodedSnapshot) {
      replaceAppSnapshot(snapshot, decodedSnapshot.value);
    }
    return;
  }

  if (event.type === 'backend.statusChanged') {
    const payload = event.payload;
    setBackendRuntimeStatus(snapshot, {
      backend: payload.backend,
      status: payload.status,
      detail: appText(payload.detail),
      capabilities: payload.capabilities ? backendCapabilities(payload.capabilities) : undefined,
    });
    return;
  }

  if (event.type === 'account.rateLimitsUpdated') {
    snapshot.accountRateLimits = accountRateLimits(event.payload);
    return;
  }

  if (event.type === 'workBacklog.assignmentUpdated') {
    const assignment = workBacklogAssignment(event.payload);
    snapshot.workBacklog.assignments = {
      ...snapshot.workBacklog.assignments,
      [workItemAssignmentKey(assignment)]: assignment,
    };
    return;
  }

  if (!event.agentId) {
    return;
  }

  if (event.type === 'agent.updated') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent) {
      const statusText = event.payload.statusText;
      Object.assign(agent, event.payload);
      if (statusText === null) {
        delete agent.statusText;
      }
    }
    return;
  }

  if (event.type === 'agent.statusChanged') {
    setAgentStatus(snapshot, event.agentId, event.payload, event.occurredAt);
    return;
  }

  if (event.type === 'thread.started') {
    const agent = findAgent(snapshot, event.agentId);
    if (agent && event.backend === 'claude') {
      const payload = event.payload;
      const model = payload.model?.trim() ? payload.model : undefined;
      const reasoningEffort = payload.reasoningEffort?.trim()
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
      agent.backend = 'codex';
      agent.backendSession = { kind: 'codex', threadId: event.threadId };
    }
    return;
  }

  if (event.type === 'thread.settingsUpdated') {
    if (event.threadId) {
      const agent = findAgent(snapshot, event.agentId);
      if (agent) {
        agent.backend = 'codex';
        agent.backendSession = { kind: 'codex', threadId: event.threadId };
        const payload = event.payload;
        const approvalPreset = codexApprovalPresetFromThreadSettings(payload.threadSettings);
        if (approvalPreset) {
          agent.backendDefaults = codexBackendDefaultsWithApprovalPreset(agent.backendDefaults, approvalPreset);
        }
        const defaults = agent.backendDefaults?.kind === 'codex'
          ? agent.backendDefaults
          : { kind: 'codex' as const };
        agent.backendDefaults = {
          ...defaults,
          ...(payload.threadSettings.model !== undefined
            ? { model: payload.threadSettings.model }
            : {}),
          ...(payload.threadSettings.reasoningEffort !== undefined
            ? { reasoningEffort: payload.threadSettings.reasoningEffort }
            : {}),
          ...(payload.threadSettings.serviceTier !== undefined
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
    if (agent) {
      agent.contextUsage = contextUsage;
    }
    return;
  }

  if (event.type === 'thread.goalUpdated') {
    const agent = findAgent(snapshot, event.agentId);
    const goal = threadGoal(event.payload);
    if (agent) {
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

  if (event.type === 'git.statusUpdated') {
    snapshot.agentGitStatuses = {
      ...snapshot.agentGitStatuses,
      [event.agentId]: event.payload,
    };
    return;
  }

  const exhaustiveEvent: never = event;
  void exhaustiveEvent;
}

function agentContextUsage(
  value: RuntimeEventPayload<'thread.tokenUsageUpdated'>,
): AgentContextUsage {
  const usage = 'contextUsage' in value ? value.contextUsage : value;

  return {
    totalTokens: usage.totalTokens,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    lastTotalTokens: usage.lastTotalTokens,
    modelContextWindow: usage.modelContextWindow,
    usedPercent: usage.usedPercent,
  };
}

function accountRateLimits(
  value: RuntimeEventPayload<'account.rateLimitsUpdated'>,
): AccountRateLimits {
  const rateLimits = 'rateLimits' in value && isRecord(value.rateLimits)
    ? value.rateLimits
    : value as AccountRateLimits;
  return {
    limitId: rateLimits.limitId,
    limitName: rateLimits.limitName,
    primary: accountRateLimitWindow(rateLimits.primary),
    secondary: accountRateLimitWindow(rateLimits.secondary),
    credits: rateLimits.credits ?? null,
    individualLimit: rateLimits.individualLimit ?? null,
    planType: rateLimits.planType,
    rateLimitReachedType: rateLimits.rateLimitReachedType,
  };
}

function accountRateLimitWindow(value: AccountRateLimits['primary']): AccountRateLimits['primary'] {
  if (!value) return null;
  return {
    usedPercent: value.usedPercent,
    windowDurationMins: typeof value.windowDurationMins === 'number' ? value.windowDurationMins : null,
    resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
  };
}

function workBacklogAssignment(
  value: RuntimeEventPayload<'workBacklog.assignmentUpdated'>,
): WorkBacklogAssignment {
  const status = value.status === 'working' ? 'inProgress' : value.status;

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
  };
}

function threadGoal(value: RuntimeEventPayload<'thread.goalUpdated'>): ThreadGoal {
  const goal = 'goal' in value ? value.goal : value;

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

function setBackendRuntimeStatus(snapshot: AppSnapshot, status: AppSnapshot['backendRuntimes'][number]): void {
  const existingIndex = snapshot.backendRuntimes.findIndex((candidate) => candidate.backend === status.backend);
  if (existingIndex === -1) {
    snapshot.backendRuntimes.push(status);
    return;
  }

  snapshot.backendRuntimes[existingIndex] = status;
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
    ...(typeof value.deleteTurn === 'boolean' ? { deleteTurn: value.deleteTurn } : {}),
    ...(typeof value.editTurn === 'boolean' ? { editTurn: value.editTurn } : {}),
    ...(typeof value.retryTurn === 'boolean' ? { retryTurn: value.retryTurn } : {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

type RuntimeEventPayload<Type extends SnapshotEventOwnedBy<'runtime'>['type']> =
  Extract<SnapshotEventOwnedBy<'runtime'>, { type: Type }>['payload'];
