import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import SettingsChatGptPanel from '../SettingsChatGptPanel.vue';
import { configureClawClient } from '../../platform-api';

describe('SettingsChatGptPanel', () => {
  beforeEach(() => {
    configureClawClient({ api: {} as CodexClawApi, platform: 'desktop' });
  });

  it('explains where Codex settings are managed and launches ChatGPT', async () => {
    const launchChatGptApp = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsChatGptPanel, {
      props: { launchChatGptApp },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.get('[aria-label="ChatGPT app"]').element).toBeInstanceOf(HTMLElement);
    expect(wrapper.text()).toContain('Install plugins, configure sandbox policies');
    expect(wrapper.text()).toContain('same Codex home used by Claw');

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(launchChatGptApp).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('keeps launch failures visible and allows retrying', async () => {
    const launchChatGptApp = vi.fn()
      .mockRejectedValueOnce(new Error('ChatGPT is not installed at /Applications/ChatGPT.app.'))
      .mockResolvedValueOnce(undefined);
    const wrapper = mount(SettingsChatGptPanel, {
      props: { launchChatGptApp },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('ChatGPT is not installed at /Applications/ChatGPT.app.');

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(launchChatGptApp).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows launch progress until macOS accepts the request', async () => {
    let finishLaunch: () => void = () => undefined;
    const launchChatGptApp = vi.fn().mockReturnValue(new Promise<void>((resolve) => {
      finishLaunch = resolve;
    }));
    const wrapper = mount(SettingsChatGptPanel, {
      props: { launchChatGptApp },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('button').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.get('button').classes()).toContain('is-loading');

    finishLaunch();
    await flushPromises();

    expect(wrapper.get('button').classes()).not.toContain('is-loading');
  });

  it('shows a friendly error when the desktop action is unavailable', async () => {
    const wrapper = mount(SettingsChatGptPanel, {
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('ChatGPT could not be launched from this window.');
  });

  it('normalizes non-Error launch failures', async () => {
    const wrapper = mount(SettingsChatGptPanel, {
      props: { launchChatGptApp: vi.fn().mockRejectedValue('Launch was denied.') },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Launch was denied.');
  });
});
