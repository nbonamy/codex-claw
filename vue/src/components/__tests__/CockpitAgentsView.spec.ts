import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import CockpitAgentsView from '../CockpitAgentsView.vue';

describe('CockpitAgentsView', () => {
  it('restores the team-grouped agent Cockpit and routes agent selection', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitAgentsView, {
      props: {
        agents: snapshot.agents,
        teams: snapshot.teams,
      },
    });

    expect(wrapper.findAll('.cockpit-view__agent-card')).toHaveLength(2);
    expect(wrapper.text()).toContain('Codex Claw');
    expect(wrapper.text()).toContain('Dina');

    await wrapper.findAll('.cockpit-view__agent-card')[0]!.trigger('click');

    expect(wrapper.emitted('select-agent')).toStrictEqual([[{
      agentId: 'agent-dina',
      teamId: 'team-codex-claw',
    }]]);
  });

  it('keeps the add-agent affordance inside each team section', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitAgentsView, {
      props: {
        agents: snapshot.agents,
        teams: snapshot.teams,
      },
    });

    await wrapper.get('.cockpit-view__add-card').trigger('click');

    expect(wrapper.emitted('add-agent')).toStrictEqual([['team-codex-claw']]);
  });

  it('shows one recent grid without team creation affordances', () => {
    const snapshot = createInitialSnapshot();
    const agents = snapshot.agents.map((agent, index) => ({
      ...agent,
      updatedAt: index === 0 ? '2026-09-14T12:00:00.000Z' : '2026-09-14T13:00:00.000Z',
    }));
    const wrapper = mount(CockpitAgentsView, {
      props: { agents, mode: 'recent', teams: snapshot.teams },
    });

    expect(wrapper.findAll('.cockpit-agents__team')).toHaveLength(1);
    expect(wrapper.find('.cockpit-agents__team-header').exists()).toBe(false);
    expect(wrapper.find('.cockpit-view__add-card').exists()).toBe(false);
    expect(wrapper.findAll('.cockpit-view__agent-card').map((card) => card.text())).toStrictEqual([
      expect.stringContaining('Jesse'),
      expect.stringContaining('Dina'),
    ]);
    expect(wrapper.text()).toContain('Active');
  });
});
