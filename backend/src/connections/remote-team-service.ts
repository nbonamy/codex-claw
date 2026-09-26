import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { isClawSnapshotGetResult, type ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { applyMainEventToSnapshot } from '@codex-claw/core/snapshot';
import { decodeAppSnapshot } from '@codex-claw/core/snapshot-guards';
import type { Agent, AppSnapshot, CreateAgentInput, CreateTeamInput, RemoteConnection, Team } from '@codex-claw/core/contracts';
import { workItemAssignmentKey, type WorkItemAssignmentSource } from '@codex-claw/core/work-assignments';
import type { RemoteClawdClientManager } from './remote-clawd-client';

export type RemoteTeamPointer = {
  connectionId: string;
  localTeamId: string;
  remoteTeamId: string;
};

export type RemoteAgentOwner = RemoteTeamPointer & { agent: Agent };

export type RemoteTeamServiceOptions = {
  clients: RemoteClawdClientManager;
  getSnapshot: () => AppSnapshot;
  onForwardedEvent: (connectionId: string, event: ClawBackendEvent) => void;
  onProjectedSnapshotChanged: () => void;
};

/** Owns remote clawd snapshot caching, team projection, and remote ownership lookup. */
export class RemoteTeamService {
  private readonly snapshots = new Map<string, AppSnapshot>();

  constructor(private readonly options: RemoteTeamServiceOptions) {}

  connectionIdForAgent(agent: Pick<Agent, 'teamId'>): string | null {
    const team = agent.teamId
      ? this.options.getSnapshot().teams.find((candidate) => candidate.id === agent.teamId)
      : null;
    return this.connectionIdForTeam(team ?? null);
  }

  connectionIdForTeam(team: Team | null): string | null {
    return team?.remoteConnectionId?.trim() || null;
  }

  pointerForTeam(team: Team | null): RemoteTeamPointer | null {
    const connectionId = team?.remoteConnectionId?.trim() ?? '';
    const remoteTeamId = team?.remoteTeamId?.trim() ?? '';
    if (!team || !connectionId || !remoteTeamId) return null;
    return { connectionId, localTeamId: team.id, remoteTeamId };
  }

  pointerForAgentInput(input: Pick<CreateAgentInput, 'teamId'>): RemoteTeamPointer | null {
    return this.pointerForTeam(this.targetTeamForAgentInput(input));
  }

  targetTeamForAgentInput(input: Pick<CreateAgentInput, 'teamId'>): Team | null {
    const snapshot = this.options.getSnapshot();
    if (!input.teamId) throw new Error('A target team is required before resolving its location.');
    const team = snapshot.teams.find((team) => team.id === input.teamId);
    if (!team) throw new Error(`Team not found: ${input.teamId}`);
    return team;
  }

  knownSnapshot(connectionId: string): AppSnapshot | undefined {
    return this.snapshots.get(connectionId);
  }

  rememberSnapshot(connectionId: string, snapshot: AppSnapshot): void {
    this.snapshots.set(connectionId, snapshot);
  }

  adoptCreatedAgentSnapshot(pointer: RemoteTeamPointer, remoteSnapshot: AppSnapshot): void {
    this.rememberSnapshot(pointer.connectionId, remoteSnapshot);
  }

  async request<Result = unknown>(connectionId: string, method: string, params?: unknown): Promise<Result> {
    if (requestsClaudeBackend(method, params)) await this.snapshot(connectionId);
    return this.remoteRequest(connectionId, method, params);
  }

  private async remoteRequest<Result = unknown>(connectionId: string, method: string, params?: unknown): Promise<Result> {
    return this.options.clients.request<Result>(this.connection(connectionId), method, { ...(params && typeof params === 'object' ? params : {}), _clientId: 'remote-controller' }, (event) => {
      this.applyEvent(connectionId, event);
    });
  }

  async snapshot(connectionId: string): Promise<AppSnapshot> {
    const result = await this.remoteRequest(connectionId, backendMethods.snapshotGet);
    if (!isClawSnapshotGetResult(result)) throw new Error('Remote snapshot is invalid.');
    const desired = this.options.getSnapshot().general.claudeCodeEnabled;
    if (result.snapshot.general.claudeCodeEnabled === desired) {
      this.snapshots.set(connectionId, result.snapshot);
      return result.snapshot;
    }
    const updated = await this.remoteRequest(connectionId, backendMethods.settingsUpdate, {
      input: { general: { claudeCodeEnabled: desired } },
    });
    const decoded = decodeAppSnapshot(updated);
    if (!decoded) throw new Error('Remote settings snapshot is invalid.');
    this.snapshots.set(connectionId, decoded.value);
    return decoded.value;
  }

  async resolveTeamForPointerInput(
    input: Pick<CreateTeamInput, 'name' | 'color' | 'remoteConnectionId' | 'remoteTeamId'>,
  ): Promise<Team> {
    const connectionId = input.remoteConnectionId?.trim() ?? '';
    if (!connectionId) throw new Error('Remote connection is required.');

    const requestedRemoteTeamId = input.remoteTeamId?.trim() ?? '';
    const remoteSnapshot = requestedRemoteTeamId
      ? await this.snapshot(connectionId)
      : await this.request<AppSnapshot>(connectionId, backendMethods.teamCreate, {
          input: { name: input.name, color: input.color },
        });
    this.snapshots.set(connectionId, remoteSnapshot);

    const remoteTeam = requestedRemoteTeamId
      ? remoteSnapshot.teams.find((team) => team.id === requestedRemoteTeamId)
      : remoteSnapshot.teams.find((team) => team.id === remoteSnapshot.activeTeamId)
        ?? remoteSnapshot.teams[remoteSnapshot.teams.length - 1];
    if (!remoteTeam) {
      throw new Error(requestedRemoteTeamId ? `Remote team not found: ${requestedRemoteTeamId}` : 'Remote team was not created.');
    }
    return remoteTeam;
  }

  async teamHasAgents(team: Team): Promise<boolean> {
    if (team.agentIds.length > 0) return true;
    const pointer = this.pointerForTeam(team);
    if (!pointer) return false;
    const cached = this.snapshots.get(pointer.connectionId);
    if (cached && remoteTeamHasAgents(cached, pointer.remoteTeamId)) return true;
    return remoteTeamHasAgents(await this.snapshot(pointer.connectionId), pointer.remoteTeamId);
  }

  async agentOwner(agentId: string): Promise<RemoteAgentOwner | null> {
    for (const team of this.options.getSnapshot().teams) {
      const pointer = this.pointerForTeam(team);
      if (!pointer) continue;
      const cachedAgent = remoteTeamAgent(this.snapshots.get(pointer.connectionId), pointer.remoteTeamId, agentId);
      if (cachedAgent) return { ...pointer, agent: cachedAgent };
      const agent = remoteTeamAgent(await this.snapshot(pointer.connectionId), pointer.remoteTeamId, agentId);
      if (agent) return { ...pointer, agent };
    }
    return null;
  }

  async workItemAssignmentOwner(item: WorkItemAssignmentSource): Promise<RemoteTeamPointer | null> {
    const snapshot = this.options.getSnapshot();
    const assignmentKey = workItemAssignmentKey(item);
    const teams = [...snapshot.teams].sort((left, right) => (
      left.id === snapshot.activeTeamId ? -1 : right.id === snapshot.activeTeamId ? 1 : 0
    ));
    for (const team of teams) {
      const pointer = this.pointerForTeam(team);
      if (!pointer) continue;
      const cached = this.snapshots.get(pointer.connectionId);
      const cachedAssignment = cached?.workBacklog.assignments[assignmentKey];
      if (cachedAssignment && remoteTeamAgent(cached, pointer.remoteTeamId, cachedAssignment.agentId)) return pointer;
      const remoteSnapshot = cached ?? await this.snapshot(pointer.connectionId);
      const assignment = remoteSnapshot.workBacklog.assignments[assignmentKey];
      if (assignment && remoteTeamAgent(remoteSnapshot, pointer.remoteTeamId, assignment.agentId)) return pointer;
    }
    return null;
  }

  validateConnection(connectionId: string | undefined): void {
    const normalized = connectionId?.trim() ?? '';
    if (!normalized) return;
    if (!this.options.getSnapshot().remoteConnections.connections.some((connection) => connection.id === normalized)) {
      throw new Error(`Remote connection not found: ${normalized}`);
    }
  }

  async clientSnapshot(): Promise<AppSnapshot> {
    const snapshot = this.clientSnapshotFromKnownRemotes();
    for (const team of snapshot.teams) {
      const pointer = this.pointerForTeam(team);
      if (!pointer || this.snapshots.has(pointer.connectionId)) continue;
      try {
        const remoteSnapshot = await this.snapshot(pointer.connectionId);
        projectRemoteTeam(snapshot, team, remoteSnapshot, pointer.remoteTeamId);
      } catch {
        team.agentIds = [];
        delete team.activeAgentId;
      }
    }
    applyRemoteActiveAgent(snapshot);
    return snapshot;
  }

  clientSnapshotFromKnownRemotes(): AppSnapshot {
    const source = this.options.getSnapshot();
    const snapshot = cloneAppSnapshot(source);
    for (const team of snapshot.teams) {
      const pointer = this.pointerForTeam(team);
      if (!pointer) continue;
      const remoteSnapshot = this.snapshots.get(pointer.connectionId);
      if (remoteSnapshot) {
        projectRemoteTeam(snapshot, team, remoteSnapshot, pointer.remoteTeamId);
      } else {
        team.agentIds = [];
        delete team.activeAgentId;
      }
    }
    applyRemoteActiveAgent(snapshot);
    return snapshot;
  }

  private connection(connectionId: string): RemoteConnection {
    const connection = this.options.getSnapshot().remoteConnections.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) throw new Error(`Remote connection not found: ${connectionId}`);
    if (connection.status !== 'ready' || !connection.transport) {
      throw new Error(`Remote connection is not ready: ${connection.name}`);
    }
    return connection;
  }

  private applyEvent(connectionId: string, event: ClawBackendEvent): void {
    const decodedSnapshot = decodeSnapshotFromRemoteEvent(event);
    if (decodedSnapshot) {
      this.snapshots.set(connectionId, decodedSnapshot.value);
    } else if (event.type !== 'snapshot.updated') {
      const remoteSnapshot = this.snapshots.get(connectionId);
      if (remoteSnapshot) applyMainEventToSnapshot(remoteSnapshot, event);
    }
    if (event.type === 'snapshot.updated') {
      if (this.hasTeamPointer(connectionId)) this.options.onProjectedSnapshotChanged();
      return;
    }
    if (this.shouldForwardEvent(connectionId, event)) this.options.onForwardedEvent(connectionId, event);
  }

  private shouldForwardEvent(connectionId: string, event: ClawBackendEvent): boolean {
    const agentId = event.agentId;
    if (!agentId) return this.hasTeamPointer(connectionId);
    const remoteSnapshot = this.snapshots.get(connectionId);
    if (!remoteSnapshot) return false;
    return this.options.getSnapshot().teams.some((team) => {
      const pointer = this.pointerForTeam(team);
      return pointer?.connectionId === connectionId
        && Boolean(remoteTeamAgent(remoteSnapshot, pointer.remoteTeamId, agentId));
    });
  }

  private hasTeamPointer(connectionId: string): boolean {
    return this.options.getSnapshot().teams.some((team) => (
      team.remoteConnectionId === connectionId && Boolean(team.remoteTeamId)
    ));
  }
}

