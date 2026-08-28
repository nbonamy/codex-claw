import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AccountRateLimits, Agent, AgentBackend, AgentContextUsage, AgentSubagentTree, AgentWorkspaceIdentity, AppGeneralSettings, AppSnapshot, BackendDefaults, BackendSession, BenchTemplate, Loop, LoopAction, LoopExecutionCreatedAgent, LoopExecutionLogEntry, LoopExecutionStatus, LoopSourceConfiguration, LoopTeamTarget, OpenInApplication, RemoteConnection, RemoteConnectionStatus, RemoteConnectionTransport, RemoteConnectionsState, SourceFolderState, SubagentActivity, SubagentNode, SubagentOperation, SubagentStatus, Team, ThreadGoal, ThreadPlan, ThreadPlanKind, ThreadPlanStatus, ThreadPlanStep, WorkBacklogAssignment, WorkBacklogState, WorkIntegrationConnection, WorkIntegrationStatus, WorkProviderKind, WorkProviderSettings } from '@codex-claw/core/contracts';
import { isCodexApprovalPreset, isCodexApprovalsReviewer } from '@codex-claw/core/codex-approval-presets';
import { normalizeGeneralSettings, normalizeSourceFolderState, normalizeThemeSettings } from '@codex-claw/core/settings';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { defaultTeamColor } from '@codex-claw/core/team-colors';

type PersistedState = {
  teams: Team[];
  agents: PersistedAgent[];
  bench: BenchTemplate[];
  loops?: Loop[];
  activeTeamId: string | null;
  activeAgentId: string | null;
  accountRateLimits?: AccountRateLimits;
  subagentTrees?: Record<string, AgentSubagentTree>;
  workBacklog?: WorkBacklogState;
  remoteConnections?: RemoteConnectionsState;
  general?: AppGeneralSettings;
  sourceFolder?: SourceFolderState;
  theme: AppSnapshot['theme'];
};

type PersistedAgent = Pick<Agent, 'id' | 'name' | 'folder' | 'createdAt' | 'updatedAt'> & {
  avatar?: string;
  backend: AgentBackend;
  backendSession?: BackendSession;
  backendDefaults?: BackendDefaults;
  openInApplication?: OpenInApplication;
  workspace?: AgentWorkspaceIdentity;
  contextUsage?: AgentContextUsage;
  plan?: ThreadPlan;
  goal?: ThreadGoal;
  statusText?: string;
  teamId?: string;
};

export class AppStatePersistence {
  private pendingSerialized: string | null = null;
  private pendingWaiters: Array<{ resolve(): void; reject(error: unknown): void }> = [];
  private writeInFlight = false;
  private lastSerialized: string | null = null;

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

  save(snapshot: AppSnapshot): Promise<void> {
    const persisted = persistedStateFromSnapshot(snapshot);
    const serialized = `${JSON.stringify(persisted, null, 2)}\n`;
    if (!this.writeInFlight && this.pendingSerialized === null && serialized === this.lastSerialized) {
      return Promise.resolve();
    }

    this.pendingSerialized = serialized;
    const operation = new Promise<void>((resolve, reject) => {
      this.pendingWaiters.push({ resolve, reject });
    });
    void this.flushPendingSaves();
    return operation;
  }

  private async flushPendingSaves(): Promise<void> {
    if (this.writeInFlight) {
      return;
    }

    this.writeInFlight = true;
    try {
      while (this.pendingSerialized !== null) {
        const serialized = this.pendingSerialized;
        this.pendingSerialized = null;
        const waiters = this.pendingWaiters.splice(0);
        try {
          await this.writeAtomically(serialized);
          this.lastSerialized = serialized;
          for (const waiter of waiters) waiter.resolve();
        } catch (error) {
          for (const waiter of waiters) waiter.reject(error);
        }
      }
    } finally {
      this.writeInFlight = false;
      if (this.pendingSerialized !== null) {
        void this.flushPendingSaves();
      }
    }
  }

