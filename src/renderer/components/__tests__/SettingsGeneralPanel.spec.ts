import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import type { SystemPermissionsStatus } from '../../../shared/contracts';
import { defaultGeneralSettings } from '../../../shared/settings';
import SettingsGeneralPanel from '../SettingsGeneralPanel.vue';

describe('SettingsGeneralPanel', () => {
  it('updates the prevent sleep setting', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ updateSettings });

    await flushPromises();
    await wrapper.findComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', false);

    expect(wrapper.text()).toContain('Prevent sleep while agents run');
    expect(updateSettings).toHaveBeenCalledWith({
      general: {
        preventSleepWhenAgentsRun: false,
      },
    });
  });

  it('shows a grant action when macOS Accessibility is required', async () => {
    const getSystemPermissions = vi.fn().mockResolvedValue(permissionStatus({
      required: true,
      trusted: false,
    }));
    const openAccessibilitySettings = vi.fn().mockResolvedValue(permissionStatus({
      required: true,
      trusted: true,
    }));
    const wrapper = mountPanel({ getSystemPermissions, openAccessibilitySettings });

    await flushPromises();

    expect(wrapper.text()).toContain('System permissions');
    expect(wrapper.text()).toContain('Accessibility');
    expect(wrapper.text()).toContain('Required');

    await wrapper.findAll('button').find((button) => button.text() === 'Grant')?.trigger('click');
    await flushPromises();

    expect(openAccessibilitySettings).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Granted');
  });

  it('shows non-macOS permission status without an action', async () => {
    const getSystemPermissions = vi.fn().mockResolvedValue({
      platform: 'linux',
      accessibility: {
        required: false,
        trusted: true,
      },
    } satisfies SystemPermissionsStatus);
    const wrapper = mountPanel({ getSystemPermissions });

    await flushPromises();

    expect(wrapper.text()).toContain('Not needed');
    expect(wrapper.findAll('button').map((button) => button.text())).toStrictEqual([]);
  });
});

function mountPanel(props: Record<string, unknown>) {
  return mount(SettingsGeneralPanel, {
    props: {
      settings: defaultGeneralSettings,
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

function permissionStatus(accessibility: SystemPermissionsStatus['accessibility']): SystemPermissionsStatus {
  return {
    platform: 'darwin',
    accessibility,
  };
}
