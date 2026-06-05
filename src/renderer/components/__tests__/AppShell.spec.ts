import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AppShell from '../AppShell.vue';
import { createInitialSnapshot } from '../../../shared/snapshot';

describe('AppShell', () => {
  it('composes the phase zero shell around the active agent', () => {
    const snapshot = createInitialSnapshot();
    const activeAgent = snapshot.agents[0];

    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: snapshot.messages,
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Codex Claw');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Codex pending');
    expect(wrapper.text()).toContain('Codex Claw is ready for the first native Codex agent.');
    expect(wrapper.text()).toContain('Artifacts');
  });

  it('forwards prompt and folder actions from child surfaces', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.find('.agent-sidebar__folder').trigger('click');
    await wrapper.get('input').setValue('hello');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('selectAgentFolder')).toHaveLength(1);
    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['hello']]);
  });
});
