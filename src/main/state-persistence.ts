import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AccountRateLimits, Agent, AgentBackend, AgentContextUsage, AppGeneralSettings, AppSnapshot, BackendDefaults, BackendSession, BenchTemplate, Loop, LoopAction, LoopExecutionCreatedAgent, LoopExecutionLogEntry, LoopExecutionStatus, LoopSourceConfiguration, LoopTeamTarget, SourceFolderState, Team, ThreadGoal, ThreadPlan, ThreadPlanStep, WorkBacklogAssignment, WorkBacklogState, WorkIntegrationConnection, WorkIntegrationStatus, WorkProviderKind, WorkProviderSettings } from '../shared/contracts';
import { isCodexApprovalPreset, isCodexApprovalsReviewer } from '../shared/codex-approval-presets';
import { normalizeGeneralSettings, normalizeSourceFolderState, normalizeThemeSettings } from '../shared/settings';
import { createEmptySnapshot } from '../shared/snapshot';
import { workItemAssignmentKey } from '../shared/work-assignments';
import { defaultTeamColor } from '../shared/team-colors';

type PersistedState = {
  teams: Team[];
  agents: PersistedAgent[];
  bench: BenchTemplate[];
  loops?: Loop[];
  activeTeamId: string | null;
  activeAgentId: string | null;
  accountRateLimits?: AccountRateLimits;
  workBacklog?: WorkBacklogState;
  general?: AppGeneralSettings;
  sourceFolder?: SourceFolderState;
  theme: AppSnapshot['theme'];
};

type PersistedAgent = Pick<Agent, 'id' | 'name' | 'folder' | 'createdAt' | 'updatedAt'> & {
  avatar?: string;
  backend: AgentBackend;
  backendSession?: BackendSession;
  backendDefaults?: BackendDefaults;
  contextUsage?: AgentContextUsage;
  plan?: ThreadPlan;
  goal?: ThreadGoal;
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
    loops: snapshot.loops.map(cloneLoop),
    activeTeamId: snapshot.activeTeamId,
    activeAgentId: snapshot.activeAgentId,
    ...(snapshot.accountRateLimits ? { accountRateLimits: { ...snapshot.accountRateLimits } } : {}),
    workBacklog: cloneWorkBacklogState(snapshot.workBacklog),
    general: { ...snapshot.general },
    sourceFolder: {
      ...snapshot.sourceFolder,
      recentRepoNames: [...snapshot.sourceFolder.recentRepoNames],
    },
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
    ...(agent.plan ? { plan: cloneThreadPlan(agent.plan) } : {}),
    ...(agent.goal ? { goal: { ...agent.goal } } : {}),
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
  const workBacklog = sanitizeWorkBacklogState(value.workBacklog, seed.workBacklog);
  workBacklog.assignments = {
    ...legacyWorkBacklogAssignments(value.agents, agents),
    ...workBacklog.assignments,
  };
  const snapshot: AppSnapshot = {
    ...seed,
    teams: teams.length > 0 ? teams : seed.teams,
    agents,
    bench: Array.isArray(value.bench)
      ? value.bench.map(sanitizeBenchTemplate).filter((template): template is BenchTemplate => Boolean(template))
      : seed.bench,
    loops: Array.isArray(value.loops)
      ? value.loops.map(sanitizeLoop).filter((loop): loop is Loop => Boolean(loop))
      : seed.loops,
    activeTeamId: typeof value.activeTeamId === 'string' ? value.activeTeamId : null,
    activeAgentId: typeof value.activeAgentId === 'string' ? value.activeAgentId : null,
    ...(accountRateLimits ? { accountRateLimits } : {}),
    workBacklog,
    general: normalizeGeneralSettings(value.general),
    sourceFolder: normalizeSourceFolderState(value.sourceFolder),
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
  const plan = sanitizeThreadPlan(value.plan);
  const goal = sanitizeThreadGoal(value.goal);
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
    ...(plan ? { plan } : {}),
    ...(goal ? { goal } : {}),
    ...(typeof value.statusText === 'string' ? { statusText: value.statusText } : {}),
    status: { type: 'idle' },
    createdAt,
    updatedAt,
  };
}

function sanitizeThreadPlan(value: unknown): ThreadPlan | undefined {
  if (
    !isRecord(value) ||
    typeof value.threadId !== 'string' ||
    typeof value.turnId !== 'string' ||
    typeof value.explanation !== 'string' ||
    typeof value.markdown !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !Array.isArray(value.steps)
  ) {
    return undefined;
  }

  const steps = value.steps.map(sanitizeThreadPlanStep).filter((step): step is ThreadPlanStep => Boolean(step));
  if (!value.markdown.trim() && !value.explanation.trim() && steps.length === 0) {
    return undefined;
  }

  return {
    threadId: value.threadId,
    turnId: value.turnId,
    explanation: value.explanation,
    steps,
    markdown: value.markdown,
    updatedAt: value.updatedAt,
  };
}

