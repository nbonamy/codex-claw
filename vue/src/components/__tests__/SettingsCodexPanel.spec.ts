import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppApi } from '@workspace/core/contracts';
import { defaultGeneralSettings } from '@workspace/core/settings';
import { configureAppClient } from '../../platform-api';
import SettingsCodexPanel from '../SettingsCodexPanel.vue';

describe('SettingsCodexPanel', () => {
  beforeEach(() => {
    configureAppClient({ api: {} as AppApi, platform: 'desktop' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups engine setup, ChatGPT launch and runtime settings without a duplicate skills toggle', () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain('Launch ChatGPT');
    expect(wrapper.find('input[aria-label="Share skills and plugins with ChatGPT"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Codex executable');
    expect(wrapper.text()).not.toContain('Enable Claude Code');
    const connectionBlock = wrapper.findAll('.settings-section')[0]!;
    expect(connectionBlock.findAll('.settings-row__copy strong').map(row => row.text())).toEqual(['Account', 'Location', 'Enable engine']);
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

});

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(SettingsCodexPanel, {
    props: {
      settings: defaultGeneralSettings,
      ...props,
    },
  });
}
