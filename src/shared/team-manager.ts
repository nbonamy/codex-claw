import type { AppSnapshot, CreateTeamInput, Team } from './contracts';
import { defaultTeamColor, teamColors } from './team-colors';

export function createTeamInSnapshot(snapshot: AppSnapshot, input: CreateTeamInput, createdAt = new Date().toISOString()): Team {
  const name = normalizedTeamName(input.name);
  const color = normalizedTeamColor(input.color);
  const team: Team = {
    id: uniqueTeamId(snapshot, name, createdAt),
    name,
    avatar: teamInitials(name),
    color,
    agentIds: [],
  };

  snapshot.teams.push(team);
  snapshot.activeTeamId = team.id;
  snapshot.activeAgentId = null;
  return team;
}

export function selectTeam(snapshot: AppSnapshot, teamId: string): AppSnapshot {
  const team = snapshot.teams.find((candidate) => candidate.id === teamId);
  if (!team) {
    return snapshot;
  }

  snapshot.activeTeamId = team.id;
  const activeAgentId = team.activeAgentId && team.agentIds.includes(team.activeAgentId)
    ? team.activeAgentId
    : team.agentIds[0] ?? null;
  snapshot.activeAgentId = activeAgentId;
  if (activeAgentId) {
    team.activeAgentId = activeAgentId;
  }
  return snapshot;
}

export function teamInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}

function normalizedTeamName(name: string): string {
  return name.trim() || 'Team';
}

function normalizedTeamColor(color: string): string {
  const normalized = color.trim().toUpperCase();
  return teamColors.find((candidate) => candidate === normalized) ?? defaultTeamColor;
}

function uniqueTeamId(snapshot: AppSnapshot, name: string, createdAt: string): string {
  const baseId = `team-${slug(name)}-${createdAt.replace(/\W/g, '').toLowerCase()}`;
  if (!snapshot.teams.some((team) => team.id === baseId)) {
    return baseId;
  }

  let counter = 2;
  while (snapshot.teams.some((team) => team.id === `${baseId}-${counter}`)) {
    counter += 1;
  }
  return `${baseId}-${counter}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'team';
}
