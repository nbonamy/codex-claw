import type { Agent, AppSnapshot, Automation, AutomationExecutionLogEntry, AutomationTarget, CreateAutomationInput, UpdateAutomationInput } from './contracts';
import { createEntityId, type IdGenerator } from './ids';
import { resolveAgentBackend } from './agent-backends';
import { normalizeAutomationSchedule } from './automation-schedule';

export function isAutomationTarget(value: unknown): value is AutomationTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  if (target.kind === 'agent' || target.kind === 'quickChat') return typeof target.agentId === 'string' && Boolean(target.agentId.trim());
  return target.kind === 'newQuickChat' && typeof target.teamId === 'string' && Boolean(target.teamId.trim())
    && (target.backend === 'codex' || target.backend === 'claude')
    && (target.model === undefined || typeof target.model === 'string')
    && (target.reasoningEffort === undefined || typeof target.reasoningEffort === 'string');
}

export function canTargetAutomationAgent(snapshot: Pick<AppSnapshot, 'teams' | 'missions'>, agent: Agent): boolean {
  return !agent.codeReview && !snapshot.teams.some(team => team.id === agent.teamId && team.remoteConnectionId)
    && !(snapshot.missions ?? []).some(mission => Object.values(mission.stageAgentIds).includes(agent.id)
      || mission.execution?.memberIds.includes(agent.id) || mission.execution?.runs.some(run => run.workerId === agent.id));
}

function normalize(snapshot: AppSnapshot, input: CreateAutomationInput) {
  const schedule = normalizeAutomationSchedule(input.schedule);
  if (!isAutomationTarget(input.target) || typeof input.prompt !== 'string' || !input.prompt.trim()
    || !schedule) return null;
  let target: AutomationTarget = { ...input.target };
  if (target.kind === 'newQuickChat') {
    const teamId = target.teamId.trim();
    if (!snapshot.teams.some(team => team.id === teamId && !team.remoteConnectionId)) return null;
    target = { ...target, teamId, backend: resolveAgentBackend(snapshot, target.backend) };
  } else {
    const agentId = target.agentId.trim();
    const agent = snapshot.agents.find(agent => agent.id === agentId);
    if (!agent || !canTargetAutomationAgent(snapshot, agent)
      || (target.kind === 'quickChat') !== (agent.sessionKind === 'quickChat')) return null;
    target = { kind: target.kind, agentId };
  }
  return { name: input.name?.trim() || input.prompt.trim().split('\n')[0]!.slice(0, 80), enabled: input.enabled !== false,
    prompt: input.prompt.trim(), target, schedule };
}

export function createAutomationInSnapshot(snapshot: AppSnapshot, input: CreateAutomationInput, createdAt = new Date().toISOString(), createId: IdGenerator = () => createEntityId('automation')): Automation | null {
  const normalized = normalize(snapshot, input);
  if (!normalized) return null;
  const id = createId();
  if (snapshot.automations.some(automation => automation.id === id)) return null;
  const automation: Automation = { ...normalized, id, createdAt, updatedAt: createdAt, executionLog: [] };
  snapshot.automations.push(automation);
  return automation;
}

export function updateAutomationInSnapshot(snapshot: AppSnapshot, input: UpdateAutomationInput, updatedAt = new Date().toISOString()): Automation | null {
  const automation = snapshot.automations.find(item => item.id === input.id);
  const normalized = normalize(snapshot, input);
  if (!automation || !normalized) return null;
  if (JSON.stringify(automation.schedule) !== JSON.stringify(normalized.schedule) || (!automation.enabled && normalized.enabled)) {
    automation.scheduleAnchorAt = updatedAt;
  }
  Object.assign(automation, normalized, { updatedAt });
  delete automation.lastError;
  return automation;
}

export function deleteAutomationFromSnapshot(snapshot: AppSnapshot, automationId: string): Automation | null {
  const automation = snapshot.automations.find(item => item.id === automationId);
  if (!automation) return null;
  snapshot.automations = snapshot.automations.filter(item => item.id !== automationId);
  return automation;
}

export function automationExecutionIsActive(entry: AutomationExecutionLogEntry): boolean {
  return entry.status === 'working' || entry.status === 'awaitingInput';
}

export function clearAutomationExecutionHistoryInSnapshot(snapshot: AppSnapshot, automationId: string, updatedAt = new Date().toISOString()): Automation | null {
  const automation = snapshot.automations.find(item => item.id === automationId);
  if (!automation) return null;
  automation.executionLog = automation.executionLog.filter(automationExecutionIsActive);
  automation.updatedAt = updatedAt;
  delete automation.lastError;
  return automation;
}

export function deleteAutomationExecutionFromSnapshot(snapshot: AppSnapshot, automationId: string, executionId: string, updatedAt = new Date().toISOString()): Automation | null {
  const automation = snapshot.automations.find(item => item.id === automationId);
  const entry = automation?.executionLog.find(item => item.id === executionId);
  if (!automation || !entry || automationExecutionIsActive(entry)) return null;
  automation.executionLog = automation.executionLog.filter(item => item.id !== executionId);
  automation.updatedAt = updatedAt;
  return automation;
}

export function recordAutomationExecutionInSnapshot(snapshot: AppSnapshot, automationId: string, entry: AutomationExecutionLogEntry): Automation | null {
  const automation = snapshot.automations.find(item => item.id === automationId);
  if (!automation || entry.automationId !== automationId) return null;
  automation.executionLog = [entry, ...automation.executionLog.filter(item => item.id !== entry.id)].slice(0, 50);
  automation.lastRunAt = entry.startedAt;
  automation.updatedAt = entry.completedAt ?? entry.startedAt;
  if (entry.error) automation.lastError = entry.error;
  else delete automation.lastError;
  return automation;
}