  private async writeAtomically(serialized: string): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    } finally {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
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
    subagentTrees: cloneSubagentTrees(snapshot.subagentTrees),
    workBacklog: cloneWorkBacklogState(snapshot.workBacklog),
    remoteConnections: cloneRemoteConnectionsState(snapshot.remoteConnections),
    general: {
      ...snapshot.general,
      plugins: snapshot.general.plugins ? { ...snapshot.general.plugins } : undefined,
    },
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
    ...(agent.workspace ? { workspace: { ...agent.workspace } } : {}),
    backend: agent.backend,
    ...(agent.backendSession ? { backendSession: cloneBackendSession(agent.backendSession) } : {}),
    ...(agent.backendDefaults ? { backendDefaults: cloneBackendDefaults(agent.backendDefaults) } : {}),
    ...(agent.openInApplication ? { openInApplication: agent.openInApplication } : {}),
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

  const accountRateLimits = sanitizeAccountRateLimits(value.accountRateLimits);
  const workBacklog = sanitizeWorkBacklogState(value.workBacklog, seed.workBacklog);
  const remoteConnections = sanitizeRemoteConnectionsState(value.remoteConnections, seed.remoteConnections);
  const remoteConnectionIds = new Set(remoteConnections.connections.map((connection) => connection.id));
  const allAgents = Array.isArray(value.agents)
    ? value.agents.map((agent) => sanitizeAgent(agent)).filter((agent): agent is Agent => Boolean(agent))
    : [];
  const teams = Array.isArray(value.teams)
    ? value.teams.map((team) => sanitizeTeam(team, allAgents, remoteConnectionIds)).filter((team): team is Team => Boolean(team))
    : seed.teams;
  const remotePointerTeamIds = localRemoteTeamPointerIds(teams);
  const agents = allAgents.filter((agent) => !agent.teamId || !remotePointerTeamIds.has(agent.teamId));
  const localAgentIds = new Set(agents.map((agent) => agent.id));
  workBacklog.assignments = assignmentsForAgents({
    ...legacyWorkBacklogAssignments(value.agents, agents),
    ...workBacklog.assignments,
  }, localAgentIds);
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
    subagentTrees: sanitizeSubagentTrees(value.subagentTrees),
    workBacklog,
    remoteConnections,
    general: normalizeGeneralSettings(value.general),
    sourceFolder: normalizeSourceFolderState(value.sourceFolder),
    theme: normalizeThemeSettings(value.theme),
    messages: [],
    queuedPrompts: [],
    backendRuntimes: seed.backendRuntimes.map((runtime) => ({ ...runtime })),
  };

  repairTeamMembership(snapshot);
  if (!snapshot.activeAgentId || !snapshot.agents.some((agent) => agent.id === snapshot.activeAgentId)) {
    snapshot.activeAgentId = snapshot.agents[0]?.id ?? null;
  }
  snapshot.activeTeamId = repairedActiveTeamId(snapshot);

  return snapshot;
}

function cloneSubagentTrees(trees: Record<string, AgentSubagentTree>): Record<string, AgentSubagentTree> {
  return Object.fromEntries(Object.entries(trees).map(([agentId, tree]) => [agentId, {
    rootConversationId: tree.rootConversationId,
    nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, { ...node }])),
    operations: Object.fromEntries(Object.entries(tree.operations).map(([id, operation]) => [id, {
      ...operation,
      receiverConversationIds: [...operation.receiverConversationIds],
    }])),
    activities: Object.fromEntries(Object.entries(tree.activities).map(([id, activity]) => [id, { ...activity }])),
  }]));
}

function sanitizeSubagentTrees(value: unknown): Record<string, AgentSubagentTree> {
  if (!isRecord(value)) return {};
  const trees: Record<string, AgentSubagentTree> = {};
  for (const [agentId, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || typeof candidate.rootConversationId !== 'string') continue;
    const rootConversationId = candidate.rootConversationId;
    const nodes: Record<string, SubagentNode> = {};
    if (isRecord(candidate.nodes)) {
      for (const [id, node] of Object.entries(candidate.nodes)) {
        const sanitized = sanitizeSubagentNode(node);
        if (sanitized && sanitized.conversationId !== rootConversationId) nodes[id] = sanitized;
      }
    }
    const operations: Record<string, SubagentOperation> = {};
    if (isRecord(candidate.operations)) {
      for (const [id, operation] of Object.entries(candidate.operations)) {
        const sanitized = sanitizeSubagentOperation(operation);
        if (sanitized) operations[id] = sanitized;
      }
    }
    const activities: Record<string, SubagentActivity> = {};
    if (isRecord(candidate.activities)) {
      for (const [id, activity] of Object.entries(candidate.activities)) {
        const sanitized = sanitizeSubagentActivity(activity);
        if (sanitized && sanitized.conversationId !== rootConversationId) activities[id] = sanitized;
      }
    }
    trees[agentId] = { rootConversationId, nodes, operations, activities };
  }
  return trees;
}

