import type {
  AppSnapshot,
  CreateLoopInput,
  Loop,
  LoopAction,
  LoopExecutionLogEntry,
  LoopSourceConfiguration,
  LoopTeamTarget,
  UpdateLoopInput,
} from './contracts';
import { createEntityId, type IdGenerator } from './ids';

const MAX_LOOP_EXECUTION_LOG_ENTRIES = 50;

export type LoopExecutionConversationUpdate = {
  conversationId: string;
  turnId?: string;
  updatedAt: string;
};

export function createLoopInSnapshot(
  snapshot: AppSnapshot,
  input: CreateLoopInput,
  createdAt = new Date().toISOString(),
  createId: IdGenerator = () => createEntityId('loop'),
): Loop | null {
  const normalized = normalizeLoopInput(snapshot, input);
  if (!normalized) {
    return null;
  }

  const loop: Loop = {
    id: uniqueLoopId(snapshot, normalized.name, createdAt, createId),
    name: normalized.name,
    enabled: normalized.enabled,
    source: normalized.source,
    action: normalized.action,
    instructions: normalized.instructions,
    executionLog: [],
    createdAt,
    updatedAt: createdAt,
  };

  snapshot.loops.push(loop);
  return loop;
}

export function updateLoopInSnapshot(
  snapshot: AppSnapshot,
  input: UpdateLoopInput,
  updatedAt = new Date().toISOString(),
): Loop | null {
  const loop = snapshot.loops.find((candidate) => candidate.id === input.id);
  const normalized = normalizeLoopInput(snapshot, input);
  if (!loop || !normalized) {
    return null;
  }

  loop.name = normalized.name;
  loop.enabled = normalized.enabled;
  loop.source = normalized.source;
  loop.action = normalized.action;
  loop.instructions = normalized.instructions;
  loop.updatedAt = updatedAt;
  delete loop.lastError;

  return loop;
}

export function deleteLoopFromSnapshot(snapshot: AppSnapshot, loopId: string): Loop | null {
  const loop = snapshot.loops.find((candidate) => candidate.id === loopId);
  if (!loop) {
    return null;
  }

  snapshot.loops = snapshot.loops.filter((candidate) => candidate.id !== loopId);
  return loop;
}

export function clearLoopExecutionHistoryInSnapshot(
  snapshot: AppSnapshot,
  loopId: string,
  updatedAt = new Date().toISOString(),
): Loop | null {
  const loop = snapshot.loops.find((candidate) => candidate.id === loopId);
  if (!loop) {
    return null;
  }

  loop.executionLog = [];
  loop.updatedAt = updatedAt;
  return loop;
}

export function recordLoopExecutionInSnapshot(
  snapshot: AppSnapshot,
  loopId: string,
  entry: LoopExecutionLogEntry,
): Loop | null {
  const loop = snapshot.loops.find((candidate) => candidate.id === loopId);
  if (!loop || entry.loopId !== loopId) {
    return null;
  }

  loop.executionLog = [
    cloneLoopExecutionEntry(entry),
    ...(loop.executionLog ?? []).filter((candidate) => candidate.id !== entry.id),
  ].slice(0, MAX_LOOP_EXECUTION_LOG_ENTRIES);
  loop.lastRunAt = entry.startedAt;
  loop.lastCreatedCount = entry.createdCount;
  loop.updatedAt = entry.completedAt;
  if (entry.status === 'failed' && entry.error) {
    loop.lastError = entry.error;
  } else {
    delete loop.lastError;
  }

  return loop;
}

export function updateLoopExecutionAgentConversationInSnapshot(
  snapshot: AppSnapshot,
  loopId: string,
  executionId: string,
  agentId: string,
  update: LoopExecutionConversationUpdate,
): Loop | null {
  const loop = snapshot.loops.find((candidate) => candidate.id === loopId);
  const execution = loop?.executionLog?.find((candidate) => candidate.id === executionId);
  const createdAgent = execution?.createdAgents.find((candidate) => candidate.agentId === agentId);
  if (!loop || !execution || !createdAgent) {
    return null;
  }

  createdAgent.conversationId = update.conversationId;
  if (update.turnId) {
    createdAgent.turnId = update.turnId;
  } else {
    delete createdAgent.turnId;
  }
  loop.updatedAt = update.updatedAt;

  return loop;
}