function requestsClaudeBackend(method: string, params: unknown): boolean {
  if (method !== backendMethods.agentCreate
    && method !== backendMethods.agentQuickChatCreate
    && method !== backendMethods.projectCreate
    && method !== backendMethods.agentUpdate) return false;
  if (!params || typeof params !== 'object' || !('input' in params)) return false;
  const input = params.input;
  return Boolean(input && typeof input === 'object' && 'backend' in input && input.backend === 'claude');
}

function decodeSnapshotFromRemoteEvent(event: ClawBackendEvent) {
  const sideChannelSnapshot = decodeAppSnapshot(event.snapshot);
  if (sideChannelSnapshot) return sideChannelSnapshot;
  if (event.type !== 'snapshot.updated') return null;
  return decodeAppSnapshot(event.payload);
}

function cloneAppSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AppSnapshot;
}

function projectRemoteTeam(target: AppSnapshot, localTeam: Team, remoteSnapshot: AppSnapshot, remoteTeamId: string): void {
  const remoteTeam = remoteSnapshot.teams.find((team) => team.id === remoteTeamId);
  if (!remoteTeam) {
    localTeam.agentIds = [];
    delete localTeam.activeAgentId;
    return;
  }
  const remoteAgentIds = new Set(remoteTeam.agentIds);
  const remoteAgents = remoteSnapshot.agents
    .filter((agent) => remoteAgentIds.has(agent.id))
    .map((agent) => ({ ...agent, teamId: localTeam.id }));
  localTeam.name = remoteTeam.name;
  localTeam.avatar = remoteTeam.avatar;
  localTeam.color = remoteTeam.color;
  localTeam.agentIds = remoteAgents.map((agent) => agent.id);
  localTeam.activeAgentId = remoteTeam.activeAgentId && localTeam.agentIds.includes(remoteTeam.activeAgentId)
    ? remoteTeam.activeAgentId
    : localTeam.agentIds[0];

  const projectedAgentIds = new Set(remoteAgents.map((agent) => agent.id));
  target.agents = [...target.agents.filter((agent) => !projectedAgentIds.has(agent.id)), ...remoteAgents];
  target.agentGitStatuses = {
    ...target.agentGitStatuses,
    ...Object.fromEntries(Object.entries(remoteSnapshot.agentGitStatuses).filter(([agentId]) => projectedAgentIds.has(agentId))),
  };
  target.agentRequests = {
    ...Object.fromEntries(Object.entries(target.agentRequests ?? {}).filter(([agentId]) => !projectedAgentIds.has(agentId))),
    ...Object.fromEntries(Object.entries(remoteSnapshot.agentRequests ?? {}).filter(([agentId]) => projectedAgentIds.has(agentId))),
  };
  target.backendApprovals = {
    ...Object.fromEntries(Object.entries(target.backendApprovals).filter(([agentId]) => !projectedAgentIds.has(agentId))),
    ...Object.fromEntries(Object.entries(remoteSnapshot.backendApprovals).filter(([agentId]) => projectedAgentIds.has(agentId))),
  };
  target.turnGitDiffs = {
    ...Object.fromEntries(Object.entries(target.turnGitDiffs).filter(([, diff]) => !projectedAgentIds.has(diff.agentId))),
    ...Object.fromEntries(Object.entries(remoteSnapshot.turnGitDiffs).filter(([, diff]) => projectedAgentIds.has(diff.agentId))),
  };
  target.subagentTrees = {
    ...Object.fromEntries(Object.entries(target.subagentTrees).filter(([agentId]) => !projectedAgentIds.has(agentId))),
    ...Object.fromEntries(Object.entries(remoteSnapshot.subagentTrees).filter(([agentId]) => projectedAgentIds.has(agentId))),
  };
  target.workBacklog.assignments = {
    ...Object.fromEntries(Object.entries(target.workBacklog.assignments).filter(([, assignment]) => !projectedAgentIds.has(assignment.agentId))),
    ...Object.fromEntries(Object.entries(remoteSnapshot.workBacklog.assignments).filter(([, assignment]) => projectedAgentIds.has(assignment.agentId))),
  };
}

function applyRemoteActiveAgent(snapshot: AppSnapshot): void {
  const activeTeam = snapshot.teams.find((team) => team.id === snapshot.activeTeamId) ?? null;
  if (!activeTeam?.remoteConnectionId || !activeTeam.remoteTeamId) return;
  snapshot.activeAgentId = activeTeam.activeAgentId && activeTeam.agentIds.includes(activeTeam.activeAgentId)
    ? activeTeam.activeAgentId
    : activeTeam.agentIds[0] ?? null;
}

function remoteTeamAgent(snapshot: AppSnapshot | undefined, remoteTeamId: string, agentId: string): Agent | null {
  const remoteTeam = snapshot?.teams.find((team) => team.id === remoteTeamId);
  if (!remoteTeam?.agentIds.includes(agentId)) return null;
  return snapshot?.agents.find((agent) => agent.id === agentId) ?? null;
}

function remoteTeamHasAgents(snapshot: AppSnapshot, remoteTeamId: string): boolean {
  return (snapshot.teams.find((team) => team.id === remoteTeamId)?.agentIds.length ?? 0) > 0;
}
