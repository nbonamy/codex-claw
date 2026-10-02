import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettingsClaudeCodePanel from '../SettingsClaudeCodePanel.vue';

describe('SettingsClaudeCodePanel', () => {
  it('connects first, then offers an enable toggle without losing its connection when disabled', async () => {
    const setEnabled = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsClaudeCodePanel, { props: { setEnabled } });
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('connect')).toHaveLength(1);
    await wrapper.setProps({ connected: true });
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
    await wrapper.get('input').setValue(false);
    await flushPromises();
    expect(setEnabled).toHaveBeenCalledWith(false);
    await wrapper.setProps({ enabled: false });
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
    expect(wrapper.find('button').exists()).toBe(false);
    await wrapper.get('input').setValue(true);
    expect(setEnabled).toHaveBeenLastCalledWith(true);
  });
});
