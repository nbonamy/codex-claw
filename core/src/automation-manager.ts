import type {
  AppSnapshot,
  CreateAutomationInput,
  Automation,
  BackendConversationRef,
  AutomationExecutionLogEntry,
  AutomationRepositoryTarget,
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
    repositories: normalized.repositories,
    teamId: normalized.teamId,
    ...(normalized.selectionPrompt ? { selectionPrompt: normalized.selectionPrompt } : {}),
    ...(normalized.assignmentPrompt ? { assignmentPrompt: normalized.assignmentPrompt } : {}),
    schedule: normalized.schedule,
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
  automation.repositories = normalized.repositories;
  automation.teamId = normalized.teamId;
  automation.schedule = normalized.schedule;
  if (normalized.selectionPrompt) {
    automation.selectionPrompt = normalized.selectionPrompt;
  } else {
    delete automation.selectionPrompt;
  }
  if (normalized.assignmentPrompt) {
    automation.assignmentPrompt = normalized.assignmentPrompt;
  } else {
    delete automation.assignmentPrompt;
  }
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

function normalizeAutomationInput(
  snapshot: AppSnapshot,
  input: CreateAutomationInput,
): Omit<Automation, 'createdAt' | 'id' | 'lastCreatedCount' | 'lastError' | 'lastRunAt' | 'updatedAt'> | null {
  const repositories = normalizeAutomationRepositories(input.repositories);
  const teamId = input.teamId.trim();
  const intervalMinutes = Math.floor(input.schedule.intervalMinutes);
  if (
    repositories.length === 0 ||
    !teamId ||
    !snapshot.teams.some((team) => team.id === teamId) ||
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes < 1
  ) {
    return null;
  }

  const name = input.name?.trim() || defaultAutomationName(repositories);
  const selectionPrompt = input.selectionPrompt?.trim();
  const assignmentPrompt = input.assignmentPrompt?.trim();
  return {
    name,
    enabled: input.enabled !== false,
    repositories,
    teamId,
    ...(selectionPrompt ? { selectionPrompt } : {}),
    ...(assignmentPrompt ? { assignmentPrompt } : {}),
    schedule: { intervalMinutes },
    executionLog: [],
  };
}

function cloneAutomationExecutionEntry(entry: AutomationExecutionLogEntry): AutomationExecutionLogEntry {
  return {
    ...entry,
    createdAgents: entry.createdAgents.map((createdAgent) => ({
      ...createdAgent,
    })),
  };
}

function normalizeAutomationRepositories(repositories: AutomationRepositoryTarget[]): AutomationRepositoryTarget[] {
  const seen = new Set<string>();
  const normalized: AutomationRepositoryTarget[] = [];
  for (const repository of repositories) {
    const repositoryId = repository.repositoryId.trim();
    const sourceRepositoryPath = repository.sourceRepositoryPath.trim();
    const key = `${repository.provider}:${repositoryId}`;
    if (repository.provider !== 'github' || !repositoryId || !sourceRepositoryPath || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ provider: 'github', repositoryId, sourceRepositoryPath });
  }
  return normalized;
}

function defaultAutomationName(repositories: AutomationRepositoryTarget[]): string {
  if (repositories.length === 1) {
    return repositories[0]!.repositoryId;
  }
  return `${repositories[0]!.repositoryId} +${repositories.length - 1}`;
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
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'automation'
  );
}
