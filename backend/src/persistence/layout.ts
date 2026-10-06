import type { AccountRateLimits, AgentSubagentTree, AppGeneralSettings, AppThemeSettings, Automation, BackendDefaults, BackendSession, RemoteConnection, SourceFolderState, SubagentNode, Team, WorkBacklogState } from '@workspace/core/contracts';
import { approvalBackendDefaultsWithPreset } from '@workspace/core/approval-presets';
import type { Mission } from '@workspace/core/missions';
import type { Visualization } from '@workspace/core/visualize';
import type { FullPersistedState, PersistedAgent, PersistedState } from '../state-persistence';
import './agent-fields';

type CodexDefaults = Extract<BackendDefaults, { kind: 'codex' }>;
type ClaudeDefaults = Extract<BackendDefaults, { kind: 'claude' }>;
type ClaudeSession = Extract<BackendSession, { kind: 'claude' }>;

/** One provider block instead of three sibling fields that had to agree on `kind`. */
type Engine =
  | { kind: 'antigravity'; session?: { sessionId: string }; settings?: Omit<Extract<BackendDefaults, { kind: 'antigravity' }>, 'kind'> }
  | { kind: 'codex'; session?: { threadId: string }; settings?: Omit<CodexDefaults, 'kind'> }
  | { kind: 'claude'; session?: Omit<ClaudeSession, 'kind'>; settings?: Omit<ClaudeDefaults, 'kind'> };

export type RosterAgent = Omit<PersistedAgent, 'teamId' | 'backend' | 'backendSession' | 'backendDefaults'> & { engine: Engine };

export type RosterData = {
  activeTeamId: string | null;
  teams: Team[];
  agents: RosterAgent[];
  automations: Automation[];
  missions?: Mission[];
  workAssignments: WorkBacklogState['assignments'];
  /** Only the node list is read by anything; operations and activities are not persisted. */
  subagents: Record<string, { rootConversationId: string; nodes: Record<string, SubagentNode> }>;
  accountRateLimits?: AccountRateLimits;
};

export type SettingsData = {
  settings: AppGeneralSettings;
  theme: AppThemeSettings;
  sourceFolder: SourceFolderState;
  remoteConnections: RemoteConnection[];
  workIntegrations: Omit<WorkBacklogState, 'assignments'>;
};

export type VisualizationData = {
  repository: string;
  /** Index in the repository's list; creation time does not preserve the order the user sees. */
  position: number;
  visualization: Visualization;
};

export type StoreFiles = {
  roster: RosterData;
  settings: SettingsData;
  visualizations: VisualizationData[];
};

/** Splits the (already shared-view) persisted state into the on-disk files. */
export function splitPersistedState(state: FullPersistedState): StoreFiles {
  const libraries = state.repositoryVisualizations ?? {};
  const agentIds = new Set(state.agents.map((agent) => agent.id));
  return {
    roster: {
      activeTeamId: state.activeTeamId,
      teams: state.teams.map((team) => teamWithSelection(team, state)),
      agents: state.agents.map(rosterAgentFrom),
      automations: state.automations,
      ...(state.missions ? { missions: state.missions } : {}),
      workAssignments: state.workBacklog.assignments,
      subagents: Object.fromEntries(Object.entries(state.subagentTrees)
        .filter(([agentId]) => agentIds.has(agentId))
        .map(([agentId, tree]) => [agentId, subagentNodes(tree)])),
      ...(state.accountRateLimits ? { accountRateLimits: state.accountRateLimits } : {}),
    },
    settings: {
      settings: state.general,
      theme: state.theme,
      sourceFolder: state.sourceFolder,
      remoteConnections: state.remoteConnections.connections,
      workIntegrations: {
        connections: state.workBacklog.connections,
        providerConfigurations: state.workBacklog.providerConfigurations,
        providerSettings: state.workBacklog.providerSettings,
      },
    },
    visualizations: Object.entries(libraries).flatMap(([repository, visualizations]) =>
      visualizations.map((visualization, position) => ({ repository, position, visualization }))),
  };
}

/** Rebuilds the legacy-shaped state that the existing sanitizers and repairs consume. */
export function joinPersistedState(files: StoreFiles): PersistedState {
  const { roster, settings } = files;
  const teamOfAgent = new Map(roster.teams.flatMap((team) => team.agentIds.map((agentId) => [agentId, team.id] as const)));
  const activeTeam = roster.teams.find((team) => team.id === roster.activeTeamId);
  const libraries: Record<string, Visualization[]> = {};
  for (const { repository, visualization } of [...files.visualizations].sort(byPosition)) {
    (libraries[repository] ??= []).push(visualization);
  }
  return {
    ...(roster.missions ? { missions: roster.missions } : {}),
    ...(Object.keys(libraries).length ? { repositoryVisualizations: libraries } : {}),
    teams: roster.teams,
    agents: roster.agents.map((agent) => persistedAgentFrom(agent, teamOfAgent.get(agent.id))),
    automations: roster.automations,
    activeTeamId: roster.activeTeamId,
    activeAgentId: activeTeam?.activeAgentId ?? null,
    ...(roster.accountRateLimits ? { accountRateLimits: roster.accountRateLimits } : {}),
    subagentTrees: Object.fromEntries(Object.entries(roster.subagents).map(([agentId, tree]) => [agentId, {
      rootConversationId: tree.rootConversationId,
      nodes: tree.nodes,
      operations: {},
      activities: {},
    } satisfies AgentSubagentTree])),
    workBacklog: { ...settings.workIntegrations, assignments: roster.workAssignments },
    remoteConnections: { connections: settings.remoteConnections },
    general: settings.settings,
    sourceFolder: settings.sourceFolder,
    theme: settings.theme,
  };
}

