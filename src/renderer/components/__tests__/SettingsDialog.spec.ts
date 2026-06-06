import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import SettingsDialog from '../SettingsDialog.vue';
import { defaultThemeSettings } from '../../../shared/settings';

describe('SettingsDialog', () => {
  it('opens on appearance and emits appearance updates', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsDialog, {
      props: {
        visible: true,
        settings: defaultThemeSettings,
        updateSettings,
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElDialog: {
            props: ['modelValue'],
            template: '<section v-if="modelValue"><slot name="header" /><slot /></section>',
          },
        },
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

  it('keeps the empty general tab reachable', async () => {
    const wrapper = mount(SettingsDialog, {
      props: {
        visible: true,
        settings: defaultThemeSettings,
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElDialog: {
            props: ['modelValue'],
            template: '<section v-if="modelValue"><slot name="header" /><slot /></section>',
          },
        },
      },
    });

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'General')?.trigger('click');

    expect(wrapper.text()).toContain('No general settings yet.');
  });
});
