import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentEmptyState from '../AgentEmptyState.vue';

describe('AgentEmptyState', () => {
  it('shows the canonical project acquisition menu inline and forwards each selection', async () => {
    const wrapper = mount(AgentEmptyState, {
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Welcome to Codex Claw');
    expect(wrapper.text()).toContain('Choose a source to start a session');
    expect(wrapper.get('.agent-empty-state__mark img').attributes('alt')).toBe('Codex Claw');
    expect(wrapper.find('.agent-sidebar__new').exists()).toBe(false);
    expect(wrapper.getComponent({ name: 'AppMenu' }).props('items')).toHaveLength(3);

    const actions = wrapper.findAll('[role="menuitem"]');
    expect(actions.map((action) => action.text())).toStrictEqual([
      'Local folder or repository…',
      'GitHub repository…',
      'Repository URL…',
    ]);

    for (const action of actions) await action.trigger('click');

    expect(wrapper.emitted('start-work')).toStrictEqual([['local'], ['github'], ['url']]);
  });
});
