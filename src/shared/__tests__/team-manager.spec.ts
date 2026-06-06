import { describe, expect, it } from 'vitest';
import { createEmptySnapshot, createInitialSnapshot } from '../snapshot';
import { createTeamInSnapshot, selectTeam, teamInitials } from '../team-manager';

describe('team-manager', () => {
  it('creates a team with initials, selected color, and no default agent', () => {
    const snapshot = createInitialSnapshot();
    const team = createTeamInSnapshot(snapshot, {
      name: ' Skwad Core ',
      color: '#46A857',
    }, '2026-06-05T10:11:12.000Z');

    expect(team).toStrictEqual({
      id: 'team-skwad-core-20260605t101112000z',
      name: 'Skwad Core',
      avatar: 'SC',
      color: '#46A857',
      agentIds: [],
    });
    expect(snapshot.activeTeamId).toBe(team.id);
    expect(snapshot.activeAgentId).toBeNull();
  });

  it('falls back to the default color for invalid colors', () => {
    const snapshot = createEmptySnapshot();

    expect(createTeamInSnapshot(snapshot, {
      name: 'Mystery',
      color: '#badbad',
    }, '2026-06-05T10:11:12.000Z').color).toBe('#1B4FB2');
  });

  it('selects the team active agent or leaves an empty team agentless', () => {
    const snapshot = createInitialSnapshot();
    const emptyTeam = createTeamInSnapshot(snapshot, {
      name: 'Empty',
      color: '#0093FF',
    }, '2026-06-05T10:11:12.000Z');

    selectTeam(snapshot, 'team-codex-claw');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.activeAgentId).toBe('agent-dina');

    selectTeam(snapshot, emptyTeam.id);
    expect(snapshot.activeTeamId).toBe(emptyTeam.id);
    expect(snapshot.activeAgentId).toBeNull();
  });

  it('computes short initials for team avatars', () => {
    expect(teamInitials('Codex Claw')).toBe('CC');
    expect(teamInitials('Skwad')).toBe('SK');
    expect(teamInitials('')).toBe('?');
  });
});
