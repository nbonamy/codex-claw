import type { Agent, AgentWorkspaceIdentity } from './contracts';

export function agentDisplayName(agent: Pick<Agent, 'name' | 'folder' | 'workspace'>): string {
  const customName = agent.name?.trim();
  if (customName) return customName;

  if (agent.workspace?.kind === 'git') {
    return gitWorkspaceDisplayName(agent.workspace);
  }

  return folderBasename(agent.folder) || 'Codex';
}

function gitWorkspaceDisplayName(workspace: Extract<AgentWorkspaceIdentity, { kind: 'git' }>): string {
  const branch = workspace.branch;
  if (!branch) return 'Detached HEAD';

  const repositoryPrefix = `${workspace.repositoryName}-`;
  const withoutRepositoryPrefix = branch.startsWith(repositoryPrefix) ? branch.slice(repositoryPrefix.length) : branch;
  return withoutRepositoryPrefix || branch;
}

function folderBasename(folder: string): string {
  return folder.replace(/\\/gu, '/').split('/').filter(Boolean).at(-1) ?? folder;
}