function sanitizeThreadPlanStep(value: unknown): ThreadPlanStep | null {
  if (!isRecord(value) || typeof value.step !== 'string' || !isThreadPlanStepStatus(value.status)) {
    return null;
  }

  return {
    step: value.step,
    status: value.status,
  };
}

function isThreadPlanStepStatus(value: unknown): value is ThreadPlanStep['status'] {
  return value === 'pending' || value === 'inProgress' || value === 'completed';
}

function sanitizeThreadGoal(value: unknown): ThreadGoal | undefined {
  if (
    !isRecord(value) ||
    typeof value.threadId !== 'string' ||
    typeof value.objective !== 'string' ||
    !isThreadGoalStatus(value.status) ||
    (value.tokenBudget !== null && typeof value.tokenBudget !== 'number') ||
    typeof value.tokensUsed !== 'number' ||
    typeof value.timeUsedSeconds !== 'number' ||
    typeof value.createdAt !== 'number' ||
    typeof value.updatedAt !== 'number'
  ) {
    return undefined;
  }

  return {
    threadId: value.threadId,
    objective: value.objective,
    status: value.status,
    tokenBudget: value.tokenBudget,
    tokensUsed: value.tokensUsed,
    timeUsedSeconds: value.timeUsedSeconds,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
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

function cloneWorkBacklogState(state: WorkBacklogState): WorkBacklogState {
  return {
    connections: state.connections.map((connection) => ({ ...connection })),
    providerConfigurations: cloneWorkBacklogProviderConfigurations(state.providerConfigurations),
    providerSettings: cloneWorkProviderSettings(state.providerSettings),
    assignments: Object.fromEntries(Object.entries(state.assignments).map(([key, assignment]) => [key, { ...assignment }])),
  };
}

function sanitizeWorkBacklogState(value: unknown, seed: WorkBacklogState): WorkBacklogState {
  if (!isRecord(value)) {
    return cloneWorkBacklogState(seed);
  }

  const connections = Array.isArray(value.connections)
    ? value.connections.map(sanitizeWorkIntegrationConnection).filter((connection): connection is WorkIntegrationConnection => Boolean(connection))
    : [];
  const providers = new Set<WorkProviderKind>();
  const sanitizedConnections: WorkIntegrationConnection[] = [];

  for (const connection of [...connections, ...seed.connections]) {
    if (providers.has(connection.provider)) {
      continue;
    }
    providers.add(connection.provider);
    sanitizedConnections.push(connection);
  }

  return {
    connections: sanitizedConnections,
    providerConfigurations: sanitizeWorkBacklogProviderConfigurations(value.providerConfigurations),
    providerSettings: sanitizeWorkProviderSettings(value.providerSettings),
    assignments: sanitizeWorkBacklogAssignments(value.assignments),
  };
}

function sanitizeWorkBacklogAssignments(value: unknown): WorkBacklogState['assignments'] {
  if (!isRecord(value)) {
    return {};
  }

  const assignments: WorkBacklogState['assignments'] = {};
  for (const assignment of Object.values(value)) {
    const sanitized = sanitizeWorkBacklogAssignment(assignment);
    if (sanitized) {
      assignments[workItemAssignmentKey({ provider: sanitized.provider, itemId: sanitized.itemId })] = sanitized;
    }
  }
  return assignments;
}

function sanitizeWorkBacklogAssignment(value: unknown): WorkBacklogAssignment | null {
  if (
    !isRecord(value) ||
    !isWorkProvider(value.provider) ||
    typeof value.itemId !== 'string' ||
    typeof value.agentId !== 'string' ||
    typeof value.assignedAt !== 'string'
  ) {
    return null;
  }

  return {
    provider: value.provider,
    itemId: value.itemId,
    agentId: value.agentId,
    assignedAt: value.assignedAt,
    status: isWorkBacklogAssignmentStatus(value.status) ? value.status : 'working',
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
  };
}

function legacyWorkBacklogAssignments(value: unknown, agents: Agent[]): WorkBacklogState['assignments'] {
  if (!Array.isArray(value)) {
    return {};
  }

  const agentIds = new Set(agents.map((agent) => agent.id));
  const assignments: WorkBacklogState['assignments'] = {};
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !agentIds.has(candidate.id) || !Array.isArray(candidate.assignedWorkItems)) {
      continue;
    }

    for (const item of candidate.assignedWorkItems) {
      const assignment = legacyWorkBacklogAssignment(candidate.id, item);
      if (assignment) {
        const key = workItemAssignmentKey({ provider: assignment.provider, itemId: assignment.itemId });
        if (!assignments[key]) {
          assignments[key] = assignment;
        }
      }
    }
  }
  return assignments;
}

