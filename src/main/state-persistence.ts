import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AccountRateLimits, Agent, AgentBackend, AgentContextUsage, AppSnapshot, BackendDefaults, BackendSession, BenchTemplate, Team } from '../shared/contracts';
import { normalizeThemeSettings } from '../shared/settings';
import { createEmptySnapshot } from '../shared/snapshot';
import { defaultTeamColor } from '../shared/team-colors';

type PersistedState = {
  teams: Team[];
  agents: PersistedAgent[];
  bench: BenchTemplate[];
  activeTeamId: string | null;
  activeAgentId: string | null;
  accountRateLimits?: AccountRateLimits;
  theme: AppSnapshot['theme'];
};

type PersistedAgent = Pick<Agent, 'id' | 'name' | 'folder' | 'createdAt' | 'updatedAt'> & {
  avatar?: string;
  backend: AgentBackend;
  backendSession?: BackendSession;
  backendDefaults?: BackendDefaults;
  contextUsage?: AgentContextUsage;
  statusText?: string;
  teamId?: string;
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
    agents: snapshot.agents.map(persistedAgentFromSnapshot),
    bench: snapshot.bench.map((template) => ({ ...template })),
    activeTeamId: snapshot.activeTeamId,
    activeAgentId: snapshot.activeAgentId,
    ...(snapshot.accountRateLimits ? { accountRateLimits: { ...snapshot.accountRateLimits } } : {}),
    theme: { ...snapshot.theme },
  };
}

function persistedAgentFromSnapshot(agent: Agent): PersistedAgent {
  return {
    id: agent.id,
    teamId: agent.teamId,
    name: agent.name,
    avatar: agent.avatar,
    folder: agent.folder,
    backend: agent.backend,
    ...(agent.backendSession ? { backendSession: cloneBackendSession(agent.backendSession) } : {}),
    ...(agent.backendDefaults ? { backendDefaults: cloneBackendDefaults(agent.backendDefaults) } : {}),
    ...(agent.contextUsage ? { contextUsage: { ...agent.contextUsage } } : {}),
    statusText: agent.statusText,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
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
  const accountRateLimits = sanitizeAccountRateLimits(value.accountRateLimits);
  const snapshot: AppSnapshot = {
    ...seed,
    teams: teams.length > 0 ? teams : seed.teams,
    agents,
    bench: Array.isArray(value.bench)
      ? value.bench.map(sanitizeBenchTemplate).filter((template): template is BenchTemplate => Boolean(template))
      : seed.bench,
    activeTeamId: typeof value.activeTeamId === 'string' ? value.activeTeamId : null,
    activeAgentId: typeof value.activeAgentId === 'string' ? value.activeAgentId : null,
    ...(accountRateLimits ? { accountRateLimits } : {}),
    theme: normalizeThemeSettings(value.theme),
    messages: [],
    backendRuntimes: seed.backendRuntimes.map((runtime) => ({ ...runtime })),
  };

  repairTeamMembership(snapshot);
  if (!snapshot.activeAgentId || !snapshot.agents.some((agent) => agent.id === snapshot.activeAgentId)) {
    snapshot.activeAgentId = snapshot.agents[0]?.id ?? null;
  }
  snapshot.activeTeamId = repairedActiveTeamId(snapshot);

  return snapshot;
}

function sanitizeAgent(value: unknown): Agent | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.folder !== 'string') {
    return null;
  }

  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString();
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt;
  const contextUsage = sanitizeContextUsage(value.contextUsage);
  const backend = sanitizeBackend(value.backend) ?? 'codex';
  const backendSession = sanitizeBackendSession(value.backendSession, backend);
  const backendDefaults = sanitizeBackendDefaults(value.backendDefaults, backend);
  return {
    id: value.id,
    teamId: typeof value.teamId === 'string' ? value.teamId : undefined,
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
    folder: value.folder,
    backend,
    ...(backendSession ? { backendSession } : {}),
    ...(backendDefaults ? { backendDefaults } : {}),
    ...(contextUsage ? { contextUsage } : {}),
    ...(typeof value.statusText === 'string' ? { statusText: value.statusText } : {}),
    status: { type: 'idle' },
    createdAt,
    updatedAt,
  };
}

function sanitizeContextUsage(value: unknown): AgentContextUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.totalTokens !== 'number' ||
    typeof value.inputTokens !== 'number' ||
    typeof value.cachedInputTokens !== 'number' ||
    typeof value.outputTokens !== 'number' ||
    typeof value.reasoningOutputTokens !== 'number' ||
    typeof value.lastTotalTokens !== 'number'
  ) {
    return undefined;
  }

  const modelContextWindow = nullableNumber(value.modelContextWindow);
  const usedPercent = nullableNumber(value.usedPercent);
  if (modelContextWindow === undefined || usedPercent === undefined) {
    return undefined;
  }

  return {
    totalTokens: value.totalTokens,
    inputTokens: value.inputTokens,
    cachedInputTokens: value.cachedInputTokens,
    outputTokens: value.outputTokens,
    reasoningOutputTokens: value.reasoningOutputTokens,
    lastTotalTokens: value.lastTotalTokens,
    modelContextWindow,
    usedPercent,
  };
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'number' ? value : undefined;
}

