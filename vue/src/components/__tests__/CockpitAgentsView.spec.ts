import { product } from '@workspace/core/product';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import CockpitAgentsView from '../CockpitAgentsView.vue';

describe('CockpitAgentsView', () => {
  it('keeps unwired session controls disabled in the Cockpit while routing restart', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backend = 'antigravity';
    agent.backendSession = { kind: 'antigravity', sessionId: 'native-session' };
    const wrapper = mount(CockpitAgentsView, {
      props: { agents: [agent], teams: snapshot.teams },
      global: { stubs: { Teleport: true } },
    });
    try {
      await wrapper.get('.cockpit-view__agent-card').trigger('contextmenu');
      const items = wrapper.findAll('[role="menuitem"]');
      for (const label of ['Compact Session', 'Resume Session']) {
        const item = items.find(item => item.text().startsWith(label))!;
        expect(item.attributes()).toHaveProperty('disabled');
        await item.trigger('click');
      }
      expect(wrapper.emitted('restart-agent')).toBeUndefined();
      await items.find(item => item.text() === 'Restart Agent')!.trigger('click');
      expect(wrapper.emitted('restart-agent')).toStrictEqual([[agent.id]]);
    } finally { wrapper.unmount(); }
  });

  it('restores the team-grouped agent Cockpit and routes agent selection', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitAgentsView, {
      props: {
        agents: snapshot.agents,
        teams: snapshot.teams,
      },
    });

    expect(wrapper.findAll('.cockpit-view__agent-card')).toHaveLength(2);
    expect(wrapper.text()).toContain(product.defaultTeamName);
    expect(wrapper.text()).toContain('Dina');

    await wrapper.findAll('.cockpit-view__agent-card')[0]!.trigger('click');

    expect(wrapper.emitted('select-agent')).toStrictEqual([[{
      agentId: 'agent-dina',
      teamId: 'team-app',
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

    expect(wrapper.emitted('add-agent')).toStrictEqual([['team-app']]);
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
