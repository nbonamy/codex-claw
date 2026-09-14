import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { projectCockpitAgentSections } from '../cockpit-agent-layout';

describe('projectCockpitAgentSections', () => {
  it('preserves team and agent ordering in Teams mode', () => {
    const snapshot = createInitialSnapshot();

    const sections = projectCockpitAgentSections({
      agents: snapshot.agents,
      mode: 'teams',
      teams: snapshot.teams,
    });

    expect(sections.map((section) => ({
      agentIds: section.agents.map((agent) => agent.id),
      id: section.id,
    }))).toStrictEqual(snapshot.teams.map((team) => ({
      agentIds: team.agentIds,
      id: team.id,
    })));
  });

  it('returns one globally recent section ordered by agent activity', () => {
    const snapshot = createInitialSnapshot();
    const agents = snapshot.agents.map((agent, index) => ({
      ...agent,
      lastActivityAt: index === 0 ? '2026-09-14T12:00:00.000Z' : '2026-09-14T13:00:00.000Z',
      updatedAt: index === 0 ? '2026-09-14T14:00:00.000Z' : '2026-09-14T13:00:00.000Z',
    }));

    const sections = projectCockpitAgentSections({ agents, mode: 'recent', teams: snapshot.teams });

    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe('recent');
    expect(sections[0]?.team).toBeNull();
    expect(sections[0]?.agents.map((agent) => agent.id)).toStrictEqual([
      agents[1]?.id,
      agents[0]?.id,
    ]);
  });
});
