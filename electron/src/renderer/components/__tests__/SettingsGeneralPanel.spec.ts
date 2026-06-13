import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import type { SystemPermissionsStatus } from '@codex-claw/shared/contracts';
import { defaultGeneralSettings } from '@codex-claw/shared/settings';
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

  it('chooses and clears the configured source folder', async () => {
    const chooseSourceFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src');
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      chooseSourceFolder,
      sourceFolder: {
        path: '',
        initialized: true,
        recentRepoNames: [],
      },
      updateSettings,
    });

    await flushPromises();
    expect(wrapper.text()).toContain('Source folder');
    expect(wrapper.text()).toContain('Not configured');

    await wrapper.findAll('button').find((button) => button.text() === 'Choose')?.trigger('click');
    await flushPromises();

    expect(updateSettings).toHaveBeenCalledWith({
      sourceFolder: {
        path: '/Users/nbonamy/src',
      },
    });

    const configuredSourceFolder = {
      sourceFolder: {
        path: '~/src',
        initialized: true,
        recentRepoNames: ['codex-claw'],
      },
    };
    await wrapper.setProps(configuredSourceFolder as never);
    await wrapper.findAll('button').find((button) => button.text() === 'Clear')?.trigger('click');

    expect(updateSettings).toHaveBeenCalledWith({
      sourceFolder: {
        path: '',
      },
    });
  });

  it('surfaces source folder chooser failures', async () => {
    const wrapper = mountPanel({
      chooseSourceFolder: vi.fn().mockRejectedValue(new Error('Dialog failed')),
      sourceFolder: {
        path: '',
        initialized: true,
        recentRepoNames: [],
      },
    });

    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Choose')?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Dialog failed');
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
