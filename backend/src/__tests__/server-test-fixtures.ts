import path from 'node:path';
import type { Agent, AgentGitStatus, AppSnapshot, BackendConversationRef, RendererMessage, SourceWorktree, SystemPermissionsStatus, ThreadGoal, WorkItem, WorkRoutingRequest } from '@codex-claw/core/contracts';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';

export function createTestSnapshot(): AppSnapshot {
  return {
    teams: [{
      id: 'team-test',
      name: 'Test Team',
      agentIds: [],
    }],
    agents: [],
    automations: [],
    activeTeamId: 'team-test',
    activeAgentId: null,
    messages: [],
    backendApprovals: {},
    agentGitStatuses: {},
    turnGitDiffs: {},
    subagentTrees: {},
    backendRuntimes: [],
    workBacklog: {
      connections: [],
      providerConfigurations: {},
      providerSettings: {},
      assignments: {},
    },
    remoteConnections: {
      connections: [],
    },
    general: {
      preventSleepWhenAgentsRun: true,
      preventSleepWhenRemoteAccessEnabled: true,
      celebrationsEnabled: true,
      spokenAnnouncementsEnabled: false,
      spokenAnnouncementsMuted: false,
      spokenAnnouncementsOnlyForDictatedPrompts: false,
      spokenAnnouncementsOnlyWhenFocused: true,
      spokenAnnouncementScope: 'selected',
      spokenAnnouncementVoice: 'af_heart',
      codexBinaryPath: '',
      claudeCodeEnabled: false,
      agentListCompact: false,
      collapsedRepositoryKeys: [],
      shareCodexSkillsAndPlugins: true,
      worktreeInitializationMode: 'automatic',
      repositoryIcons: {},
      appshots: {
        hotkey: 'command',
        destination: 'active-agent',
        playSound: true,
      },
      plugins: {
        computerUseEnabled: false,
        chromeEnabled: false,
      },
    },
    sourceFolder: {
      path: '',
      initialized: false,
      recentRepoNames: [],
    },
    theme: {
      id: 'codex-claw-light',
      mode: 'system',
      uiFontSize: 14,
      chatFontSize: 15,
      codeFontSize: 13,
    },
  };
}

export function workRoutingSnapshot(): AppSnapshot {
  const snapshot = createTestSnapshot();
  snapshot.teams[0]!.agentIds = ['agent-dina'];
  snapshot.agents = [{
    id: 'agent-dina',
    teamId: 'team-test',
    name: 'Dina',
    folder: '/repo',
    backend: 'codex',
    status: { type: 'idle' },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }];
  snapshot.activeAgentId = 'agent-dina';
  return snapshot;
}

export function workRoutingRequestedEvent(sharedFolderAgentNames: string[] = []) {
  const request: WorkRoutingRequest = {
    id: 'work-routing-1',
    kind: 'work_routing',
    payload: {
      request: {
        agentId: 'agent-dina',
        task: 'Implement the routed feature.',
        suggestedBranchName: 'feat/routed-work',
        sharedFolderAgentNames,
      },
    },
  };
  return { agentId: 'agent-dina', type: 'workRouting.requested' as const, payload: request };
}

export function cleanGitStatus(): AgentGitStatus {
  return {
    folder: '/repo',
    branch: 'main',
    ahead: 0,
    behind: 0,
    changedFiles: 0,
    addedLines: 0,
    removedLines: 0,
    hasUntracked: false,
    state: 'clean',
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}

export function workRoutingResponseMessage(mode: 'current' | 'branch' | 'delegate', branchName?: string) {
  const workRouting: NonNullable<import('@codex-claw/core/contracts').ClientRequestResponse['payload']>['workRouting'] = {
    mode,
    ...(branchName ? { branchName } : {}),
  };
  return {
    jsonrpc: '2.0' as const,
    id: `respond-${mode}`,
    method: backendMethods.clientRequestRespond,
    params: { response: { id: 'work-routing-1', payload: { workRouting } } },
  };
}

export function readyRemoteConnection(): AppSnapshot['remoteConnections']['connections'][number] {
  return {
    id: 'connection-devbox',
    kind: 'ssh',
    name: 'devbox',
    host: 'devbox',
    status: 'ready',
    transport: {
      type: 'ssh-stdio',
      command: 'ssh',
      args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
    },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}

export function createRemoteAgent(): AppSnapshot['agents'][number] {
  return {
    id: 'agent-remote',
    teamId: 'team-remote',
    name: 'Dina',
    folder: '/home/mnmt/src/codex-claw',
    backend: 'codex',
    status: { type: 'idle' },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}

export function gitWorkspace(primaryWorktreeRoot: string, repositoryName: string, branch: string): Extract<NonNullable<Agent['workspace']>, { kind: 'git' }> {
  return {
    kind: 'git',
    folder: primaryWorktreeRoot,
    repositoryName,
    repositoryRoot: primaryWorktreeRoot,
    branch,
    isLinkedWorktree: false,
    primaryWorktreeRoot,
    updatedAt: '2026-06-05T00:00:00.000Z',
  };
}

export function createRemoteTeamSnapshot(agents: AppSnapshot['agents'] = []): AppSnapshot {
  const snapshot = createTestSnapshot();
  snapshot.teams = [{
    id: 'team-remote',
    name: 'Remote Core',
    color: '#46A857',
    agentIds: agents.map((agent) => agent.id),
    activeAgentId: agents[0]?.id,
  }];
  snapshot.agents = agents;
  snapshot.activeTeamId = 'team-remote';
  snapshot.activeAgentId = agents[0]?.id ?? null;
  return snapshot;
}

export function createWorkItem(): WorkItem {
  return {
    provider: 'github',
    id: 'github:nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix bug',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    labels: [],
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z',
  };
}

export function createTextMessage(
  id: string,
  agentId: string,
  text: string,
  turnId?: string,
  role: RendererMessage['role'] = 'user',
): RendererMessage {
  return {
    id,
    agentId,
    role,
    ...(turnId ? { turnId } : {}),
    status: 'complete',
    createdAt: '2026-06-13T00:00:00.000Z',
    parts: [{ type: 'text', text }],
  };
}

export function createThreadGoal(threadId: string, objective: string): ThreadGoal {
  return {
    threadId,
    objective,
    status: 'active',
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
