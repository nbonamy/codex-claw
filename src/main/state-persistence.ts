import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Agent, AppSnapshot, BenchTemplate, Team } from '../shared/contracts';
import { createEmptySnapshot } from '../shared/snapshot';

type PersistedState = {
  teams: Team[];
  agents: Agent[];
  bench: BenchTemplate[];
  activeAgentId: string | null;
  theme: AppSnapshot['theme'];
};

export class AppStatePersistence {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSnapshot> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      return snapshotFromPersistedState(parsed);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return createEmptySnapshot();
      }
      throw error;
    }
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    const persisted = persistedStateFromSnapshot(snapshot);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  }
}

export function persistedStateFromSnapshot(snapshot: AppSnapshot): PersistedState {
  return {
    teams: snapshot.teams.map((team) => ({ ...team, agentIds: [...team.agentIds] })),
    agents: snapshot.agents.map((agent) => ({ ...agent })),
    bench: snapshot.bench.map((template) => ({ ...template })),
    activeAgentId: snapshot.activeAgentId,
    theme: { ...snapshot.theme },
  };
}

export function snapshotFromPersistedState(value: unknown): AppSnapshot {
  const seed = createEmptySnapshot();
  if (!isRecord(value)) {
    return seed;
  }

  const agents = Array.isArray(value.agents)
    ? value.agents.map(sanitizeAgent).filter((agent): agent is Agent => Boolean(agent))
    : [];
  const teams = Array.isArray(value.teams)
    ? value.teams.map((team) => sanitizeTeam(team, agents)).filter((team): team is Team => Boolean(team))
    : seed.teams;
  const snapshot: AppSnapshot = {
    ...seed,
    teams: teams.length > 0 ? teams : seed.teams,
    agents,
    bench: Array.isArray(value.bench)
      ? value.bench.map(sanitizeBenchTemplate).filter((template): template is BenchTemplate => Boolean(template))
      : seed.bench,
    activeAgentId: typeof value.activeAgentId === 'string' ? value.activeAgentId : null,
    theme: isRecord(value.theme) && typeof value.theme.id === 'string' ? { id: value.theme.id } : seed.theme,
    messages: [],
    appServer: seed.appServer,
  };

  repairTeamMembership(snapshot);
  if (!snapshot.activeAgentId || !snapshot.agents.some((agent) => agent.id === snapshot.activeAgentId)) {
    snapshot.activeAgentId = snapshot.agents[0]?.id ?? null;
  }

  return snapshot;
}

function sanitizeAgent(value: unknown): Agent | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.folder !== 'string') {
    return null;
  }

  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString();
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt;
  return {
    id: value.id,
    teamId: typeof value.teamId === 'string' ? value.teamId : undefined,
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
    folder: value.folder,
    codexThreadId: typeof value.codexThreadId === 'string' ? value.codexThreadId : undefined,
    status: { type: 'idle' },
    createdAt,
    updatedAt,
  };
}

function sanitizeTeam(value: unknown, agents: Agent[]): Team | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }

  const agentIds = Array.isArray(value.agentIds)
    ? value.agentIds.filter((agentId): agentId is string => typeof agentId === 'string' && agents.some((agent) => agent.id === agentId))
    : [];

  return {
    id: value.id,
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
    color: typeof value.color === 'string' ? value.color : undefined,
    agentIds,
    activeAgentId: typeof value.activeAgentId === 'string' && agentIds.includes(value.activeAgentId)
      ? value.activeAgentId
      : undefined,
  };
}

function sanitizeBenchTemplate(value: unknown): BenchTemplate | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.folder !== 'string' ||
    value.backend !== 'codex' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
    folder: value.folder,
    backend: 'codex',
    codexDefaults: isRecord(value.codexDefaults) ? {
      model: typeof value.codexDefaults.model === 'string' ? value.codexDefaults.model : undefined,
      approvalPolicy: typeof value.codexDefaults.approvalPolicy === 'string' ? value.codexDefaults.approvalPolicy : undefined,
      sandboxMode: typeof value.codexDefaults.sandboxMode === 'string' ? value.codexDefaults.sandboxMode : undefined,
    } : undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function repairTeamMembership(snapshot: AppSnapshot): void {
  const firstTeam = snapshot.teams[0];
  if (!firstTeam) {
    return;
  }

  for (const agent of snapshot.agents) {
    const team = snapshot.teams.find((candidate) => candidate.id === agent.teamId) ?? firstTeam;
    agent.teamId = team.id;
    if (!team.agentIds.includes(agent.id)) {
      team.agentIds.push(agent.id);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