function legacyWorkBacklogAssignment(agentId: string, value: unknown): WorkBacklogAssignment | null {
  if (
    !isRecord(value) ||
    !isWorkProvider(value.provider) ||
    typeof value.id !== 'string' ||
    typeof value.assignedAt !== 'string'
  ) {
    return null;
  }

  return {
    provider: value.provider,
    itemId: value.id,
    agentId,
    assignedAt: value.assignedAt,
    status: 'working',
  };
}

function sanitizeWorkIntegrationConnection(value: unknown): WorkIntegrationConnection | null {
  if (!isRecord(value) || !isWorkProvider(value.provider) || !isWorkIntegrationStatus(value.status)) {
    return null;
  }

  return {
    provider: value.provider,
    status: value.status,
    ...(typeof value.accountLabel === 'string' ? { accountLabel: value.accountLabel } : {}),
    ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
    ...(typeof value.connectedAt === 'string' ? { connectedAt: value.connectedAt } : {}),
  };
}

function cloneWorkBacklogProviderConfigurations(value: WorkBacklogState['providerConfigurations']): WorkBacklogState['providerConfigurations'] {
  return {
    ...(value.github ? { github: { ...value.github } } : {}),
  };
}

function sanitizeWorkBacklogProviderConfigurations(value: unknown): WorkBacklogState['providerConfigurations'] {
  if (!isRecord(value)) {
    return {};
  }

  const github = sanitizeGitHubWorkBacklogConfiguration(value.github);
  return {
    ...(github ? { github } : {}),
  };
}

function sanitizeGitHubWorkBacklogConfiguration(value: unknown): WorkBacklogState['providerConfigurations']['github'] | null {
  if (!isRecord(value)) {
    return null;
  }

  const repositoryId = optionalTrimmedString(value.repositoryId);
  if (!repositoryId) {
    return null;
  }
  const tagName = optionalTrimmedString(value.tagName);

  return {
    repositoryId,
    ...(tagName ? { tagName } : {}),
  };
}

function cloneWorkProviderSettings(value: WorkBacklogState['providerSettings']): WorkBacklogState['providerSettings'] {
  return {
    ...(value.github ? { github: { ...value.github } } : {}),
  };
}

function sanitizeWorkProviderSettings(value: unknown): WorkBacklogState['providerSettings'] {
  if (!isRecord(value)) {
    return {};
  }

  const github = sanitizeWorkProviderSetting(value.github);
  return {
    ...(github ? { github } : {}),
  };
}

function sanitizeWorkProviderSetting(value: unknown): WorkProviderSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const oauthClientId = optionalTrimmedString(value.oauthClientId) ?? '';
  return oauthClientId ? { oauthClientId } : null;
}

function cloneLoop(loop: Loop): Loop {
  return {
    ...loop,
    source: { ...loop.source },
    action: cloneLoopAction(loop.action),
    processedWorkItemIds: [...(loop.processedWorkItemIds ?? [])],
    executionLog: (loop.executionLog ?? []).map(cloneLoopExecutionEntry),
  };
}

function cloneLoopExecutionEntry(entry: LoopExecutionLogEntry): LoopExecutionLogEntry {
  return {
    ...entry,
    createdAgents: entry.createdAgents.map((createdAgent) => ({ ...createdAgent })),
  };
}

function cloneLoopAction(action: LoopAction): LoopAction {
  if (action.type === 'create-agent-from-bench') {
    return {
      type: action.type,
      benchTemplateId: action.benchTemplateId,
      teamTarget: { ...action.teamTarget },
    };
  }
  return action;
}

function sanitizeLoop(value: unknown): Loop | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  const source = sanitizeLoopSource(value.source);
  const action = sanitizeLoopAction(value.action);
  if (!source || !action) {
    return null;
  }

  const lastCreatedCount = typeof value.lastCreatedCount === 'number' && Number.isFinite(value.lastCreatedCount)
    ? Math.max(0, Math.floor(value.lastCreatedCount))
    : undefined;
  const loopId = value.id;
  const executionLog = Array.isArray(value.executionLog)
    ? value.executionLog.map((entry) => sanitizeLoopExecutionEntry(entry, loopId)).filter((entry): entry is LoopExecutionLogEntry => Boolean(entry))
    : [];
  const processedWorkItemIds = Array.isArray(value.processedWorkItemIds)
    ? [...new Set(value.processedWorkItemIds.filter((itemId): itemId is string => typeof itemId === 'string' && Boolean(itemId.trim())).map((itemId) => itemId.trim()))]
    : [];

  return {
    id: value.id,
    name: value.name.trim() || 'Loop',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    source,
    action,
    processedWorkItemIds,
    executionLog,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.lastRunAt === 'string' ? { lastRunAt: value.lastRunAt } : {}),
    ...(typeof value.lastError === 'string' && value.lastError.trim() ? { lastError: value.lastError } : {}),
    ...(lastCreatedCount !== undefined ? { lastCreatedCount } : {}),
  };
}

