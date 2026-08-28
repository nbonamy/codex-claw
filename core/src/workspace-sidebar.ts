import type { Agent, AgentStatus } from './contracts';

export type WorkspaceSidebarSession = {
  agentId: string;
  title: string;
  displayTitle: string;
  branch: string | null;
  folder: string;
  isLinkedWorktree: boolean;
  kind: 'main' | 'branch' | 'worktree' | 'detached' | 'folder';
  isActive: boolean;
  isUnread: boolean;
  status: AgentStatus;
  quickSwitchIndex: number;
};

export type WorkspaceSidebarGroup = {
  id: string;
  kind: 'repository' | 'quickChats';
  label: string;
  repositoryRoot?: string;
  sessions: WorkspaceSidebarSession[];
};

export function projectWorkspaceSidebar(input: {
  agents: readonly Agent[];
  activeAgentId: string | null;
  unreadAgentIds?: readonly string[];
}): WorkspaceSidebarGroup[] {
  const unreadIds = new Set(input.unreadAgentIds ?? []);
  const groups = new Map<string, WorkspaceSidebarGroup>();

  input.agents.forEach((agent, quickSwitchIndex) => {
    const workspace = agent.workspace;
    const isGit = workspace?.kind === 'git';
    const id = isGit ? `git:${workspace.primaryWorktreeRoot}` : 'quick-chats';
    let group = groups.get(id);
    if (!group) {
      group = isGit
        ? {
            id,
            kind: 'repository',
            label: workspace.repositoryName,
            repositoryRoot: workspace.primaryWorktreeRoot,
            sessions: [],
          }
        : {
            id,
            kind: 'quickChats',
            label: 'Quick chats',
            sessions: [],
          };
      groups.set(id, group);
    }

    const sessionLabel = isGit ? workspace.branch ?? 'Detached HEAD' : agent.name;
    group.sessions.push({
      agentId: agent.id,
      title: agent.name,
      displayTitle: sessionLabel,
      branch: isGit ? workspace.branch : null,
      folder: agent.folder,
      isLinkedWorktree: isGit && workspace.isLinkedWorktree,
      kind: workspaceSessionKind(agent),
      isActive: agent.id === input.activeAgentId,
      isUnread: unreadIds.has(agent.id),
      status: { ...agent.status },
      quickSwitchIndex,
    });
  });

  const projected = [...groups.values()];
  for (const group of projected) disambiguateSessionTitles(group.sessions);
  return projected;
}

function workspaceSessionKind(agent: Agent): WorkspaceSidebarSession['kind'] {
  const workspace = agent.workspace;
  if (workspace?.kind !== 'git') return 'folder';
  if (!workspace.branch) return 'detached';
  if (workspace.isLinkedWorktree) return 'worktree';
  return workspace.branch === 'main' || workspace.branch === 'master' ? 'main' : 'branch';
}

function disambiguateSessionTitles(sessions: WorkspaceSidebarSession[]): void {
  const titleCounts = new Map<string, number>();
  for (const session of sessions) {
    titleCounts.set(session.displayTitle, (titleCounts.get(session.displayTitle) ?? 0) + 1);
  }
  for (const session of sessions) {
    if ((titleCounts.get(session.displayTitle) ?? 0) < 2) continue;
    session.displayTitle = `${session.displayTitle} · ${session.title || folderBasename(session.folder)}`;
  }
}

function folderBasename(folder: string): string {
  return folder.replace(/\\/gu, '/').split('/').filter(Boolean).at(-1) ?? folder;
}
