import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClawdDaemonStatus, SystemPermissionsStatus } from '@codex-claw/core/contracts';
import { defaultGeneralSettings } from '@codex-claw/core/settings';
import SettingsGeneralPanel from '../SettingsGeneralPanel.vue';

describe('SettingsGeneralPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('toggles the background service through Settings', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    let resolveInstall: () => void = () => undefined;
    const installing = new Promise<void>((resolve) => {
      resolveInstall = resolve;
    });
    const setDaemonEnabled = vi.fn().mockReturnValue(installing);
    const wrapper = mountPanel({
      daemonStatus: daemonStatus({ installed: false, running: false }),
      setDaemonEnabled,
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Keep Codex Claw ready in the background');
    expect(wrapper.text()).toContain('Off');

    const switches = wrapper.findAllComponents({ name: 'ElSwitch' });
    await switches[1].vm.$emit('update:modelValue', true);
    await wrapper.vm.$nextTick();

    expect(setDaemonEnabled).toHaveBeenCalledWith(true);
    expect(wrapper.text()).toContain('Installing...');
    expect(wrapper.find('.settings-general-panel__spinner').exists()).toBe(true);

    resolveInstall();
    await flushPromises();

    expect(wrapper.text()).not.toContain('Installing...');
    expect(confirm).toHaveBeenCalledWith(
      'Codex Claw needs to restart to connect to the background agent.',
      'Restart Codex Claw?',
      expect.objectContaining({
        cancelButtonText: 'Later',
        confirmButtonText: 'Restart now',
      }),
    );
  });

  it('uses a green status dot when the daemon is installed', async () => {
    const wrapper = mountPanel({
      daemonStatus: daemonStatus({ installed: true, running: false }),
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Installed');
    expect(wrapper.find('.settings-general-panel__status-icon--ok').exists()).toBe(true);
  });

  it('shows a loading indicator while uninstalling the daemon', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    let resolveUninstall: () => void = () => undefined;
    const uninstalling = new Promise<void>((resolve) => {
      resolveUninstall = resolve;
    });
    const setDaemonEnabled = vi.fn().mockReturnValue(uninstalling);
    const wrapper = mountPanel({
      daemonStatus: daemonStatus({ installed: true, running: true }),
      setDaemonEnabled,
    });

    await flushPromises();

    const switches = wrapper.findAllComponents({ name: 'ElSwitch' });
    await switches[1].vm.$emit('update:modelValue', false);
    await wrapper.vm.$nextTick();

    expect(setDaemonEnabled).toHaveBeenCalledWith(false);
    expect(wrapper.text()).toContain('Uninstalling...');
    expect(wrapper.find('.settings-general-panel__spinner').exists()).toBe(true);

    resolveUninstall();
    await flushPromises();

    expect(wrapper.text()).not.toContain('Uninstalling...');
  });

  it('restarts the app when the user accepts the daemon restart dialog', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const restartApp = vi.fn().mockResolvedValue(undefined);
    const setDaemonEnabled = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      daemonStatus: daemonStatus({ installed: false, running: false }),
      restartApp,
      setDaemonEnabled,
    });

    await flushPromises();
    const switches = wrapper.findAllComponents({ name: 'ElSwitch' });
    await switches[1].vm.$emit('update:modelValue', true);
    await flushPromises();

    expect(setDaemonEnabled).toHaveBeenCalledWith(true);
    expect(restartApp).toHaveBeenCalledOnce();
  });

  it('keeps the app running when the user postpones the daemon restart dialog', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const restartApp = vi.fn().mockResolvedValue(undefined);
    const setDaemonEnabled = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      daemonStatus: daemonStatus({ installed: true, running: true }),
      restartApp,
      setDaemonEnabled,
    });

    await flushPromises();
    const switches = wrapper.findAllComponents({ name: 'ElSwitch' });
    await switches[1].vm.$emit('update:modelValue', false);
    await flushPromises();

    expect(setDaemonEnabled).toHaveBeenCalledWith(false);
    expect(restartApp).not.toHaveBeenCalled();
  });

  it('disables daemon installation when the desktop adapter reports unsupported status', async () => {
    const wrapper = mountPanel({
      daemonStatus: daemonStatus({
        supported: false,
        detail: 'No packaged clawd runtime was found.',
      }),
      daemonStatusError: 'No packaged clawd runtime was found.',
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Unavailable');
    expect(wrapper.text()).toContain('No packaged clawd runtime was found.');
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })[1].props('disabled')).toBe(true);
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

  it('chooses, edits, and clears the Codex executable path', async () => {
    const chooseCodexBinary = vi.fn().mockResolvedValue('/opt/homebrew/bin/codex');
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      chooseCodexBinary,
      settings: {
        ...defaultGeneralSettings,
        codexBinaryPath: '',
      },
      updateSettings,
    });

    await flushPromises();
    expect(wrapper.text()).toContain('Advanced');
    expect(wrapper.text()).toContain('Codex executable');
    expect(wrapper.text()).toContain('Leave empty to use the bundled Codex.');

    const codexInput = wrapper.find('input[aria-label="Codex executable path"]');
    expect(codexInput.attributes('placeholder')).toBe('Bundled Codex');
    await codexInput.setValue('/usr/local/bin/codex');
    await codexInput.trigger('change');
    expect(updateSettings).toHaveBeenCalledWith({
      general: {
        codexBinaryPath: '/usr/local/bin/codex',
      },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Choose')?.trigger('click');
    await flushPromises();
    expect(chooseCodexBinary).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenCalledWith({
      general: {
        codexBinaryPath: '/opt/homebrew/bin/codex',
      },
    });

    await wrapper.setProps({
      settings: {
        ...defaultGeneralSettings,
        codexBinaryPath: '/opt/homebrew/bin/codex',
      },
    } as never);
    await wrapper.findAll('button').find((button) => button.text() === 'Clear')?.trigger('click');
    expect(updateSettings).toHaveBeenCalledWith({
      general: {
        codexBinaryPath: '',
      },
    });
  });

  it('keeps experimental Claude Code support off by default and allows enabling it', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ updateSettings });

    const claudeSwitch = switchInput(wrapper, 'Enable Claude Code (experimental)');
    expect(wrapper.text()).toContain('Enable Claude Code (experimental)');
    expect(claudeSwitch.element.checked).toBe(false);

    await claudeSwitch.setValue(true);

    expect(updateSettings).toHaveBeenCalledWith({
      general: {
        claudeCodeEnabled: true,
      },
    });
  });

  it('warns before sharing ChatGPT skills and plugins', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const setCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      settings: { ...defaultGeneralSettings, shareCodexSkillsAndPlugins: false },
      setCodexResourceSharing,
    });

    await flushPromises();
    await switchInput(wrapper, 'Share skills and plugins with ChatGPT').setValue(true);
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'You are going to lose all plugins and skills installed only in Codex Claw. Continue?',
      'Share skills and plugins with ChatGPT?',
      expect.objectContaining({ confirmButtonText: 'Continue', cancelButtonText: 'Cancel' }),
    );
    expect(setCodexResourceSharing).toHaveBeenCalledWith({ enabled: true });
  });

  it('copies ChatGPT resources when sharing is turned off with Copy', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const setCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ setCodexResourceSharing });

    await flushPromises();
    await switchInput(wrapper, 'Share skills and plugins with ChatGPT').setValue(false);
    await flushPromises();

    expect(setCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode: 'copy' });
  });

  it('starts fresh when sharing is turned off with Fresh', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const setCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ setCodexResourceSharing });

    await flushPromises();
    await switchInput(wrapper, 'Share skills and plugins with ChatGPT').setValue(false);
    await flushPromises();

    expect(setCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode: 'fresh' });
  });

  it('blocks resource sharing changes while chats are running', async () => {
    const alert = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm' as never);
    const setCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ codexResourceSharingBlocked: true, setCodexResourceSharing });

    await flushPromises();
    await switchInput(wrapper, 'Share skills and plugins with ChatGPT').setValue(false);
    await flushPromises();

    expect(wrapper.text()).toContain('This option cannot be changed while chats are running.');
    expect(alert).toHaveBeenCalledWith(
      'This option cannot be changed while chats are running. Wait for every chat to finish and try again.',
      'Chats are running',
      expect.objectContaining({ confirmButtonText: 'OK' }),
    );
    expect(setCodexResourceSharing).not.toHaveBeenCalled();
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

  it('shows Screen Recording status and grants it through the helper', async () => {
    const getSystemPermissions = vi.fn().mockResolvedValue(permissionStatus(
      { required: true, trusted: true },
      { required: true, trusted: false },
    ));
    const openScreenRecordingSettings = vi.fn().mockResolvedValue(permissionStatus(
      { required: true, trusted: true },
      { required: true, trusted: true },
    ));
    const wrapper = mountPanel({ getSystemPermissions, openScreenRecordingSettings });

    await flushPromises();

    expect(wrapper.text()).toContain('Screen Recording');
    expect(wrapper.text()).toContain('Required for Appshots to capture the frontmost window.');

    const grantButtons = wrapper.findAll('button').filter((button) => button.text() === 'Grant');
    await grantButtons.at(-1)?.trigger('click');
    await flushPromises();

    expect(openScreenRecordingSettings).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Granted');
  });

  it('shows non-macOS permission status without an action', async () => {
    const getSystemPermissions = vi.fn().mockResolvedValue({
      platform: 'linux',
      accessibility: {
        required: false,
        trusted: true,
      },
      screenRecording: {
        required: false,
        trusted: true,
      },
    } satisfies SystemPermissionsStatus);
    const wrapper = mountPanel({ getSystemPermissions });

    await flushPromises();

    expect(wrapper.text()).toContain('Not needed');
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Grant');
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Refresh');
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

function switchInput(wrapper: ReturnType<typeof mountPanel>, label: string) {
  return wrapper.get<HTMLInputElement>(`input[aria-label="${label}"]`);
}

function permissionStatus(
  accessibility: SystemPermissionsStatus['accessibility'],
  screenRecording: SystemPermissionsStatus['screenRecording'] = { required: true, trusted: true },
): SystemPermissionsStatus {
  return {
    platform: 'darwin',
    accessibility,
    screenRecording,
  };
}

function daemonStatus(overrides: Partial<ClawdDaemonStatus> = {}): ClawdDaemonStatus {
  return {
    supported: true,
    installed: false,
    running: false,
    socketPath: '/Users/nicolas/.codex-claw/clawd.sock',
    launchAgentPath: '/Users/nicolas/Library/LaunchAgents/com.nabocorp.codex-claw.clawd.plist',
    ...overrides,
  };
}
