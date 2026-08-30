import type {
  AppSnapshot,
  BackendDefaults,
  CreateAutomationInput,
  Automation,
  AutomationAction,
  BackendConversationRef,
  AutomationExecutionLogEntry,
  AutomationSourceConfiguration,
  AutomationTeamTarget,
  UpdateAutomationInput,
} from './contracts';
import { createEntityId, type IdGenerator } from './ids';

const MAX_AUTOMATION_EXECUTION_LOG_ENTRIES = 50;

export type AutomationExecutionConversationUpdate = {
  conversationRef: BackendConversationRef;
  updatedAt: string;
};

export function createAutomationInSnapshot(
  snapshot: AppSnapshot,
  input: CreateAutomationInput,
  createdAt = new Date().toISOString(),
  createId: IdGenerator = () => createEntityId('automation'),
): Automation | null {
  const normalized = normalizeAutomationInput(snapshot, input);
  if (!normalized) {
    return null;
  }

  const automation: Automation = {
    id: uniqueAutomationId(snapshot, normalized.name, createdAt, createId),
    name: normalized.name,
    enabled: normalized.enabled,
    source: normalized.source,
    action: normalized.action,
    instructions: normalized.instructions,
    executionLog: [],
    createdAt,
    updatedAt: createdAt,
  };

  snapshot.automations.push(automation);
  return automation;
}

export function updateAutomationInSnapshot(
  snapshot: AppSnapshot,
  input: UpdateAutomationInput,
  updatedAt = new Date().toISOString(),
): Automation | null {
  const automation = snapshot.automations.find((candidate) => candidate.id === input.id);
  const normalized = normalizeAutomationInput(snapshot, input);
  if (!automation || !normalized) {
    return null;
  }

  automation.name = normalized.name;
  automation.enabled = normalized.enabled;
  automation.source = normalized.source;
  automation.action = normalized.action;
  automation.instructions = normalized.instructions;
  automation.updatedAt = updatedAt;
  delete automation.lastError;

  return automation;
}

export function deleteAutomationFromSnapshot(snapshot: AppSnapshot, automationId: string): Automation | null {
  const automation = snapshot.automations.find((candidate) => candidate.id === automationId);
  if (!automation) {
    return null;
  }

  snapshot.automations = snapshot.automations.filter((candidate) => candidate.id !== automationId);
  return automation;
}

export function clearAutomationExecutionHistoryInSnapshot(
  snapshot: AppSnapshot,
  automationId: string,
  updatedAt = new Date().toISOString(),
): Automation | null {
  const automation = snapshot.automations.find((candidate) => candidate.id === automationId);
  if (!automation) {
    return null;
  }

  automation.executionLog = [];
  automation.updatedAt = updatedAt;
  delete automation.lastRunAt;
  delete automation.lastCreatedCount;
  delete automation.lastError;
  return automation;
}

export function deleteAutomationExecutionFromSnapshot(
  snapshot: AppSnapshot,
  automationId: string,
  executionId: string,
  updatedAt = new Date().toISOString(),
): Automation | null {
  const automation = snapshot.automations.find((candidate) => candidate.id === automationId);
  if (!automation || !automation.executionLog.some((entry) => entry.id === executionId)) {
    return null;
  }

  automation.executionLog = automation.executionLog.filter((entry) => entry.id !== executionId);
  automation.updatedAt = updatedAt;
  const latestEntry = automation.executionLog[0];
  if (latestEntry) {
    automation.lastRunAt = latestEntry.startedAt;
    automation.lastCreatedCount = latestEntry.createdCount;
    if (latestEntry.status === 'failed' && latestEntry.error) {
      automation.lastError = latestEntry.error;
    } else {
      delete automation.lastError;
    }
  } else {
    delete automation.lastRunAt;
    delete automation.lastCreatedCount;
    delete automation.lastError;
  }

  return automation;
}

