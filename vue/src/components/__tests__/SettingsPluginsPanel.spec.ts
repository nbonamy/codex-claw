import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import SettingsPluginsPanel from '../SettingsPluginsPanel.vue';
import { configureClawClient } from '../../platform-api';

describe('SettingsPluginsPanel', () => {
  let builtInLaunchChatGpt: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    builtInLaunchChatGpt = vi.fn().mockResolvedValue(undefined);
    configureClawClient({
      api: { launchChatGptApp: builtInLaunchChatGpt } as unknown as CodexClawApi,
      platform: 'desktop',
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens the desktop plugin manager without changing Chrome settings', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const getPluginStatus = vi.fn().mockResolvedValue({ chromeEnabled: false });
    const wrapper = mount(SettingsPluginsPanel, {
      props: { updateSettings, getPluginStatus },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Enable Chrome"]').trigger('click');
    await flushPromises();

    expect(builtInLaunchChatGpt).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(getPluginStatus).toHaveBeenCalled();
  });

  it('opens the plugin manager when Chrome is already enabled and clicked off', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsPluginsPanel, {
      props: {
        settings: { computerUseEnabled: false, chromeEnabled: true },
        updateSettings,
        getPluginStatus: vi.fn().mockResolvedValue({ chromeEnabled: true }),
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Enable Chrome"]').trigger('click');
    await flushPromises();

    expect(builtInLaunchChatGpt).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('disables a capability without opening the plugin manager', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsPluginsPanel, {
      props: {
        settings: { computerUseEnabled: true, chromeEnabled: false },
        updateSettings,
      },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('[aria-label="Enable Computer Use"]').trigger('click');
    await flushPromises();

    expect(updateSettings).toHaveBeenCalledWith({ general: { plugins: { computerUseEnabled: false } } });
    expect(builtInLaunchChatGpt).not.toHaveBeenCalled();
  });

  it('enables Computer Use directly without opening the plugin manager', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsPluginsPanel, {
      props: {
        settings: { computerUseEnabled: false, chromeEnabled: false },
        updateSettings,
      },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('[aria-label="Enable Computer Use"]').trigger('click');
    await flushPromises();

    expect(updateSettings).toHaveBeenCalledWith({ general: { plugins: { computerUseEnabled: true } } });
    expect(builtInLaunchChatGpt).not.toHaveBeenCalled();
  });

  it('does not offer Computer Use when the host does not provide it', () => {
    configureClawClient(undefined);
    const wrapper = mount(SettingsPluginsPanel, {
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.find('[aria-label="Enable Computer Use"]').exists()).toBe(false);
  });

  it('opens the configured manager directly for other plugins', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsPluginsPanel, {
      props: { updateSettings },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Manage other plugins in ChatGPT"]').trigger('click');
    await flushPromises();
    expect(builtInLaunchChatGpt).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('shows plugin manager failures inline', async () => {
    builtInLaunchChatGpt.mockRejectedValueOnce(new Error('ChatGPT is unavailable.'));
    const wrapper = mount(SettingsPluginsPanel, {
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Enable Chrome"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('ChatGPT is unavailable.');
  });
});
