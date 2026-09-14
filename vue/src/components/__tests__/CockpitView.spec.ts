import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import CockpitAgentsView from '../CockpitAgentsView.vue';
import CockpitView from '../CockpitView.vue';

describe('CockpitView', () => {
  it('shows all agents grouped by team by default', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitView, {
      props: { agents: snapshot.agents, teams: snapshot.teams, viewMode: 'teams' },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.get('h1').text()).toBe('Agents');
    expect(wrapper.get('.agent-cockpit__header span').text()).toBe(String(snapshot.agents.length));
    expect(wrapper.findComponent(CockpitAgentsView).props('mode')).toBe('teams');
  });

  it('switches the overview to recent activity without leaving the Cockpit', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitView, {
      props: { agents: snapshot.agents, teams: snapshot.teams, viewMode: 'teams' },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');

    expect(wrapper.emitted('update-view-mode')).toStrictEqual([['recent']]);
    expect(wrapper.findComponent(CockpitAgentsView).props('mode')).toBe('teams');

    await wrapper.setProps({ viewMode: 'recent' });
    expect(wrapper.findComponent(CockpitAgentsView).props('mode')).toBe('recent');
  });
});
