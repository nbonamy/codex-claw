import { flushPromises, mount } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import { defaultGeneralSettings } from '@codex-claw/core/settings';
import { configureClawClient } from '../../platform-api';
import SettingsCodexPanel from '../SettingsCodexPanel.vue';

describe('SettingsCodexPanel', () => {
  beforeEach(() => {
    configureClawClient({ api: {} as CodexClawApi, platform: 'desktop' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups ChatGPT launch, resource sharing, and runtime settings', () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain('Launch ChatGPT');
    expect(wrapper.text()).toContain('Share skills and plugins with ChatGPT');
    expect(wrapper.text()).toContain('Codex executable');
    expect(wrapper.text()).not.toContain('Enable Claude Code');
  });

  it('launches ChatGPT and keeps launch failures visible', async () => {
    const launchChatGptApp = vi.fn().mockRejectedValue(new Error('ChatGPT is unavailable.'));
    const wrapper = mountPanel({ launchChatGptApp });

    await wrapper.findAll('button').find((button) => button.text() === 'Launch ChatGPT')?.trigger('click');
    await flushPromises();

    expect(launchChatGptApp).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('ChatGPT is unavailable.');
  });

  it('chooses, edits, and clears the Codex executable path', async () => {
    const chooseCodexBinary = vi.fn().mockResolvedValue('/opt/homebrew/bin/codex');
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ chooseCodexBinary, updateSettings });

    const codexInput = wrapper.get('input[aria-label="Codex executable path"]');
    expect(codexInput.attributes('placeholder')).toBe('Bundled Codex');
    await codexInput.setValue('/usr/local/bin/codex');
    await codexInput.trigger('change');
    expect(updateSettings).toHaveBeenCalledWith({
      general: { codexBinaryPath: '/usr/local/bin/codex' },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Choose')?.trigger('click');
    await flushPromises();
    expect(chooseCodexBinary).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenCalledWith({
      general: { codexBinaryPath: '/opt/homebrew/bin/codex' },
    });

    await wrapper.setProps({
      settings: {
        ...defaultGeneralSettings,
        codexBinaryPath: '/opt/homebrew/bin/codex',
      },
    } as never);
    await wrapper.findAll('button').find((button) => button.text() === 'Clear')?.trigger('click');
    expect(updateSettings).toHaveBeenCalledWith({
      general: { codexBinaryPath: '' },
    });
  });

  it('warns before sharing ChatGPT skills and plugins', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const setCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      settings: { ...defaultGeneralSettings, shareCodexSkillsAndPlugins: false },
      setCodexResourceSharing,
    });

    await switchInput(wrapper, 'Share skills and plugins with ChatGPT').setValue(true);
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'You are going to lose all plugins and skills installed only in Codex Claw. Continue?',
      'Share skills and plugins with ChatGPT?',
      expect.objectContaining({ confirmButtonText: 'Continue', cancelButtonText: 'Cancel' }),
    );
    expect(setCodexResourceSharing).toHaveBeenCalledWith({ enabled: true });
  });

  it.each([
    ['confirm', 'copy'],
    ['cancel', 'fresh'],
  ] as const)('uses %s to select the %s isolated resource mode', async (dialogResult, mode) => {
    const dialog = vi.spyOn(ElMessageBox, 'confirm');
    if (dialogResult === 'confirm') dialog.mockResolvedValue('confirm' as never);
    else dialog.mockRejectedValue('cancel');
    const setCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ setCodexResourceSharing });

    await switchInput(wrapper, 'Share skills and plugins with ChatGPT').setValue(false);
    await flushPromises();

    expect(setCodexResourceSharing).toHaveBeenCalledWith({ enabled: false, mode });
  });

  it('blocks resource sharing changes while chats are running', async () => {
    const alert = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm' as never);
    const setCodexResourceSharing = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ codexResourceSharingBlocked: true, setCodexResourceSharing });

    await switchInput(wrapper, 'Share skills and plugins with ChatGPT').setValue(false);
    await flushPromises();

    expect(wrapper.text()).toContain('This option cannot be changed while chats are running.');
    expect(alert).toHaveBeenCalledOnce();
    expect(setCodexResourceSharing).not.toHaveBeenCalled();
  });
});

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(SettingsCodexPanel, {
    props: {
      settings: defaultGeneralSettings,
      ...props,
    },
  });
}

function switchInput(wrapper: ReturnType<typeof mountPanel>, label: string) {
  return wrapper.get<HTMLInputElement>(`input[aria-label="${label}"]`);
}
