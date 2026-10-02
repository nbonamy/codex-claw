import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { RemoteConnection } from '@codex-claw/core/contracts';
import { configureClawClient } from '../../platform-api';
import { createClientApiMock } from '../../test/client-api-mock';
import RemoteEngineConnections from '../RemoteEngineConnections.vue';

const connection: RemoteConnection = {
  id: 'wall-e', host: 'wall-e', name: 'wall-e', kind: 'ssh', status: 'ready', createdAt: '', updatedAt: '',
};

afterEach(() => { configureClawClient(undefined); document.body.innerHTML = ''; });

describe('RemoteEngineConnections', () => {
  it('toggles an authenticated remote engine from cached status without another auth check', async () => {
    const { api } = createClientApiMock();
    const engine = { backend: 'claude' as const, installed: true, connected: true, checking: false, enabled: true };
    api.getProviderConnections.mockResolvedValue([engine]);
    api.setProviderEnabled.mockResolvedValue([{ ...engine, enabled: false }]);
    configureClawClient({ platform: 'desktop', api });
    const wrapper = mount(RemoteEngineConnections, { props: { connection } });
    await flushPromises();
    await wrapper.get('input[role="switch"]').setValue(false);
    await flushPromises();
    expect(api.setProviderEnabled).toHaveBeenCalledExactlyOnceWith('claude', false, 'wall-e');
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
    expect(wrapper.find('button').exists()).toBe(false);
    expect(api.getClaudeAuthentication).not.toHaveBeenCalled();
  });

  it('installs only the selected remote engine and signs in to its configured home', async () => {
    const { api } = createClientApiMock();
    const missing = (['codex', 'claude'] as const).map(backend => ({ backend, installed: false, connected: false, checking: false }));
    api.getProviderConnections.mockResolvedValueOnce(missing).mockResolvedValue([
      missing[0]!, { ...missing[1]!, installed: true },
    ]);
    api.installProvider.mockResolvedValue({ backend: 'claude', installed: true, locked: false, isolated: true, shareSkills: true, homePath: '/remote/claw/claude-home' });
    api.getClaudeAuthentication.mockResolvedValue({ loggedIn: false, configDirectory: '/remote/claw/claude-home' });
    configureClawClient({ platform: 'desktop', api });
    const wrapper = mount(RemoteEngineConnections, { props: { connection } });
    await flushPromises();

    await wrapper.findAll('button').find(button => button.text() === 'Install Claude Code')!.trigger('click');
    await flushPromises();
    expect(api.installProvider).toHaveBeenCalledExactlyOnceWith('claude', 'wall-e');
    expect(api.getProviderConnections).toHaveBeenLastCalledWith('wall-e');
    expect(api.getClaudeAuthentication).not.toHaveBeenCalled();
    expect(api.getCodexAuthentication).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === 'Connect')!.trigger('click');
    await flushPromises();
    expect(api.getClaudeAuthentication).toHaveBeenCalledWith('wall-e');
    await wrapper.findAll('button').find(button => button.text() === 'Connect Claude')!.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain("CLAUDE_CONFIG_DIR='/remote/claw/claude-home' claude auth login --console");
    wrapper.unmount();
  });

  it('shows the remote update error without inventing an available engine and lets users retry', async () => {
    const { api } = createClientApiMock();
    api.getProviderConnections.mockRejectedValueOnce(new Error('Update Claw on wall-e to report connected engines.')).mockResolvedValue([]);
    configureClawClient({ platform: 'desktop', api });
    const wrapper = mount(RemoteEngineConnections, { props: { connection } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Update Claw on wall-e');
    expect(wrapper.text()).not.toContain('Connect Codex');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(api.getProviderConnections).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
