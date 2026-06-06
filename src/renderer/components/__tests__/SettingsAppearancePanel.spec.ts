import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import SettingsAppearancePanel from '../SettingsAppearancePanel.vue';
import { defaultThemeSettings } from '../../../shared/settings';

describe('SettingsAppearancePanel', () => {
  it('emits appearance setting updates', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsAppearancePanel, {
      props: {
        settings: defaultThemeSettings,
        updateSettings,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('UI font size');
    await wrapper.findComponent({ name: 'ElSegmented' }).vm.$emit('update:modelValue', 'dark');
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'github-dark');
    await wrapper.findAllComponents({ name: 'ElInputNumber' })[1].vm.$emit('update:modelValue', 17);

    expect(updateSettings).toHaveBeenCalledWith({ theme: { mode: 'dark', id: 'codex-claw-dark' } });
    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark' } });
    expect(updateSettings).toHaveBeenCalledWith({ theme: { chatFontSize: 17 } });
  });

  it('ignores invalid mode and numeric updates', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsAppearancePanel, {
      props: {
        settings: defaultThemeSettings,
        updateSettings,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findComponent({ name: 'ElSegmented' }).vm.$emit('update:modelValue', 'neon');
    await wrapper.findAllComponents({ name: 'ElInputNumber' })[0].vm.$emit('update:modelValue', null);

    expect(updateSettings).not.toHaveBeenCalled();
  });
});
