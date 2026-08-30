import type { Agent } from './contracts';

export function agentFolder(agent: Pick<Agent, 'folder'>): string | undefined {
  return agent.folder?.trim() || undefined;
}

export function requireAgentFolder(agent: Pick<Agent, 'folder'>): string {
  const folder = agentFolder(agent);
  if (!folder) throw new Error('This session does not have a project workspace.');
  return folder;
}
