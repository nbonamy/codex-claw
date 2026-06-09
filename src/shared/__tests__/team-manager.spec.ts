import { describe, expect, it } from 'vitest';
import { createEmptySnapshot, createInitialSnapshot } from '../snapshot';
import { closeTeamInSnapshot, createTeamInSnapshot, reorderTeamInSnapshot, selectTeam, teamInitials, updateTeamInSnapshot } from '../team-manager';

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

  it('selects a remembered active agent when the team still contains it', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0].activeAgentId = 'agent-jesse';

    selectTeam(snapshot, 'team-codex-claw');

    expect(snapshot.activeAgentId).toBe('agent-jesse');
  });

  it('ignores missing team selection and repairs stale active agent ids', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0].activeAgentId = 'missing-agent';

    selectTeam(snapshot, 'missing-team');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.activeAgentId).toBe('agent-dina');

    selectTeam(snapshot, 'team-codex-claw');
    expect(snapshot.activeAgentId).toBe('agent-dina');
    expect(snapshot.teams[0].activeAgentId).toBe('agent-dina');
  });

  it('updates team identity while keeping membership', () => {
    const snapshot = createInitialSnapshot();

    expect(updateTeamInSnapshot(snapshot, {
      id: 'team-codex-claw',
      name: ' Skwad Core ',
      color: '#46A857',
    })).toStrictEqual({
      id: 'team-codex-claw',
      name: 'Skwad Core',
      avatar: 'SC',
      color: '#46A857',
      agentIds: ['agent-dina', 'agent-jesse'],
    });
  });

  it('reorders teams before a target or to the end without changing selection', () => {
    const snapshot = createInitialSnapshot();
    const skwadTeam = createTeamInSnapshot(snapshot, {
      name: 'Skwad',
      color: '#46A857',
    }, '2026-06-05T10:11:12.000Z');
    const toolsTeam = createTeamInSnapshot(snapshot, {
      name: 'Tools',
      color: '#0093FF',
    }, '2026-06-05T10:11:13.000Z');
    selectTeam(snapshot, 'team-codex-claw');

    expect(reorderTeamInSnapshot(snapshot, toolsTeam.id, 'team-codex-claw')).toStrictEqual(toolsTeam);
    expect(snapshot.teams.map((team) => team.id)).toStrictEqual([toolsTeam.id, 'team-codex-claw', skwadTeam.id]);
    expect(snapshot.activeTeamId).toBe('team-codex-claw');

    expect(reorderTeamInSnapshot(snapshot, toolsTeam.id, null)).toStrictEqual(toolsTeam);
    expect(snapshot.teams.map((team) => team.id)).toStrictEqual(['team-codex-claw', skwadTeam.id, toolsTeam.id]);
  });

  it('keeps team order unchanged when dropping a team onto itself', () => {
    const snapshot = createInitialSnapshot();

    expect(reorderTeamInSnapshot(snapshot, 'team-codex-claw', 'team-codex-claw')).toStrictEqual(snapshot.teams[0]);
    expect(snapshot.teams.map((team) => team.id)).toStrictEqual(['team-codex-claw']);
  });

  it('ignores missing team reorder targets', () => {
    const snapshot = createInitialSnapshot();

    expect(reorderTeamInSnapshot(snapshot, 'missing-team', null)).toBeNull();
    expect(reorderTeamInSnapshot(snapshot, 'team-codex-claw', 'missing-team')).toBeNull();
    expect(snapshot.teams.map((team) => team.id)).toStrictEqual(['team-codex-claw']);
  });

  it('closes a team with its agents and selects the next team', () => {
    const snapshot = createInitialSnapshot();
    const skwadTeam = createTeamInSnapshot(snapshot, {
      name: 'Skwad',
      color: '#46A857',
    }, '2026-06-05T10:11:12.000Z');
    selectTeam(snapshot, 'team-codex-claw');

    expect(closeTeamInSnapshot(snapshot, 'team-codex-claw')).toMatchObject({ id: 'team-codex-claw' });
    expect(snapshot.teams.map((team) => team.id)).toStrictEqual([skwadTeam.id]);
    expect(snapshot.agents).toStrictEqual([]);
    expect(snapshot.activeTeamId).toBe(skwadTeam.id);
    expect(snapshot.activeAgentId).toBeNull();
  });

  it('closes an inactive team without changing the current active agent', () => {
    const snapshot = createInitialSnapshot();
    const inactiveTeam = createTeamInSnapshot(snapshot, {
      name: 'Skwad',
      color: '#46A857',
    }, '2026-06-05T10:11:12.000Z');
    selectTeam(snapshot, 'team-codex-claw');

    expect(closeTeamInSnapshot(snapshot, inactiveTeam.id)).toMatchObject({ id: inactiveTeam.id });
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.activeAgentId).toBe('agent-dina');
    expect(snapshot.agents.map((agent) => agent.id)).toStrictEqual(['agent-dina', 'agent-jesse']);
  });

  it('keeps one team open and returns null for missing teams', () => {
    const snapshot = createInitialSnapshot();

    expect(updateTeamInSnapshot(snapshot, {
      id: 'missing-team',
      name: 'Missing',
      color: '#46A857',
    })).toBeNull();
    expect(closeTeamInSnapshot({
      ...snapshot,
      teams: [
        ...snapshot.teams,
        {
          id: 'team-other',
          name: 'Other',
          avatar: 'OT',
          color: '#0093FF',
          agentIds: [],
        },
      ],
    }, 'missing-team')).toBeNull();
    expect(() => closeTeamInSnapshot(snapshot, 'team-codex-claw')).toThrow('At least one team must remain open.');
  });

  it('computes short initials for team avatars', () => {
    expect(teamInitials('Codex Claw')).toBe('CC');
    expect(teamInitials('Skwad')).toBe('SK');
    expect(teamInitials('')).toBe('?');
  });
});
