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
  repositoryKey?: string;
  sessions: WorkspaceSidebarSession[];
};

export function repositoryIconForAgent(
  agent: Agent | null | undefined,
  repositoryIcons: Readonly<Record<string, string>>,
): string | undefined {
  const workspace = agent?.workspace;
  if (workspace?.kind !== 'git') return undefined;

  const keys = [workspace.originUrl?.trim(), workspace.primaryWorktreeRoot, workspace.repositoryRoot]
    .filter((key): key is string => Boolean(key));
  for (const key of keys) {
    const icon = repositoryIcons[key];
    if (icon) return icon;
  }
  return undefined;
}

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
            repositoryKey: workspace.originUrl?.trim() || workspace.primaryWorktreeRoot,
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

    const agentName = agent.name.trim();
    const sessionLabel = agentName || (isGit ? workspace.branch ?? 'Detached HEAD' : folderBasename(agent.folder));
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

  return [...groups.values()];
}

function workspaceSessionKind(agent: Agent): WorkspaceSidebarSession['kind'] {
  const workspace = agent.workspace;
  if (workspace?.kind !== 'git') return 'folder';
  if (!workspace.branch) return 'detached';
  if (workspace.isLinkedWorktree) return 'worktree';
  return workspace.branch === 'main' || workspace.branch === 'master' ? 'main' : 'branch';
}

function folderBasename(folder: string): string {
  return folder.replace(/\\/gu, '/').split('/').filter(Boolean).at(-1) ?? folder;
}