function sanitizeSubagentNode(value: unknown): SubagentNode | null {
  if (
    !isRecord(value) ||
    typeof value.conversationId !== 'string' ||
    typeof value.parentConversationId !== 'string' ||
    !isSubagentStatus(value.status) ||
    typeof value.updatedAt !== 'string'
  ) return null;
  return {
    conversationId: value.conversationId,
    parentConversationId: value.parentConversationId,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : value.updatedAt,
    status: value.status,
    ...(typeof value.statusMessage === 'string' ? { statusMessage: value.statusMessage } : {}),
    ...(typeof value.agentPath === 'string' ? { agentPath: value.agentPath } : {}),
    ...(typeof value.agentNickname === 'string' ? { agentNickname: value.agentNickname } : {}),
    ...(typeof value.agentRole === 'string' ? { agentRole: value.agentRole } : {}),
    ...(typeof value.prompt === 'string' ? { prompt: value.prompt } : {}),
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
    updatedAt: value.updatedAt,
  };
}

function sanitizeSubagentOperation(value: unknown): SubagentOperation | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isSubagentOperationLifecycle(value.lifecycle) ||
    !isSubagentOperationKind(value.kind) ||
    !isSubagentOperationStatus(value.status) ||
    typeof value.senderConversationId !== 'string' ||
    !Array.isArray(value.receiverConversationIds) ||
    value.receiverConversationIds.some((id) => typeof id !== 'string') ||
    typeof value.occurredAt !== 'string'
  ) return null;
  return {
    id: value.id,
    ...(typeof value.turnId === 'string' ? { turnId: value.turnId } : {}),
    lifecycle: value.lifecycle,
    kind: value.kind,
    status: value.status,
    senderConversationId: value.senderConversationId,
    receiverConversationIds: [...value.receiverConversationIds] as string[],
    ...(typeof value.prompt === 'string' ? { prompt: value.prompt } : {}),
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
    occurredAt: value.occurredAt,
  };
}

function sanitizeSubagentActivity(value: unknown): SubagentActivity | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isSubagentOperationLifecycle(value.lifecycle) ||
    !isSubagentActivityKind(value.kind) ||
    typeof value.conversationId !== 'string' ||
    typeof value.agentPath !== 'string' ||
    typeof value.occurredAt !== 'string'
  ) return null;
  return {
    id: value.id,
    ...(typeof value.turnId === 'string' ? { turnId: value.turnId } : {}),
    lifecycle: value.lifecycle,
    kind: value.kind,
    conversationId: value.conversationId,
    agentPath: value.agentPath,
    occurredAt: value.occurredAt,
  };
}

function isSubagentStatus(value: unknown): value is SubagentStatus {
  return value === 'pendingInit' || value === 'running' || value === 'interrupted' || value === 'completed' ||
    value === 'errored' || value === 'shutdown' || value === 'notFound';
}

function isSubagentOperationLifecycle(value: unknown): value is SubagentOperation['lifecycle'] {
  return value === 'started' || value === 'completed';
}

function isSubagentOperationKind(value: unknown): value is SubagentOperation['kind'] {
  return value === 'spawnAgent' || value === 'sendInput' || value === 'resumeAgent' || value === 'wait' || value === 'closeAgent';
}

function isSubagentOperationStatus(value: unknown): value is SubagentOperation['status'] {
  return value === 'inProgress' || value === 'completed' || value === 'failed';
}

