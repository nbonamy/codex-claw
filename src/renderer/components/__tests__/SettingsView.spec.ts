import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import SettingsView from '../SettingsView.vue';
import { defaultThemeSettings } from '../../../shared/settings';

describe('SettingsView', () => {
  it('opens on appearance and emits appearance updates', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        updateSettings,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findComponent({ name: 'ElSegmented' }).vm.$emit('update:modelValue', 'dark');
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'github-dark');
    await wrapper.findAllComponents({ name: 'ElInputNumber' })[0].vm.$emit('update:modelValue', 17);

    expect(updateSettings).toHaveBeenCalledWith({ theme: { mode: 'dark', id: 'codex-claw-dark' } });
    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark' } });
    expect(updateSettings).toHaveBeenCalledWith({ theme: { chatFontSize: 17 } });
  });

  it('keeps the empty general tab reachable', async () => {
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'General')?.trigger('click');

    expect(wrapper.text()).toContain('No general settings yet.');
  });
});
