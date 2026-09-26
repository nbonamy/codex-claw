import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RemoteConnection } from '@codex-claw/core/contracts';
import RemoteClaudeAuthentication from '../RemoteClaudeAuthentication.vue';

const connection: RemoteConnection = {
  id: 'wall-e', host: 'wall-e', name: 'wall-e', kind: 'ssh', status: 'ready', createdAt: '', updatedAt: '',
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('RemoteClaudeAuthentication', () => {
  it('offers subscription and Console sign-in commands and refreshes after login', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const api = { getClaudeAuthentication: vi.fn().mockResolvedValueOnce({ loggedIn: false }).mockResolvedValue({ loggedIn: true }) };
      const wrapper = mount(RemoteClaudeAuthentication, { props: { connection, api } });
      await flushPromises();
      expect(api.getClaudeAuthentication).toHaveBeenCalledWith('wall-e');
      expect(wrapper.text()).toContain('Claude needs sign-in on this host.');

      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(document.body.textContent).toContain('On wall-e, run one of these commands:');
      expect(document.body.textContent).toContain('Claude subscription');
      expect(document.body.textContent).toContain('Anthropic Console (API billing)');
      const commandRows = Array.from(document.body.querySelectorAll('.remote-claude-auth__command-row'));
      expect(commandRows.map((row) => row.querySelector('code')?.textContent)).toEqual([
        'claude auth login --claudeai',
        'claude auth login --console',
      ]);
      (commandRows[0]?.querySelector('[aria-label="Copy Claude subscription command"]') as HTMLButtonElement).click();
      await flushPromises();
      expect(writeText).toHaveBeenLastCalledWith('claude auth login --claudeai');
      (commandRows[1]?.querySelector('[aria-label="Copy Anthropic Console command"]') as HTMLButtonElement).click();
      await flushPromises();
      expect(writeText).toHaveBeenLastCalledWith('claude auth login --console');
      expect(writeText).toHaveBeenCalledTimes(2);
      (document.body.querySelector('.claw-dialog__footer .claw-button--primary') as HTMLButtonElement).click();
      await flushPromises();
      expect(wrapper.text()).toContain('Claude connected');
      expect(document.body.querySelector('.remote-claude-auth__command')).toBeNull();
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('offers a retry when auth status is unavailable', async () => {
    const api = { getClaudeAuthentication: vi.fn().mockRejectedValueOnce(new Error('SSH disconnected')).mockResolvedValue({ loggedIn: false }) };
    const wrapper = mount(RemoteClaudeAuthentication, { props: { connection, api } });
    await flushPromises();
    expect(wrapper.text()).toContain('Could not check Claude on this host.');
    expect(wrapper.text()).not.toContain('SSH disconnected');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Connect Claude');
  });

  it('ignores a late response from another host and does not check offline connections', async () => {
    let resolveFirst!: (value: { loggedIn: boolean }) => void;
    const api = { getClaudeAuthentication: vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ loggedIn: false }) };
    const wrapper = mount(RemoteClaudeAuthentication, { props: { connection, api } });
    await wrapper.setProps({ connection: { ...connection, id: 'eve', host: 'eve' } });
    await flushPromises();
    resolveFirst({ loggedIn: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Connect Claude');
    expect(wrapper.text()).not.toContain('Claude connected');
    expect(api.getClaudeAuthentication).toHaveBeenLastCalledWith('eve');

    await wrapper.setProps({ connection: { ...connection, status: 'error' } });
    await flushPromises();
    expect(api.getClaudeAuthentication).toHaveBeenCalledTimes(2);
  });
});
