import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AppShell from '../AppShell.vue';
import { createInitialSnapshot } from '../../../main/snapshot-service';

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
});
