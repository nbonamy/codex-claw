import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
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
      global: { plugins: [ElementPlus] },
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
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('.cockpit-view__add-card').trigger('click');

    expect(wrapper.emitted('add-agent')).toStrictEqual([['team-codex-claw']]);
  });
});