function normalizeLoopInput(snapshot: AppSnapshot, input: CreateLoopInput): Omit<Loop, 'createdAt' | 'id' | 'lastCreatedCount' | 'lastError' | 'lastRunAt' | 'updatedAt'> | null {
  const source = normalizeLoopSource(input.source);
  const action = normalizeLoopAction(snapshot, input.action);
  if (!source || !action) {
    return null;
  }

  const name = input.name?.trim() || defaultLoopName(source);
  return {
    name,
    enabled: input.enabled !== false,
    source,
    action,
    instructions: normalizeLoopInstructions(input.instructions),
    executionLog: [],
  };
}

function cloneLoopExecutionEntry(entry: LoopExecutionLogEntry): LoopExecutionLogEntry {
  return {
    ...entry,
    createdAgents: entry.createdAgents.map((createdAgent) => ({ ...createdAgent })),
  };
}

function normalizeLoopSource(source: LoopSourceConfiguration): LoopSourceConfiguration | null {
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

function normalizeLoopInstructions(instructions: CreateLoopInput['instructions']): Loop['instructions'] {
  const assignment = instructions?.assignment?.trim();
  const beforeCompletion = instructions?.beforeCompletion?.trim();
  return {
    ...(assignment ? { assignment } : {}),
    ...(beforeCompletion ? { beforeCompletion } : {}),
  };
}

function normalizeLoopAction(snapshot: AppSnapshot, action: LoopAction): LoopAction | null {
  if (action.type !== 'create-agent-from-bench') {
    return null;
  }

  const benchTemplateId = action.benchTemplateId.trim();
  const teamTarget = normalizeTeamTarget(snapshot, action.teamTarget);
  if (!benchTemplateId || !snapshot.bench.some((template) => template.id === benchTemplateId) || !teamTarget) {
    return null;
  }

  return {
    type: 'create-agent-from-bench',
    benchTemplateId,
    teamTarget,
    cleanup: normalizeLoopCleanup(action.cleanup, teamTarget),
  };
}

function normalizeLoopCleanup(cleanup: LoopAction['cleanup'] | undefined, teamTarget: LoopTeamTarget): LoopAction['cleanup'] {
  if (teamTarget.mode === 'dedicated') {
    return {
      deleteTeam: cleanup?.deleteTeam !== false,
    };
  }

  return {
    deleteAgent: cleanup?.deleteAgent !== false,
  };
}

function normalizeTeamTarget(snapshot: AppSnapshot, target: LoopTeamTarget): LoopTeamTarget | null {
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

function defaultLoopName(source: LoopSourceConfiguration): string {
  if (source.provider === 'github') {
    const filters = [source.assigneeLogin, source.tagName].filter(Boolean);
    return filters.length > 0 ? `${source.repositoryId} / ${filters.join(' / ')}` : source.repositoryId;
  }
  return 'Loop';
}

function uniqueLoopId(snapshot: AppSnapshot, name: string, createdAt: string, createId: IdGenerator): string {
  const generated = createId();
  if (generated && !snapshot.loops.some((loop) => loop.id === generated)) {
    return generated;
  }

  const baseId = `loop-${slug(name)}-${createdAt.replace(/\W/g, '').toLowerCase()}`;
  if (!snapshot.loops.some((loop) => loop.id === baseId)) {
    return baseId;
  }

  let counter = 2;
  while (snapshot.loops.some((loop) => loop.id === `${baseId}-${counter}`)) {
    counter += 1;
  }
  return `${baseId}-${counter}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'loop';
}
