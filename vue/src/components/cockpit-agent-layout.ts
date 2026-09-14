import type { Agent, CockpitAgentViewMode, Team } from '@codex-claw/core/contracts';

export type CockpitAgentSection = {
  agents: Agent[];
  id: string;
  team: Team | null;
};

export function projectCockpitAgentSections(input: {
  agents: Agent[];
  mode: CockpitAgentViewMode;
  teams: Team[];
}): CockpitAgentSection[] {
  if (input.mode === 'recent') {
    return [{
      agents: [...input.agents].sort(compareRecentAgents),
      id: 'recent',
      team: null,
    }];
  }

  const agentsById = new Map(input.agents.map((agent) => [agent.id, agent]));
  return input.teams.map((team) => ({
    agents: team.agentIds
      .map((agentId) => agentsById.get(agentId))
      .filter((agent): agent is Agent => Boolean(agent)),
    id: team.id,
    team,
  }));
}

function compareRecentAgents(left: Agent, right: Agent): number {
  const working = Number(right.status.type === 'working') - Number(left.status.type === 'working');
  if (working !== 0) return working;

  const updatedAt = Date.parse(right.lastActivityAt ?? right.updatedAt)
    - Date.parse(left.lastActivityAt ?? left.updatedAt);
  if (Number.isFinite(updatedAt) && updatedAt !== 0) return updatedAt;

  const name = (left.name ?? left.conversationTitle ?? left.id).localeCompare(
    right.name ?? right.conversationTitle ?? right.id,
    undefined,
    { numeric: true, sensitivity: 'base' },
  );
  return name || left.id.localeCompare(right.id);
}