function isSubagentActivityKind(value: unknown): value is SubagentActivity['kind'] {
  return value === 'started' || value === 'interacted' || value === 'interrupted';
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
  const openInApplication = sanitizeOpenInApplication(value.openInApplication);
  const workspace = sanitizeAgentWorkspace(value.workspace);
  return {
    id: value.id,
    teamId: typeof value.teamId === 'string' ? value.teamId : undefined,
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
    folder: value.folder,
    ...(workspace ? { workspace } : {}),
    backend,
    ...(backendSession ? { backendSession } : {}),
    ...(backendDefaults ? { backendDefaults } : {}),
    ...(openInApplication ? { openInApplication } : {}),
    ...(contextUsage ? { contextUsage } : {}),
    ...(plan ? { plan } : {}),
    ...(goal ? { goal } : {}),
    ...(typeof value.statusText === 'string' ? { statusText: value.statusText } : {}),
    status: { type: 'idle' },
    createdAt,
    updatedAt,
  };
}

function sanitizeAgentWorkspace(value: unknown): AgentWorkspaceIdentity | undefined {
  if (!isRecord(value) || typeof value.folder !== 'string' || typeof value.updatedAt !== 'string') {
    return undefined;
  }
  if (value.kind === 'folder' && typeof value.label === 'string') {
    return {
      kind: 'folder',
      folder: value.folder,
      label: value.label,
      updatedAt: value.updatedAt,
    };
  }
  if (
    value.kind === 'git'
    && typeof value.repositoryName === 'string'
    && typeof value.repositoryRoot === 'string'
    && (typeof value.branch === 'string' || value.branch === null)
    && typeof value.isLinkedWorktree === 'boolean'
    && typeof value.primaryWorktreeRoot === 'string'
  ) {
    return {
      kind: 'git',
      folder: value.folder,
      repositoryName: value.repositoryName,
      repositoryRoot: value.repositoryRoot,
      branch: value.branch,
      isLinkedWorktree: value.isLinkedWorktree,
      primaryWorktreeRoot: value.primaryWorktreeRoot,
      updatedAt: value.updatedAt,
    };
  }
  return undefined;
}

function sanitizeOpenInApplication(value: unknown): OpenInApplication | undefined {
  return value === 'vscode' ||
    value === 'finder' ||
    value === 'terminal' ||
    value === 'iterm2' ||
    value === 'ghostty' ||
    value === 'xcode' ||
    value === 'android-studio' ||
    value === 'jetbrains'
    ? value
    : undefined;
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

  const kind = isThreadPlanKind(value.kind)
    ? value.kind
    : (steps.length > 0 || value.explanation.trim() ? 'execution' : 'proposed');
  const status = isThreadPlanStatus(value.status)
    ? value.status
    : legacyThreadPlanStatus(kind, steps);

  return {
    threadId: value.threadId,
    turnId: value.turnId,
    kind,
    status,
    explanation: value.explanation,
    steps,
    markdown: value.markdown,
    updatedAt: value.updatedAt,
  };
}

function isThreadPlanKind(value: unknown): value is ThreadPlanKind {
  return value === 'execution' || value === 'proposed';
}

function isThreadPlanStatus(value: unknown): value is ThreadPlanStatus {
  return value === 'inProgress' || value === 'completed' || value === 'incomplete' || value === 'interrupted' || value === 'failed';
}