export function recordAutomationExecutionInSnapshot(
  snapshot: AppSnapshot,
  automationId: string,
  entry: AutomationExecutionLogEntry,
): Automation | null {
  const automation = snapshot.automations.find((candidate) => candidate.id === automationId);
  if (!automation || entry.automationId !== automationId) {
    return null;
  }

  automation.executionLog = [
    cloneAutomationExecutionEntry(entry),
    ...(automation.executionLog ?? []).filter((candidate) => candidate.id !== entry.id),
  ].slice(0, MAX_AUTOMATION_EXECUTION_LOG_ENTRIES);
  automation.lastRunAt = entry.startedAt;
  automation.lastCreatedCount = entry.createdCount;
  automation.updatedAt = entry.completedAt ?? entry.startedAt;
  if (entry.status === 'failed' && entry.error) {
    automation.lastError = entry.error;
  } else {
    delete automation.lastError;
  }

  return automation;
}

export function completeAutomationExecutionInSnapshot(
  snapshot: AppSnapshot,
  automationId: string,
  executionId: string,
  completedAt = new Date().toISOString(),
): Automation | null {
  const automation = snapshot.automations.find((candidate) => candidate.id === automationId);
  const execution = automation?.executionLog?.find((candidate) => candidate.id === executionId);
  if (!automation || !execution || execution.automationId !== automationId) {
    return null;
  }

  execution.status = 'completed';
  execution.completedAt = completedAt;
  delete execution.error;
  automation.updatedAt = completedAt;
  if (automation.lastError && automation.executionLog.every((entry) => entry.status !== 'failed')) {
    delete automation.lastError;
  }

  return automation;
}

export function updateAutomationExecutionAgentConversationInSnapshot(
  snapshot: AppSnapshot,
  automationId: string,
  executionId: string,
  agentId: string,
  update: AutomationExecutionConversationUpdate,
): Automation | null {
  const automation = snapshot.automations.find((candidate) => candidate.id === automationId);
  const execution = automation?.executionLog?.find((candidate) => candidate.id === executionId);
  const createdAgent = execution?.createdAgents.find((candidate) => candidate.agentId === agentId);
  if (!automation || !execution || !createdAgent) {
    return null;
  }

  createdAgent.conversationRef = { ...update.conversationRef };
  automation.updatedAt = update.updatedAt;

  return automation;
}

function normalizeAutomationInput(snapshot: AppSnapshot, input: CreateAutomationInput): Omit<Automation, 'createdAt' | 'id' | 'lastCreatedCount' | 'lastError' | 'lastRunAt' | 'updatedAt'> | null {
  const source = normalizeAutomationSource(input.source);
  const action = normalizeAutomationAction(snapshot, input.action);
  if (!source || !action) {
    return null;
  }

  const name = input.name?.trim() || defaultAutomationName(source);
  return {
    name,
    enabled: input.enabled !== false,
    source,
    action,
    instructions: normalizeAutomationInstructions(input.instructions),
    executionLog: [],
  };
}

function cloneAutomationExecutionEntry(entry: AutomationExecutionLogEntry): AutomationExecutionLogEntry {
  return {
    ...entry,
    createdAgents: entry.createdAgents.map((createdAgent) => ({ ...createdAgent })),
  };
}

function normalizeAutomationSource(source: AutomationSourceConfiguration): AutomationSourceConfiguration | null {
  if (source.provider !== 'github') {
    return null;
  }

  const repositoryId = source.repositoryId.trim();
  if (!repositoryId) {
    return null;
  }

  const assigneeLogin = source.assigneeLogin?.trim();
  const tagName = source.tagName?.trim();
  return {
    provider: 'github',
    repositoryId,
    ...(assigneeLogin ? { assigneeLogin } : {}),
    ...(tagName ? { tagName } : {}),
  };
}

function normalizeAutomationInstructions(instructions: CreateAutomationInput['instructions']): Automation['instructions'] {
  const assignment = instructions?.assignment?.trim();
  const beforeCompletion = instructions?.beforeCompletion?.trim();
  return {
    ...(assignment ? { assignment } : {}),
    ...(beforeCompletion ? { beforeCompletion } : {}),
  };
}

