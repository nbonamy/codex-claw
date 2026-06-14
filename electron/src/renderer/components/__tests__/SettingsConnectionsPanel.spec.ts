import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import SettingsConnectionsPanel from '../SettingsConnectionsPanel.vue';

describe('SettingsConnectionsPanel', () => {
  it('lists saved remote connections and checks them', async () => {
    const checkRemoteConnection = vi.fn().mockResolvedValue(undefined);
    const removeRemoteConnection = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsConnectionsPanel, {
      props: {
        connections: [{
          id: 'connection-devbox',
          kind: 'ssh',
          name: 'devbox',
          host: 'devbox',
          hostName: 'devbox.internal',
          user: 'nicolas',
          status: 'ready',
          detail: 'Ready (clawd 0.1.0)',
          transport: {
            type: 'ssh-stdio',
            command: 'ssh',
            args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
          },
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        }],
        checkRemoteConnection,
        removeRemoteConnection,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('devbox');
    expect(wrapper.text()).toContain('nicolas@devbox.internal');
    expect(wrapper.text()).toContain('Ready (clawd 0.1.0)');

    await wrapper.findAll('button').find((button) => button.text() === 'Check')?.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Remove')?.trigger('click');

    expect(checkRemoteConnection).toHaveBeenCalledWith('connection-devbox');
    expect(removeRemoteConnection).toHaveBeenCalledWith('connection-devbox');
  });

  it('loads ssh hosts and adds the selected connection', async () => {
    const listSshHosts = vi.fn().mockResolvedValue([{
      host: 'devbox',
      hostName: 'devbox.internal',
      user: 'nicolas',
      port: 2222,
    }]);
    const addSshConnection = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsConnectionsPanel, {
      props: {
        connections: [],
        listSshHosts,
        addSshConnection,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Add')?.trigger('click');
    await flushPromises();

    expect(listSshHosts).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('devbox');
    expect(document.body.textContent).toContain('nicolas@devbox.internal:2222');

    const connectButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Connect'));
    connectButton?.click();
    await flushPromises();

    expect(addSshConnection).toHaveBeenCalledWith({
      name: 'devbox',
      host: 'devbox',
      hostName: 'devbox.internal',
      user: 'nicolas',
      port: 2222,
    });
  });
});