function sanitizeAccountRateLimits(value: unknown): AccountRateLimits | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    limitId: nullableString(value.limitId),
    limitName: nullableString(value.limitName),
    primary: sanitizeAccountRateLimitWindow(value.primary),
    secondary: sanitizeAccountRateLimitWindow(value.secondary),
    credits: value.credits ?? null,
    individualLimit: value.individualLimit ?? null,
    planType: nullableString(value.planType),
    rateLimitReachedType: nullableString(value.rateLimitReachedType),
  };
}

function sanitizeAccountRateLimitWindow(value: unknown): AccountRateLimits['primary'] {
  if (!isRecord(value) || typeof value.usedPercent !== 'number') {
    return null;
  }

  return {
    usedPercent: value.usedPercent,
    windowDurationMins: typeof value.windowDurationMins === 'number' ? value.windowDurationMins : null,
    resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
    color: typeof value.color === 'string' ? value.color : defaultTeamColor,
    agentIds,
    activeAgentId: typeof value.activeAgentId === 'string' && agentIds.includes(value.activeAgentId)
      ? value.activeAgentId
      : undefined,
  };
}

function sanitizeBenchTemplate(value: unknown): BenchTemplate | null {
  const backend = isRecord(value) ? sanitizeBackend(value.backend) : null;
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.folder !== 'string' ||
    !backend ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  const backendDefaults = sanitizeBackendDefaults(value.backendDefaults, backend);
  return {
    id: value.id,
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
    folder: value.folder,
    backend,
    ...(backendDefaults ? { backendDefaults } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function cloneBackendSession(session: BackendSession): BackendSession {
  return { ...session };
}

function cloneBackendDefaults(defaults: BackendDefaults): BackendDefaults {
  return defaults.kind === 'claude' && defaults.thinking
    ? { ...defaults, thinking: { ...defaults.thinking } }
    : { ...defaults };
}

function sanitizeBackend(value: unknown): AgentBackend | null {
  return value === 'codex' || value === 'claude' ? value : null;
}

function sanitizeBackendSession(value: unknown, expectedBackend: AgentBackend): BackendSession | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return undefined;
  }

  if (value.kind === 'codex') {
    const session = typeof value.threadId === 'string'
      ? { kind: 'codex' as const, threadId: value.threadId }
      : undefined;
    return session?.kind === expectedBackend ? session : undefined;
  }

  if (value.kind === 'claude') {
    if (
      typeof value.sessionId !== 'string' ||
      (value.transport !== 'stdio' && value.transport !== 'websocket')
    ) {
      return undefined;
    }

    const session = {
      kind: 'claude',
      sessionId: value.sessionId,
      transport: value.transport,
      ...(typeof value.transcriptSessionId === 'string' ? { transcriptSessionId: value.transcriptSessionId } : {}),
      ...(typeof value.serverUrl === 'string' ? { serverUrl: value.serverUrl } : {}),
    } satisfies BackendSession;
    return session.kind === expectedBackend ? session : undefined;
  }

  return undefined;
}

function sanitizeBackendDefaults(value: unknown, expectedBackend: AgentBackend): BackendDefaults | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return undefined;
  }

  if (value.kind === 'codex') {
    const defaults = {
      kind: 'codex',
      ...(typeof value.model === 'string' ? { model: value.model } : {}),
      ...(typeof value.approvalPolicy === 'string' ? { approvalPolicy: value.approvalPolicy } : {}),
      ...(typeof value.sandboxMode === 'string' ? { sandboxMode: value.sandboxMode } : {}),
      ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
    } satisfies BackendDefaults;
    return defaults.kind === expectedBackend ? defaults : undefined;
  }

  if (value.kind === 'claude') {
    const thinking = sanitizeClaudeThinking(value.thinking);
    const defaults = {
      kind: 'claude',
      ...(typeof value.model === 'string' ? { model: value.model } : {}),
      ...(typeof value.permissionMode === 'string' ? { permissionMode: value.permissionMode } : {}),
      ...(thinking ? { thinking } : {}),
    } satisfies BackendDefaults;
    return defaults.kind === expectedBackend ? defaults : undefined;
  }

  return undefined;
}

function sanitizeClaudeThinking(value: unknown): Extract<BackendDefaults, { kind: 'claude' }>['thinking'] | undefined {
  if (!isRecord(value) || (value.type !== 'enabled' && value.type !== 'disabled')) {
    return undefined;
  }

  return {
    type: value.type,
    ...(typeof value.budgetTokens === 'number' ? { budgetTokens: value.budgetTokens } : {}),
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

function repairedActiveTeamId(snapshot: AppSnapshot): string | null {
  if (snapshot.activeTeamId && snapshot.teams.some((team) => team.id === snapshot.activeTeamId)) {
    return snapshot.activeTeamId;
  }

  const activeAgent = snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId);
  if (activeAgent?.teamId && snapshot.teams.some((team) => team.id === activeAgent.teamId)) {
    return activeAgent.teamId;
  }

  return snapshot.teams[0]?.id ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
