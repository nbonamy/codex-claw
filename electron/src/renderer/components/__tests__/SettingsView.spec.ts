import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsView from '../SettingsView.vue';
import { defaultGeneralSettings, defaultThemeSettings } from '@codex-claw/shared/settings';

describe('SettingsView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens on ChatGPT by default, lists it before General, and emits tab selections', async () => {
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Manage Codex settings in ChatGPT');
    expect(wrapper.findAll('.el-menu-item').map((item) => item.text()).slice(0, 2)).toStrictEqual([
      'ChatGPT',
      'General',
    ]);
    expect(wrapper.text()).not.toContain('Accessibility');
    expect(wrapper.text()).not.toContain('Theme');
    expect(wrapper.findAll('.el-menu-item').map((item) => item.text())).toContain('Appshots');

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'Appearance')?.trigger('click');

    expect(wrapper.emitted('selectTab')).toStrictEqual([['appearance']]);
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
        plugins: [ElementPlus],
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
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        activeTab: 'appearance',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'General')?.trigger('click');
    await wrapper.setProps({ activeTab: 'general' } as never);

    expect(wrapper.text()).toContain('Accessibility');
  });

  it('places plugin controls before integrations and forwards ChatGPT actions', async () => {
    const launchChatGptApp = vi.fn().mockResolvedValue(undefined);
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsView, {
      props: {
        settings: defaultThemeSettings,
        generalSettings: defaultGeneralSettings,
        activeTab: 'plugins',
        launchChatGptApp,
        updateSettings,
      },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.text()).toContain('Computer Use');
    expect(wrapper.text()).toContain('Chrome');
    const labels = wrapper.findAll('.el-menu-item').map((item) => item.text());
    expect(labels.indexOf('Plugins')).toBeLessThan(labels.indexOf('Integrations'));

    await wrapper.get('[aria-label="Enable Chrome"]').trigger('click');
    await flushPromises();
    await wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false);
    expect(launchChatGptApp).not.toHaveBeenCalled();
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
        plugins: [ElementPlus],
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
});

function bodyButton(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes(label));
}
