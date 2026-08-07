import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { electronClawHostCapabilities } from '@codex-claw/core/client';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import SettingsPluginsPanel from '../SettingsPluginsPanel.vue';
import { configureClawClient } from '../../platform-api';

describe('SettingsPluginsPanel', () => {
  beforeEach(() => {
    configureClawClient({
      api: {} as CodexClawApi,
      capabilities: electronClawHostCapabilities,
      platform: 'electron',
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('asks to launch ChatGPT without changing Chrome settings', async () => {
    const launchChatGptApp = vi.fn().mockResolvedValue(undefined);
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const getPluginStatus = vi.fn().mockResolvedValue({ chromeEnabled: false });
    const wrapper = mount(SettingsPluginsPanel, {
      props: { launchChatGptApp, updateSettings, getPluginStatus },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Enable Chrome"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Manage plugins in ChatGPT');
    expect(updateSettings).not.toHaveBeenCalled();

    const launchButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Launch ChatGPT'));
    launchButton?.click();
    await flushPromises();

    expect(launchChatGptApp).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(getPluginStatus).toHaveBeenCalled();
  });

  it('opens the ChatGPT dialog when Chrome is already enabled and clicked off', async () => {
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

    expect(wrapper.text()).toContain('Manage plugins in ChatGPT');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('disables a capability without opening the ChatGPT dialog', async () => {
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
    expect(wrapper.text()).not.toContain('Manage plugins in ChatGPT');
  });

  it('enables Computer Use directly without opening the ChatGPT dialog', async () => {
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
    expect(wrapper.text()).not.toContain('Manage plugins in ChatGPT');
  });

  it('does not offer Computer Use when the host does not provide it', () => {
    configureClawClient(undefined);
    const wrapper = mount(SettingsPluginsPanel, {
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.find('[aria-label="Enable Computer Use"]').exists()).toBe(false);
  });

  it('opens the ChatGPT dialog for other plugins without changing capability settings', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsPluginsPanel, {
      props: { updateSettings },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Manage other plugins in ChatGPT"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Manage plugins in ChatGPT');

    const launchButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Launch ChatGPT'));
    launchButton?.click();
    await flushPromises();

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('keeps the dialog open when ChatGPT cannot be launched', async () => {
    const launchChatGptApp = vi.fn().mockRejectedValue(new Error('ChatGPT is unavailable.'));
    const wrapper = mount(SettingsPluginsPanel, {
      props: { launchChatGptApp },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Enable Chrome"]').trigger('click');
    await flushPromises();
    const launchButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Launch ChatGPT'));
    launchButton?.click();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('ChatGPT is unavailable.');
    expect(wrapper.text()).toContain('Manage plugins in ChatGPT');
  });
});
