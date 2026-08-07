import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { defaultAppshotSettings } from '@codex-claw/core/settings';
import SettingsAppshotsPanel from '../SettingsAppshotsPanel.vue';

describe('SettingsAppshotsPanel', () => {
  it('configures the modifier chord and sound', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsAppshotsPanel, {
      props: { settings: defaultAppshotSettings, updateSettings },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.text()).toContain('Take an Appshot to show Codex your frontmost window');
    expect(wrapper.text()).toContain('Press both Command keys simultaneously');
    expect(wrapper.findAllComponents({ name: 'ElOption' }).some((option) => option.props('label') === 'Active agent')).toBe(true);

    await wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 'option');
    await wrapper.findComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', false);

    expect(updateSettings).toHaveBeenCalledWith({
      general: { appshots: { ...defaultAppshotSettings, hotkey: 'option' } },
    });
    expect(updateSettings).toHaveBeenCalledWith({
      general: { appshots: { ...defaultAppshotSettings, playSound: false } },
    });
  });
});