function legacyThreadPlanStatus(kind: ThreadPlanKind, steps: ThreadPlanStep[]): ThreadPlanStatus {
  if (kind === 'proposed') return 'completed';
  return steps.length > 0 && steps.every((step) => step.status === 'completed')
    ? 'completed'
    : 'incomplete';
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

function cloneRemoteConnectionsState(state: RemoteConnectionsState): RemoteConnectionsState {
  return {
    connections: state.connections.map((connection) => ({
      ...connection,
      ...(connection.transport ? { transport: cloneRemoteConnectionTransport(connection.transport) } : {}),
    })),
  };
}

function cloneRemoteConnectionTransport(transport: RemoteConnectionTransport): RemoteConnectionTransport {
  return {
    type: transport.type,
    command: transport.command,
    args: [...transport.args],
  };
}

function sanitizeRemoteConnectionsState(value: unknown, seed: RemoteConnectionsState): RemoteConnectionsState {
  if (!isRecord(value) || !Array.isArray(value.connections)) {
    return cloneRemoteConnectionsState(seed);
  }

  const seenIds = new Set<string>();
  const connections: RemoteConnection[] = [];
  for (const item of value.connections) {
    const connection = sanitizeRemoteConnection(item);
    if (!connection || seenIds.has(connection.id)) {
      continue;
    }
    seenIds.add(connection.id);
    connections.push(connection);
  }

  return { connections };
}

function sanitizeRemoteConnection(value: unknown): RemoteConnection | null {
  if (
    !isRecord(value) ||
    value.kind !== 'ssh' ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.host !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  const name = value.name.trim();
  const host = value.host.trim();
  if (!name || !host) {
    return null;
  }

  return {
    id: value.id,
    kind: 'ssh',
    name,
    host,
    ...(typeof value.hostName === 'string' && value.hostName.trim() ? { hostName: value.hostName.trim() } : {}),
    ...(typeof value.user === 'string' && value.user.trim() ? { user: value.user.trim() } : {}),
    ...(sanitizePort(value.port) ? { port: sanitizePort(value.port)! } : {}),
    ...(typeof value.identityFile === 'string' && value.identityFile.trim() ? { identityFile: value.identityFile.trim() } : {}),
    status: isRemoteConnectionStatus(value.status) ? value.status : 'saved',
    ...(typeof value.detail === 'string' && value.detail.trim() ? { detail: value.detail.trim() } : {}),
    ...(typeof value.sourceFolderPath === 'string' && value.sourceFolderPath.trim() ? { sourceFolderPath: value.sourceFolderPath.trim() } : {}),
    ...(sanitizeRemoteConnectionTransport(value.transport) ? { transport: sanitizeRemoteConnectionTransport(value.transport)! } : {}),
    ...(typeof value.installedAt === 'string' ? { installedAt: value.installedAt } : {}),
    ...(typeof value.lastCheckedAt === 'string' ? { lastCheckedAt: value.lastCheckedAt } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function sanitizeRemoteConnectionTransport(value: unknown): RemoteConnectionTransport | null {
  if (!isRecord(value) || value.type !== 'ssh-stdio' || value.command !== 'ssh' || !Array.isArray(value.args)) {
    return null;
  }

  const args = value.args.filter((arg): arg is string => typeof arg === 'string' && arg.trim().length > 0);
  return args.length > 0
    ? {
      type: 'ssh-stdio',
      command: 'ssh',
      args,
    }
    : null;
}

function isRemoteConnectionStatus(value: unknown): value is RemoteConnectionStatus {
  return value === 'saved' || value === 'checking' || value === 'ready' || value === 'error';
}

function sanitizePort(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const port = Math.floor(value);
  return port > 0 && port <= 65535 ? port : null;
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
    policy: value.policy === 'complete' || value.policy === 'review'
      ? value.policy
      : typeof value.loopId === 'string' || typeof value.loopExecutionId === 'string' ? 'complete' : 'review',
    status: value.status === 'working'
      ? 'inProgress'
      : isWorkBacklogAssignmentStatus(value.status) ? value.status : 'inProgress',
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim() } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    ...(typeof value.loopId === 'string' && value.loopId.trim() ? { loopId: value.loopId.trim() } : {}),
    ...(typeof value.loopExecutionId === 'string' && value.loopExecutionId.trim() ? { loopExecutionId: value.loopExecutionId.trim() } : {}),
    ...(typeof value.completionInstructionsDeliveredAt === 'string' ? { completionInstructionsDeliveredAt: value.completionInstructionsDeliveredAt } : {}),
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
    policy: 'review',
    status: 'inProgress',
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
  const assigneeLogin = optionalTrimmedString(value.assigneeLogin);
  const tagName = optionalTrimmedString(value.tagName);

  return {
    repositoryId,
    ...(assigneeLogin ? { assigneeLogin } : {}),
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
    instructions: { ...(loop.instructions ?? {}) },
    executionLog: (loop.executionLog ?? []).map(cloneLoopExecutionEntry),
  };
}

function cloneLoopExecutionEntry(entry: LoopExecutionLogEntry): LoopExecutionLogEntry {
  return {
    ...entry,
    createdAgents: entry.createdAgents.map((createdAgent) => ({
      ...createdAgent,
      ...(createdAgent.conversationRef ? { conversationRef: { ...createdAgent.conversationRef } } : {}),
    })),
  };
}

function cloneLoopAction(action: LoopAction): LoopAction {
  if (action.type === 'create-agent') {
    return {
      type: action.type,
      sourceRepositoryPath: action.sourceRepositoryPath,
      ...(action.backend ? { backend: action.backend } : {}),
      ...(action.backendDefaults ? { backendDefaults: cloneBackendDefaults(action.backendDefaults) } : {}),
      teamTarget: { ...action.teamTarget },
      ...(action.cleanup ? { cleanup: { ...action.cleanup } } : {}),
    };
  }

  if (action.type === 'create-agent-from-bench') {
    return {
      type: action.type,
      benchTemplateId: action.benchTemplateId,
      teamTarget: { ...action.teamTarget },
      ...(action.cleanup ? { cleanup: { ...action.cleanup } } : {}),
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

  return {
    id: value.id,
    name: value.name.trim() || 'Loop',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    source,
    action,
    instructions: sanitizeLoopInstructions(value.instructions),
    executionLog,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.lastRunAt === 'string' ? { lastRunAt: value.lastRunAt } : {}),
    ...(typeof value.lastError === 'string' && value.lastError.trim() ? { lastError: value.lastError } : {}),
    ...(lastCreatedCount !== undefined ? { lastCreatedCount } : {}),
  };
}

function sanitizeLoopInstructions(value: unknown): Loop['instructions'] {
  if (!isRecord(value)) {
    return {};
  }

  const assignment = optionalTrimmedString(value.assignment);
  const beforeCompletion = optionalTrimmedString(value.beforeCompletion);
  return {
    ...(assignment ? { assignment } : {}),
    ...(beforeCompletion ? { beforeCompletion } : {}),
  };
}

function sanitizeLoopExecutionEntry(value: unknown, loopId: string): LoopExecutionLogEntry | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.startedAt !== 'string' ||
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
    status: value.status,
    createdCount,
    createdAgents,
    ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
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
    ...(sanitizeBackendConversationRef(value.conversationRef) ?? legacyCodexConversationRef(value.conversationId)),
  };
}

function sanitizeBackendConversationRef(value: unknown): Partial<Pick<LoopExecutionCreatedAgent, 'conversationRef'>> | null {
  if (!isRecord(value) || typeof value.backend !== 'string') {
    return null;
  }

  if (value.backend === 'codex' && typeof value.threadId === 'string' && value.threadId.trim()) {
    return {
      conversationRef: {
        backend: 'codex',
        threadId: value.threadId,
      },
    };
  }

  if (
    value.backend === 'claude' &&
    typeof value.folder === 'string' &&
    value.folder.trim() &&
    typeof value.sessionId === 'string' &&
    value.sessionId.trim()
  ) {
    return {
      conversationRef: {
        backend: 'claude',
        folder: value.folder,
        sessionId: value.sessionId,
      },
    };
  }

  return null;
}

function legacyCodexConversationRef(value: unknown): Partial<Pick<LoopExecutionCreatedAgent, 'conversationRef'>> {
  return typeof value === 'string' && value.trim()
    ? { conversationRef: { backend: 'codex', threadId: value } }
    : {};
}

function isLoopExecutionStatus(value: unknown): value is LoopExecutionStatus {
  return value === 'working' || value === 'completed' || value === 'failed';
}

function sanitizeLoopSource(value: unknown): LoopSourceConfiguration | null {
  if (!isRecord(value) || value.provider !== 'github') {
    return null;
  }

  const repositoryId = optionalTrimmedString(value.repositoryId);
  if (!repositoryId) {
    return null;
  }

  const assigneeLogin = optionalTrimmedString(value.assigneeLogin);
  const tagName = optionalTrimmedString(value.tagName);
  return {
    provider: 'github',
    repositoryId,
    ...(assigneeLogin ? { assigneeLogin } : {}),
    ...(tagName ? { tagName } : {}),
  };
}

function sanitizeLoopAction(value: unknown): LoopAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const teamTarget = sanitizeLoopTeamTarget(value.teamTarget);
  if (!teamTarget) {
    return null;
  }

  if (value.type === 'create-agent') {
    const sourceRepositoryPath = optionalTrimmedString(value.sourceRepositoryPath);
    if (!sourceRepositoryPath) {
      return null;
    }
    const backend = sanitizeBackend(value.backend) ?? 'codex';
    const backendDefaults = sanitizeBackendDefaults(value.backendDefaults, backend);

    return {
      type: 'create-agent',
      sourceRepositoryPath,
      backend,
      ...(backendDefaults ? { backendDefaults } : {}),
      teamTarget,
      cleanup: sanitizeLoopCleanup(value.cleanup, teamTarget),
    };
  }

  if (value.type === 'create-agent-from-bench') {
    const benchTemplateId = optionalTrimmedString(value.benchTemplateId);
    if (!benchTemplateId) {
      return null;
    }

    return {
      type: 'create-agent-from-bench',
      benchTemplateId,
      teamTarget,
      cleanup: sanitizeLoopCleanup(value.cleanup, teamTarget),
    };
  }

  return null;
}

function sanitizeLoopCleanup(value: unknown, teamTarget: LoopTeamTarget): LoopAction['cleanup'] {
  if (teamTarget.mode === 'dedicated') {
    return {
      deleteTeam: !isRecord(value) || value.deleteTeam !== false,
    };
  }

  return {
    deleteAgent: !isRecord(value) || value.deleteAgent !== false,
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
  return value === 'blocked' || value === 'completed' || value === 'inProgress' || value === 'readyForReview';
}

function sanitizeTeam(value: unknown, agents: Agent[], remoteConnectionIds: Set<string>): Team | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }

  const agentIds = Array.isArray(value.agentIds)
    ? value.agentIds.filter((agentId): agentId is string => typeof agentId === 'string' && agents.some((agent) => agent.id === agentId))
    : [];

  const remoteConnectionId = typeof value.remoteConnectionId === 'string' && remoteConnectionIds.has(value.remoteConnectionId)
    ? value.remoteConnectionId
    : null;
  const remoteTeamId = remoteConnectionId && typeof value.remoteTeamId === 'string' && value.remoteTeamId.trim()
    ? value.remoteTeamId
    : null;
  const teamAgentIds = remoteConnectionId && remoteTeamId ? [] : agentIds;

  return {
    id: value.id,
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
    color: typeof value.color === 'string' ? value.color : defaultTeamColor,
    ...(remoteConnectionId ? { remoteConnectionId } : {}),
    ...(remoteTeamId ? { remoteTeamId } : {}),
    agentIds: teamAgentIds,
    activeAgentId: typeof value.activeAgentId === 'string' && teamAgentIds.includes(value.activeAgentId)
      ? value.activeAgentId
      : undefined,
  };
}

function localRemoteTeamPointerIds(teams: Team[]): Set<string> {
  const ids = new Set<string>();
  for (const team of teams) {
    if (!isRemoteTeamPointer(team)) {
      continue;
    }
    // `remoteTeamId` is owned by another clawd and can collide with local team ids.
    // Only the local pointer team's id participates in local state repair/migration.
    ids.add(team.id);
  }
  return ids;
}

function assignmentsForAgents(assignments: WorkBacklogState['assignments'], agentIds: Set<string>): WorkBacklogState['assignments'] {
  return Object.fromEntries(
    Object.entries(assignments).filter(([, assignment]) => agentIds.has(assignment.agentId)),
  );
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
      ...(typeof value.model === 'string' ? { model: value.model } : {}),
      ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
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
      ...(typeof value.serviceTier === 'string' ? { serviceTier: value.serviceTier } : {}),
    } satisfies BackendDefaults;
    return defaults.kind === expectedBackend ? defaults : undefined;
  }

  if (value.kind === 'claude') {
    const thinking = sanitizeClaudeThinking(value.thinking);
    const defaults = {
      kind: 'claude',
      ...(typeof value.model === 'string' ? { model: value.model } : {}),
      ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
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
  const fallbackTeam = snapshot.teams.find((team) => !isRemoteTeamPointer(team));
  if (!fallbackTeam) {
    snapshot.agents = [];
    return;
  }

  for (const agent of snapshot.agents) {
    const team = snapshot.teams.find((candidate) => candidate.id === agent.teamId && !isRemoteTeamPointer(candidate)) ?? fallbackTeam;
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

function isRemoteTeamPointer(team: Team): boolean {
  return Boolean(team.remoteConnectionId && team.remoteTeamId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