function normalizeAutomationAction(snapshot: AppSnapshot, action: AutomationAction): AutomationAction | null {
  const teamTarget = normalizeTeamTarget(snapshot, action.teamTarget);
  if (!teamTarget) {
    return null;
  }

  if (action.type === 'create-agent') {
    const sourceRepositoryPath = action.sourceRepositoryPath.trim();
    if (!sourceRepositoryPath) {
      return null;
    }
    const backend = action.backend === 'claude' ? 'claude' : 'codex';
    const backendDefaults = normalizeBackendDefaults(action.backendDefaults, backend);

    return {
      type: 'create-agent',
      sourceRepositoryPath,
      backend,
      ...(backendDefaults ? { backendDefaults } : {}),
      teamTarget,
      cleanup: normalizeAutomationCleanup(action.cleanup, teamTarget),
    };
  }

  if (action.type === 'create-agent-from-bench') {
    const benchTemplateId = action.benchTemplateId.trim();
    if (!benchTemplateId || !snapshot.bench.some((template) => template.id === benchTemplateId)) {
      return null;
    }

    return {
      type: 'create-agent-from-bench',
      benchTemplateId,
      teamTarget,
      cleanup: normalizeAutomationCleanup(action.cleanup, teamTarget),
    };
  }

  return null;
}

function normalizeBackendDefaults(defaults: BackendDefaults | undefined, backend: 'codex' | 'claude'): BackendDefaults | undefined {
  if (!defaults || defaults.kind !== backend) {
    return { kind: backend };
  }

  if (defaults.kind === 'codex') {
    const model = defaults.model?.trim();
    const reasoningEffort = defaults.reasoningEffort?.trim();
    return {
      kind: 'codex',
      ...(model ? { model } : {}),
      ...(defaults.approvalPreset ? { approvalPreset: defaults.approvalPreset } : {}),
      ...(defaults.approvalPolicy ? { approvalPolicy: defaults.approvalPolicy } : {}),
      ...(defaults.approvalsReviewer ? { approvalsReviewer: defaults.approvalsReviewer } : {}),
      ...(defaults.sandboxMode ? { sandboxMode: defaults.sandboxMode } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    };
  }

  const model = defaults.model?.trim();
  return {
    kind: 'claude',
    ...(model ? { model } : {}),
    ...(defaults.permissionMode ? { permissionMode: defaults.permissionMode } : {}),
    ...(defaults.thinking ? { thinking: { ...defaults.thinking } } : {}),
  };
}

function normalizeAutomationCleanup(cleanup: AutomationAction['cleanup'] | undefined, teamTarget: AutomationTeamTarget): AutomationAction['cleanup'] {
  if (teamTarget.mode === 'dedicated') {
    return {
      deleteTeam: cleanup?.deleteTeam !== false,
    };
  }

  return {
    deleteAgent: cleanup?.deleteAgent !== false,
  };
}

function normalizeTeamTarget(snapshot: AppSnapshot, target: AutomationTeamTarget): AutomationTeamTarget | null {
  if (target.mode === 'dedicated') {
    return { mode: 'dedicated' };
  }

  if (target.mode === 'existing') {
    const teamId = target.teamId.trim();
    return teamId && snapshot.teams.some((team) => team.id === teamId)
      ? { mode: 'existing', teamId }
      : null;
  }

  return null;
}

function defaultAutomationName(source: AutomationSourceConfiguration): string {
  if (source.provider === 'github') {
    const filters = [source.assigneeLogin, source.tagName].filter(Boolean);
    return filters.length > 0 ? `${source.repositoryId} / ${filters.join(' / ')}` : source.repositoryId;
  }
  return 'Automation';
}

function uniqueAutomationId(snapshot: AppSnapshot, name: string, createdAt: string, createId: IdGenerator): string {
  const generated = createId();
  if (generated && !snapshot.automations.some((automation) => automation.id === generated)) {
    return generated;
  }

  const baseId = `automation-${slug(name)}-${createdAt.replace(/\W/g, '').toLowerCase()}`;
  if (!snapshot.automations.some((automation) => automation.id === baseId)) {
    return baseId;
  }

  let counter = 2;
  while (snapshot.automations.some((automation) => automation.id === `${baseId}-${counter}`)) {
    counter += 1;
  }
  return `${baseId}-${counter}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'automation';
}