/** The selected agent lives on the active team, so there is no separate global field to drift. */
function teamWithSelection(team: Team, state: FullPersistedState): Team {
  const selected = state.activeAgentId;
  return team.id === state.activeTeamId && selected && team.agentIds.includes(selected)
    ? { ...team, activeAgentId: selected }
    : team;
}

function subagentNodes(tree: AgentSubagentTree): RosterData['subagents'][string] {
  return { rootConversationId: tree.rootConversationId, nodes: tree.nodes };
}

function byPosition(left: VisualizationData, right: VisualizationData): number {
  return left.position - right.position || left.visualization.id.localeCompare(right.visualization.id);
}

function rosterAgentFrom(agent: PersistedAgent): RosterAgent {
  const { teamId: _teamId, backend: _backend, backendSession: _session, backendDefaults: _defaults, plan, planReview, goal, ...kept } = agent;
  return {
    ...kept,
    engine: engineFrom(agent),
    // Finished work is not actionable; keep only what can still change.
    ...(plan && plan.status !== 'completed' ? { plan } : {}),
    ...(planReview?.status === 'pending' ? { planReview } : {}),
    ...(goal && goal.status !== 'complete' ? { goal } : {}),
  };
}

function persistedAgentFrom(agent: RosterAgent, teamId: string | undefined): PersistedAgent {
  const { engine, ...kept } = agent;
  if (engine.kind === 'antigravity') return {
    ...kept, ...(teamId ? { teamId } : {}), backend: 'antigravity',
    ...(engine.session ? { backendSession: { kind: 'antigravity', ...engine.session } } : {}),
    ...(engine.settings ? { backendDefaults: { kind: 'antigravity', ...engine.settings } } : {}),
  };
  const session = engine.session;
  const settings = engine.settings;
  const backendSession: BackendSession | undefined = session
    ? engine.kind === 'codex' ? { kind: 'codex', threadId: (session as { threadId: string }).threadId } : { kind: 'claude', ...(session as Omit<ClaudeSession, 'kind'>) }
    : undefined;
  const backendDefaults: BackendDefaults | undefined = settings
    ? engine.kind === 'codex' ? codexDefaultsFrom(settings as Omit<CodexDefaults, 'kind'>) : { kind: 'claude', ...(settings as Omit<ClaudeDefaults, 'kind'>) }
    : undefined;
  return {
    ...kept,
    ...(teamId ? { teamId } : {}),
    backend: engine.kind,
    ...(backendSession ? { backendSession } : {}),
    ...(backendDefaults ? { backendDefaults } : {}),
  };
}

function engineFrom(agent: PersistedAgent): Engine {
  const { backend, backendSession, backendDefaults } = agent;
  if (backend === 'antigravity') return {
    kind: 'antigravity',
    ...(backendSession?.kind === 'antigravity' ? { session: withoutKind(backendSession) } : {}),
    ...(backendDefaults?.kind === 'antigravity' ? { settings: withoutKind(backendDefaults) } : {}),
  };
  if (backend === 'claude') {
    const session = backendSession?.kind === 'claude' ? withoutKind(backendSession) : undefined;
    const settings = backendDefaults?.kind === 'claude' ? withoutKind(backendDefaults) : undefined;
    return { kind: 'claude', ...(session ? { session } : {}), ...(settings ? { settings } : {}) };
  }
  const session = backendSession?.kind === 'codex' ? { threadId: backendSession.threadId } : undefined;
  const settings = backendDefaults?.kind === 'codex' ? codexSettingsFrom(backendDefaults) : undefined;
  return { kind: 'codex', ...(session ? { session } : {}), ...(settings ? { settings } : {}) };
}

/** Policy, reviewer and sandbox follow from the preset, so only the preset is stored. */
function codexSettingsFrom(defaults: CodexDefaults): Omit<CodexDefaults, 'kind'> {
  const { kind: _kind, ...settings } = defaults;
  if (!settings.approvalPreset) return settings;
  const { approvalPolicy: _policy, approvalsReviewer: _reviewer, sandboxMode: _sandbox, ...rest } = settings;
  return rest;
}

function codexDefaultsFrom(settings: Omit<CodexDefaults, 'kind'>): CodexDefaults {
  return settings.approvalPreset
    ? approvalBackendDefaultsWithPreset({ kind: 'codex', ...settings }, settings.approvalPreset)
    : { kind: 'codex', ...settings };
}

function withoutKind<T extends { kind: string }>(value: T): Omit<T, 'kind'> {
  const { kind: _kind, ...rest } = value;
  return rest;
}
