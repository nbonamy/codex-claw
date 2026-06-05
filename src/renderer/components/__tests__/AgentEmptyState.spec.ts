import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentEmptyState from '../AgentEmptyState.vue';

describe('AgentEmptyState', () => {
  it('shows the first-run empty state and emits new-agent from the CTA', async () => {
    const wrapper = mount(AgentEmptyState, {
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Welcome to Codex Claw!');
    expect(wrapper.text()).toContain('Add an agent to your team');

    await wrapper.get('.agent-empty-state__new').trigger('click');

    expect(wrapper.emitted('new-agent')).toStrictEqual([[]]);
  });
});