function sanitizeLoopExecutionEntry(value: unknown, loopId: string): LoopExecutionLogEntry | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.startedAt !== 'string' ||
    typeof value.completedAt !== 'string' ||
    !isLoopExecutionStatus(value.status) ||
    !Array.isArray(value.createdAgents)
  ) {
    return null;
  }

  const entryLoopId = typeof value.loopId === 'string' && value.loopId.trim() ? value.loopId : loopId;
  if (entryLoopId !== loopId) {
    return null;
  }

  const createdAgents = value.createdAgents
    .map(sanitizeLoopExecutionCreatedAgent)
    .filter((createdAgent): createdAgent is LoopExecutionCreatedAgent => Boolean(createdAgent));
  const createdCount = typeof value.createdCount === 'number' && Number.isFinite(value.createdCount)
    ? Math.max(0, Math.floor(value.createdCount))
    : createdAgents.length;

  return {
    id: value.id,
    loopId,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    status: value.status,
    createdCount,
    createdAgents,
    ...(typeof value.error === 'string' && value.error.trim() ? { error: value.error } : {}),
  };
}

function sanitizeLoopExecutionCreatedAgent(value: unknown): LoopExecutionCreatedAgent | null {
  if (
    !isRecord(value) ||
    typeof value.agentId !== 'string' ||
    typeof value.workItemId !== 'string' ||
    typeof value.workItemTitle !== 'string' ||
    typeof value.workItemUrl !== 'string'
  ) {
    return null;
  }

  return {
    agentId: value.agentId,
    agentName: typeof value.agentName === 'string' && value.agentName.trim() ? value.agentName : value.agentId,
    workItemId: value.workItemId,
    workItemTitle: value.workItemTitle,
    workItemUrl: value.workItemUrl,
    ...(typeof value.conversationId === 'string' && value.conversationId.trim() ? { conversationId: value.conversationId } : {}),
    ...(typeof value.turnId === 'string' && value.turnId.trim() ? { turnId: value.turnId } : {}),
  };
}

function isLoopExecutionStatus(value: unknown): value is LoopExecutionStatus {
  return value === 'completed' || value === 'failed';
}

function sanitizeLoopSource(value: unknown): LoopSourceConfiguration | null {
  if (!isRecord(value) || value.provider !== 'github') {
    return null;
  }

  const repositoryId = optionalTrimmedString(value.repositoryId);
  if (!repositoryId) {
    return null;
  }

  const tagName = optionalTrimmedString(value.tagName);
  return {
    provider: 'github',
    repositoryId,
    ...(tagName ? { tagName } : {}),
  };
}

function sanitizeLoopAction(value: unknown): LoopAction | null {
  if (!isRecord(value) || value.type !== 'create-agent-from-bench') {
    return null;
  }

  const benchTemplateId = optionalTrimmedString(value.benchTemplateId);
  const teamTarget = sanitizeLoopTeamTarget(value.teamTarget);
  if (!benchTemplateId || !teamTarget) {
    return null;
  }

  return {
    type: 'create-agent-from-bench',
    benchTemplateId,
    teamTarget,
  };
}

function sanitizeLoopTeamTarget(value: unknown): LoopTeamTarget | null {
  if (!isRecord(value) || typeof value.mode !== 'string') {
    return null;
  }

  if (value.mode === 'dedicated') {
    return { mode: 'dedicated' };
  }

  if (value.mode === 'existing') {
    const teamId = optionalTrimmedString(value.teamId);
    return teamId ? { mode: 'existing', teamId } : null;
  }

  return null;
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isWorkProvider(value: unknown): value is WorkProviderKind {
  return value === 'github';
}

function isWorkIntegrationStatus(value: unknown): value is WorkIntegrationStatus {
  return value === 'notConfigured' ||
    value === 'disconnected' ||
    value === 'connecting' ||
    value === 'connected' ||
    value === 'error';
}

function isWorkBacklogAssignmentStatus(value: unknown): value is WorkBacklogAssignment['status'] {
  return value === 'working' || value === 'completed';
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

function cloneThreadPlan(plan: ThreadPlan): ThreadPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({ ...step })),
  };
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
      ...(isCodexApprovalPreset(value.approvalPreset) ? { approvalPreset: value.approvalPreset } : {}),
      ...(typeof value.approvalPolicy === 'string' ? { approvalPolicy: value.approvalPolicy } : {}),
      ...(isCodexApprovalsReviewer(value.approvalsReviewer) ? { approvalsReviewer: value.approvalsReviewer } : {}),
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
