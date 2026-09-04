import type { Agent, AppSnapshot } from './contracts';
import { defaultGeneralSettings, defaultPluginSettings, defaultSourceFolderState, defaultThemeSettings } from './settings';
import { seedTeamId } from './seed-ids';
import { defaultTeamColor } from './team-colors';

const seedCreatedAt = '2026-06-05T00:00:00.000Z';

export function createEmptySnapshot(): AppSnapshot {
  return {
    teams: [
      createDefaultTeam(),
    ],
    agents: [],
    automations: [],
    activeTeamId: seedTeamId,
    activeAgentId: null,
    messages: [],
    queuedPrompts: [],
    workRoutingRequests: [],
    backendApprovals: {},
    agentGitStatuses: {},
    turnGitDiffs: {},
    subagentTrees: {},
    backendRuntimes: [{
      backend: 'codex',
      status: 'notConfigured',
      detail: { key: 'backend.codexNotConnected' },
    }, {
      backend: 'claude',
      status: 'notConfigured',
      detail: { key: 'backend.claudeNotStarted' },
    }],
    workBacklog: createDefaultWorkBacklogState(),
    remoteConnections: createDefaultRemoteConnectionsState(),
    general: {
      ...defaultGeneralSettings,
      collapsedRepositoryKeys: [...defaultGeneralSettings.collapsedRepositoryKeys],
      repositoryIcons: { ...defaultGeneralSettings.repositoryIcons },
      appshots: { ...defaultGeneralSettings.appshots },
      plugins: { ...defaultPluginSettings },
    },
    sourceFolder: {
      ...defaultSourceFolderState,
      recentRepoNames: [...defaultSourceFolderState.recentRepoNames],
    },
    theme: { ...defaultThemeSettings },
  };
}

export function createInitialSnapshot(): AppSnapshot {
  const agents = createSeedAgents();

  return {
    teams: [
      {
        ...createDefaultTeam(),
        agentIds: agents.map((agent) => agent.id),
      },
    ],
    agents,
    automations: [],
    activeTeamId: seedTeamId,
    activeAgentId: agents[0]?.id ?? null,
    messages: [],
    queuedPrompts: [],
    workRoutingRequests: [],
    backendApprovals: {},
    agentGitStatuses: {},
    turnGitDiffs: {},
    subagentTrees: {},
    backendRuntimes: [{
      backend: 'codex',
      status: 'notConfigured',
      detail: { key: 'backend.codexNotConnected' },
    }, {
      backend: 'claude',
      status: 'notConfigured',
      detail: { key: 'backend.claudeNotStarted' },
    }],
    workBacklog: createDefaultWorkBacklogState(),
    remoteConnections: createDefaultRemoteConnectionsState(),
    general: {
      ...defaultGeneralSettings,
      collapsedRepositoryKeys: [...defaultGeneralSettings.collapsedRepositoryKeys],
      repositoryIcons: { ...defaultGeneralSettings.repositoryIcons },
      appshots: { ...defaultGeneralSettings.appshots },
      plugins: { ...defaultPluginSettings },
    },
    sourceFolder: {
      ...defaultSourceFolderState,
      recentRepoNames: [...defaultSourceFolderState.recentRepoNames],
    },
    theme: { ...defaultThemeSettings },
  };
}

function createDefaultWorkBacklogState(): AppSnapshot['workBacklog'] {
  return {
    connections: [{
      provider: 'github',
      status: 'disconnected',
    }],
    providerConfigurations: {},
    providerSettings: {},
    assignments: {},
  };
}

export function createDefaultRemoteConnectionsState(): AppSnapshot['remoteConnections'] {
  return {
    connections: [],
  };
}

function createDefaultTeam(): AppSnapshot['teams'][number] {
  return {
    id: seedTeamId,
    name: 'Codex Claw',
    avatar: 'CC',
    color: defaultTeamColor,
    agentIds: [],
  };
}

function createSeedAgents(): Agent[] {
  return [
    {
      id: 'agent-dina',
      teamId: seedTeamId,
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    },
    {
      id: 'agent-jesse',
      teamId: seedTeamId,
      name: 'Jesse',
      avatar: 'JE',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    },
  ];
}
