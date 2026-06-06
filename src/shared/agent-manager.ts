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
    backend: source.backend,
    backendDefaults: source.backendDefaults ? { ...source.backendDefaults } : undefined,
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };

  snapshot.agents.push(duplicate);
  attachAgentToTeam(snapshot, duplicate);
  snapshot.activeTeamId = duplicate.teamId ?? snapshot.activeTeamId;
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
    backend: agent.backend,
    backendDefaults: agent.backendDefaults ? { ...agent.backendDefaults } : undefined,
    createdAt,
    updatedAt: createdAt,
  };

  snapshot.bench.push(template);
  return template;
}

export function deployBenchTemplateInSnapshot(snapshot: AppSnapshot, templateId: string, teamId?: string, createdAt = new Date().toISOString()): Agent | null {
  const template = snapshot.bench.find((candidate) => candidate.id === templateId);
  const targetTeam = teamId
    ? snapshot.teams.find((team) => team.id === teamId)
    : snapshot.teams.find((team) => team.id === snapshot.activeTeamId) ?? snapshot.teams[0];
  if (!template || !targetTeam) {
    return null;
  }

  const agent: Agent = {
    id: uniqueAgentId(snapshot, template.name, createdAt),
    teamId: targetTeam.id,
    name: template.name,
    avatar: template.avatar,
    folder: template.folder,
    backend: template.backend,
    backendDefaults: template.backendDefaults ? { ...template.backendDefaults } : undefined,
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };

  snapshot.agents.push(agent);
  attachAgentToTeam(snapshot, agent);
  snapshot.activeTeamId = targetTeam.id;
  snapshot.activeAgentId = agent.id;
  return agent;
}

export function removeBenchTemplateFromSnapshot(snapshot: AppSnapshot, templateId: string): BenchTemplate | null {
  const template = snapshot.bench.find((candidate) => candidate.id === templateId);
  if (!template) {
    return null;
  }

  snapshot.bench = snapshot.bench.filter((candidate) => candidate.id !== templateId);
  return template;
}

export function moveAgentToTeamInSnapshot(snapshot: AppSnapshot, agentId: string, teamId: string, updatedAt = new Date().toISOString()): Agent | null {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  const targetTeam = snapshot.teams.find((candidate) => candidate.id === teamId);
  if (!agent || !targetTeam) {
    return null;
  }

  ensureAgentCanChange(agent, 'Agent must be idle before moving.');
  for (const team of snapshot.teams) {
    team.agentIds = team.agentIds.filter((candidate) => candidate !== agentId);
    if (team.activeAgentId === agentId) {
      team.activeAgentId = team.agentIds[0];
    }
  }

  agent.teamId = targetTeam.id;
  agent.updatedAt = updatedAt;
  if (!targetTeam.agentIds.includes(agent.id)) {
    targetTeam.agentIds.push(agent.id);
  }
  targetTeam.activeAgentId = agent.id;
  snapshot.activeTeamId = targetTeam.id;
  snapshot.activeAgentId = agent.id;

  return agent;
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

  if (snapshot.activeTeamId === agent.teamId && snapshot.activeAgentId) {
    const activeAgent = snapshot.agents.find((candidate) => candidate.id === snapshot.activeAgentId);
    snapshot.activeTeamId = activeAgent?.teamId ?? snapshot.activeTeamId;
  }

  return agent;
}

function ensureAgentCanChange(agent: Agent, message: string): void {
  if (agent.status.type !== 'idle') {
    throw new Error(message);
  }
}

function clearRuntimeState(agent: Agent): void {
  delete agent.backendSession;
  delete agent.contextUsage;
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
  if (snapshot.activeTeamId) {
    return snapshot.activeTeamId;
  }

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
