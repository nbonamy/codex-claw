import type { Agent, AppSnapshot, BenchTemplate } from './contracts';

export function duplicateAgentInSnapshot(snapshot: AppSnapshot, agentId: string, createdAt = new Date().toISOString()): Agent | null {
  const source = snapshot.agents.find((agent) => agent.id === agentId);
  if (!source) {
    return null;
  }

  const duplicate: Agent = {
    id: uniqueAgentId(snapshot, `${source.name} copy`, createdAt),
    teamId: source.teamId ?? activeTeamId(snapshot),
    name: `${source.name} (copy)`,
    avatar: source.avatar,
    folder: source.folder,
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };

  snapshot.agents.push(duplicate);
  attachAgentToTeam(snapshot, duplicate);
  snapshot.activeAgentId = duplicate.id;
  return duplicate;
}

export function saveAgentToBench(snapshot: AppSnapshot, agentId: string, createdAt = new Date().toISOString()): BenchTemplate | null {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    return null;
  }

  const template: BenchTemplate = {
    id: uniqueBenchId(snapshot, agent.name, createdAt),
    name: agent.name,
    avatar: agent.avatar,
    folder: agent.folder,
    backend: 'codex',
    createdAt,
    updatedAt: createdAt,
  };

  snapshot.bench.push(template);
  return template;
}

export function restartAgentConversation(snapshot: AppSnapshot, agentId: string, updatedAt = new Date().toISOString()): Agent | null {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    return null;
  }

  ensureAgentCanChange(agent, 'Agent must be idle before restarting.');
  clearRuntimeState(agent);
  agent.status = { type: 'idle' };
  agent.updatedAt = updatedAt;
  snapshot.messages = snapshot.messages.filter((message) => message.agentId !== agentId);
  return agent;
}

export function closeAgentInSnapshot(snapshot: AppSnapshot, agentId: string): Agent | null {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    return null;
  }

  ensureAgentCanChange(agent, 'Agent must be idle before closing.');
  snapshot.agents = snapshot.agents.filter((candidate) => candidate.id !== agentId);
  snapshot.messages = snapshot.messages.filter((message) => message.agentId !== agentId);

  for (const team of snapshot.teams) {
    team.agentIds = team.agentIds.filter((candidate) => candidate !== agentId);
    if (team.activeAgentId === agentId) {
      team.activeAgentId = team.agentIds[0];
    }
  }

  if (snapshot.activeAgentId === agentId) {
    const sameTeamNextAgent = snapshot.agents.find((candidate) => candidate.teamId === agent.teamId);
    snapshot.activeAgentId = sameTeamNextAgent?.id ?? snapshot.agents[0]?.id ?? null;
  }

  return agent;
}

function ensureAgentCanChange(agent: Agent, message: string): void {
  if (agent.status.type !== 'idle') {
    throw new Error(message);
  }
}

function clearRuntimeState(agent: Agent): void {
  delete agent.codexThreadId;
  delete agent.isRegistered;
  delete agent.mcpSessionId;
  delete agent.statusText;
}

function attachAgentToTeam(snapshot: AppSnapshot, agent: Agent): void {
  const team = snapshot.teams.find((candidate) => candidate.id === agent.teamId) ?? snapshot.teams[0];
  if (!team) {
    return;
  }

  agent.teamId = team.id;
  if (!team.agentIds.includes(agent.id)) {
    team.agentIds.push(agent.id);
  }
  team.activeAgentId = agent.id;
}

function activeTeamId(snapshot: AppSnapshot): string | undefined {
  const activeAgent = snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId);
  return activeAgent?.teamId ?? snapshot.teams[0]?.id;
}

function uniqueAgentId(snapshot: AppSnapshot, name: string, createdAt: string): string {
  return uniqueId(snapshot.agents.map((agent) => agent.id), `agent-${slug(name)}-${timestampSlug(createdAt)}`);
}

function uniqueBenchId(snapshot: AppSnapshot, name: string, createdAt: string): string {
  return uniqueId(snapshot.bench.map((template) => template.id), `bench-${slug(name)}-${timestampSlug(createdAt)}`);
}

function uniqueId(existingIds: string[], baseId: string): string {
  if (!existingIds.includes(baseId)) {
    return baseId;
  }

  let counter = 2;
  while (existingIds.includes(`${baseId}-${counter}`)) {
    counter += 1;
  }
  return `${baseId}-${counter}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'agent';
}

function timestampSlug(value: string): string {
  return value.replace(/\W/g, '').toLowerCase();
}
