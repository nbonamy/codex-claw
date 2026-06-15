import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsConnectionsPanel from '../SettingsConnectionsPanel.vue';

describe('SettingsConnectionsPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('lists saved remote connections and exposes row actions', async () => {
    const checkRemoteConnection = vi.fn().mockResolvedValue(undefined);
    const updateRemoteConnection = vi.fn().mockResolvedValue(undefined);
    const removeRemoteConnection = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
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
          sourceFolderPath: '~/src',
          transport: {
            type: 'ssh-stdio',
            command: 'ssh',
            args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
          },
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        }],
        teams: [{
          id: 'team-remote',
          name: 'Remote Team',
          color: '#1B4FB2',
          agentIds: [],
          remoteConnectionId: 'connection-devbox',
        }],
        checkRemoteConnection,
        updateRemoteConnection,
        removeRemoteConnection,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('devbox');
    expect(wrapper.text()).toContain('nicolas@devbox.internal');
    expect(wrapper.text()).toContain('Ready (clawd 0.1.0)');

    await wrapper.get('[aria-label="Connection settings for devbox"]').trigger('click');
    await flushPromises();
    wrapper.findComponent({ name: 'ElInput' }).vm.$emit('update:modelValue', '~/code');
    await flushPromises();
    bodyButton('Save')?.click();
    await flushPromises();

    await wrapper.get('[aria-label="devbox actions"]').trigger('click');
    await flushPromises();
    bodyButton('Check')?.click();
    await flushPromises();

    await wrapper.get('[aria-label="devbox actions"]').trigger('click');
    await flushPromises();
    bodyButton('Delete')?.click();
    await flushPromises();

    expect(updateRemoteConnection).toHaveBeenCalledWith('connection-devbox', { sourceFolderPath: '~/code' });
    expect(checkRemoteConnection).toHaveBeenCalledWith('connection-devbox');
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      'devbox will be removed. This will also delete 1 connected team: Remote Team. Their agents and messages will be removed from Codex Claw.',
      'Delete devbox?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete',
        type: 'warning',
      },
    );
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

function bodyButton(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes(label));
}
