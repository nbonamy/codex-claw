import { flushPromises, mount } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsView from '../SettingsView.vue';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import { defaultGeneralSettings, defaultThemeSettings } from '@codex-claw/core/settings';
import { configureClawClient } from '../../platform-api';
import { setElectronTestClient } from '../../test/client';

describe('SettingsView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens on General by default, preserves the settings order, and emits tab selections', async () => {
    setElectronTestClient({});
    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
      },
      global: {
        },
    });

    expect(wrapper.text()).toContain('Accessibility');
    expect(wrapper.findAll('.el-menu-item').map((item) => item.text())).toStrictEqual([
      'General',
      'Appearance',
      'Personalization',
      'Codex',
      'Claude Code',
      'Plugins',
      'Integrations',
      'Appshots',
      'Connections',
      'Git',
    ]);
    expect(wrapper.text()).not.toContain('Launch ChatGPT');
    expect(wrapper.text()).not.toContain('Enable Claude Code');
    expect(wrapper.text()).not.toContain('Theme');
    const menuItems = wrapper.findAll('.el-menu-item');
    for (const label of ['Codex', 'Claude Code']) {
      const item = menuItems.find((item) => item.text() === label)!;
      const icon = item.get('.backend-icon');
      expect(getComputedStyle(icon.element).transform).toBe('scale(1.15)');
      for (const color of ['rgb(120, 120, 120)', 'rgb(220, 220, 220)']) {
        (item.element as HTMLElement).style.color = color;
        expect(getComputedStyle(icon.element).backgroundColor).toBe(color);
      }
      expect(getComputedStyle(icon.element).maskImage).toContain('url(');
    }
    expect(menuItems.find((item) => item.text() === 'Plugins')?.get('svg').html())
      .not.toBe(menuItems.find((item) => item.text() === 'Integrations')?.get('svg').html());

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'Appearance')?.trigger('click');

    expect(wrapper.emitted('selectTab')).toStrictEqual([['appearance']]);
  });

  it('routes Codex and Claude Code controls to separate provider panels', async () => {
    setElectronTestClient({});
    const connectCodex = vi.fn().mockResolvedValue(undefined);
    const connectClaude = vi.fn().mockResolvedValue(undefined);
    const setProviderEnabled = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsView, {
      props: {
        activeTab: 'codex',
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        connectCodex, connectClaude, setProviderEnabled,
      },
    });

    expect(wrapper.text()).toContain('Launch ChatGPT');
    expect(wrapper.text()).not.toContain('Share skills and plugins with ChatGPT');
    expect(wrapper.text()).toContain('Codex executable');
    expect(wrapper.text()).not.toContain('Enable Claude Code');
    await wrapper.findAll('button').find(button => button.text() === 'Connect')!.trigger('click');
    expect(connectCodex).toHaveBeenCalledOnce();

    await wrapper.setProps({ activeTab: 'claude-code' } as never);

    expect(wrapper.text()).toContain('Account');
    expect(wrapper.text()).not.toContain('Enable Claude Code');
    expect(wrapper.text()).not.toContain('Launch ChatGPT');
    expect(wrapper.text()).not.toContain('Codex executable');
    await wrapper.findAll('button').find(button => button.text() === 'Connect')!.trigger('click');
    expect(connectClaude).toHaveBeenCalledOnce();
    await wrapper.setProps({ claudeConnected: true });
    await wrapper.findAll('button').find(button => button.text() === 'Disconnect')!.trigger('click');
    expect(setProviderEnabled).toHaveBeenCalledWith('claude', false);
    await wrapper.setProps({ activeTab: 'codex', codexConnected: true });
    await wrapper.findAll('button').find(button => button.text() === 'Disconnect')!.trigger('click');
    expect(setProviderEnabled).toHaveBeenLastCalledWith('codex', false);
  });

  it('renders controlled appearance settings and emits appearance updates', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsView, {
      props: {
        activeTab: 'appearance',
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        updateSettings,
      },
      global: {
        },
    });

    await wrapper.findComponent({ name: 'ElSegmented' }).vm.$emit('update:modelValue', 'dark');
    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'github-dark');
    await wrapper.findAllComponents({ name: 'ElInputNumber' })[0].vm.$emit('update:modelValue', 17);

    expect(updateSettings).toHaveBeenCalledWith({ theme: { mode: 'dark', id: 'codex-claw-dark' } });
    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark' } });
    expect(updateSettings).toHaveBeenCalledWith({ theme: { chatFontSize: 17 } });
  });

  it('keeps the general permissions tab reachable', async () => {
    setElectronTestClient({});
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        activeTab: 'appearance',
      },
      global: {
        },
    });

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'General')?.trigger('click');
    await wrapper.setProps({ activeTab: 'general' } as never);

    expect(wrapper.text()).toContain('Accessibility');
  });

  it('places plugin controls before integrations and forwards plugin management actions', async () => {
    const launchChatGptApp = vi.fn().mockResolvedValue({ status: 'launched' });
    configureClawClient({
      api: { launchChatGptApp } as unknown as CodexClawApi,
      platform: 'desktop',
    });
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        activeTab: 'plugins',
        updateSettings,
      },
    });

    expect(wrapper.text()).toContain('Computer Use');
    expect(wrapper.text()).toContain('Chrome');
    const labels = wrapper.findAll('.el-menu-item').map((item) => item.text());
    expect(labels.indexOf('Plugins')).toBeLessThan(labels.indexOf('Integrations'));

    await wrapper.get('[aria-label="Enable Chrome"]').trigger('click');
    await flushPromises();
    expect(launchChatGptApp).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('renders the connections tab and forwards SSH actions', async () => {
    const listSshHosts = vi.fn().mockResolvedValue([]);
    const addSshConnection = vi.fn().mockResolvedValue(undefined);
    const checkRemoteConnection = vi.fn().mockResolvedValue(undefined);
    const updateRemoteConnection = vi.fn().mockResolvedValue(undefined);
    const removeRemoteConnection = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        activeTab: 'connections',
        remoteConnections: [{
          id: 'connection-devbox',
          kind: 'ssh',
          name: 'devbox',
          host: 'devbox',
          status: 'saved',
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        }],
        teams: [{
          id: 'team-remote',
          name: 'Remote',
          color: '#1B4FB2',
          agentIds: [],
          remoteConnectionId: 'connection-devbox',
        }],
        listSshHosts,
        addSshConnection,
        checkRemoteConnection,
        updateRemoteConnection,
        removeRemoteConnection,
      },
      global: {
        },
    });

    expect(wrapper.text()).toContain('Remote Codex Claw agents');
    expect(wrapper.text()).toContain('devbox');

    await wrapper.get('[aria-label="devbox actions"]').trigger('click');
    await flushPromises();
    bodyButton('Sync')?.click();
    await flushPromises();
    await wrapper.get('[aria-label="devbox actions"]').trigger('click');
    await flushPromises();
    bodyButton('Delete')?.click();
    await flushPromises();

    expect(checkRemoteConnection).toHaveBeenCalledWith('connection-devbox');
    expect(removeRemoteConnection).toHaveBeenCalledWith('connection-devbox');
  });

  it('omits desktop-only settings when mounted by a web host', () => {
    configureClawClient(undefined);
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        activeTab: 'general',
      },
    });

    expect(wrapper.findAll('.el-menu-item').map((item) => item.text())).not.toContain('Appshots');
    expect(wrapper.text()).not.toContain('Prevent sleep while agents run');
    expect(wrapper.text()).not.toContain('Keep Codex Claw ready in the background');
    expect(wrapper.text()).not.toContain('System permissions');
    expect(wrapper.text()).not.toContain('Codex executable');
  });
});

function bodyButton(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes(label));
}
