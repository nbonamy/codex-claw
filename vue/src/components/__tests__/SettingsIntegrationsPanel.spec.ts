import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import SettingsIntegrationsPanel from '../SettingsIntegrationsPanel.vue';

const clipboardWriteText = vi.fn();

describe('SettingsIntegrationsPanel', () => {
  it('renders a decorative banner below the title', () => {
    const wrapper = mountPanel({
      connections: [{ provider: 'github', status: 'disconnected' }],
    });

    const title = wrapper.get('#settings-integrations-title');
    const banner = wrapper.get('.settings-integrations-banner');

    expect(title.element.compareDocumentPosition(banner.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.attributes('aria-hidden')).toBe('true');
    expect(banner.text()).toBe('');
    expect(wrapper.find('svg.github-icon').exists()).toBe(true);
    expect(wrapper.find('img.github-icon').exists()).toBe(false);
  });

  it('emits connect for disconnected GitHub', async () => {
    const wrapper = mountPanel({
      connections: [{ provider: 'github', status: 'disconnected' }],
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Connect')?.trigger('click');

    expect(wrapper.emitted('connect')).toStrictEqual([['github']]);
  });

  it('shows the GitHub verification code, copies it, and emits browser open while waiting for polling', async () => {
    vi.useFakeTimers();
    clipboardWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });
    const wrapper = mountPanel({
      authorization: {
        provider: 'github',
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        expiresAt: '2026-06-09T12:05:00.000Z',
      },
      connections: [{
        provider: 'github',
        status: 'connecting',
        detail: 'Enter code ABCD-1234 in GitHub.',
      }],
    });

    expect(wrapper.text()).toContain('ABCD-1234');
    expect(wrapper.text()).toContain('Step 1: Copy the code');
    expect(wrapper.text()).toContain('Step 2: Open GitHub');
    expect(wrapper.text()).toContain('GitHub will ask for the code. Paste it there, authorize Codex Claw, then come back here.');
    expect(wrapper.text()).toContain('Step 3: Come back here');
    expect(wrapper.text()).toContain('Codex Claw will finish the connection automatically once GitHub approves it.');
    expect(wrapper.find('[aria-label="Waiting for GitHub authorization"]').exists()).toBe(true);

    await wrapper.get('[aria-label="Copy GitHub device code ABCD-1234"]').trigger('click');
    expect(clipboardWriteText).toHaveBeenCalledWith('ABCD-1234');
    expect(wrapper.text()).not.toContain('Copied');
    expect(wrapper.findAllComponents({ name: 'ElButton' }).find((button) => button.text() === 'Open GitHub')?.props('type')).toBe('primary');

    await vi.advanceTimersByTimeAsync(1_400);
    expect(wrapper.find('[aria-label="Copy GitHub device code ABCD-1234"]').exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElButton' }).find((button) => button.text() === 'Open GitHub')?.props('type')).toBe('primary');

    await wrapper.findAll('button').find((button) => button.text() === 'Open GitHub')?.trigger('click');
    expect(wrapper.emitted('open-authorization')).toStrictEqual([['github']]);
    expect(wrapper.emitted('complete')).toBeUndefined();
    vi.useRealTimers();
  });

  it('shows connected account state and emits disconnect', async () => {
    const wrapper = mountPanel({
      connections: [{
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
      }],
    });

    expect(wrapper.text()).toContain('Signed in as nbonamy');

    await wrapper.findAll('button').find((button) => button.text() === 'Disconnect')?.trigger('click');

    expect(wrapper.emitted('disconnect')).toStrictEqual([['github']]);
  });

  it('lets unconfigured GitHub reach the backend because backend owns configuration', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      connections: [{
        provider: 'github',
        status: 'notConfigured',
        detail: 'GitHub OAuth is not configured.',
      }],
      updateSettings,
    });

    const connectButton = wrapper.findAll('button').find((button) => button.text() === 'Connect');
    expect(connectButton?.attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('GitHub OAuth is not configured');

    await connectButton?.trigger('click');
    await flushPromises();

    expect(updateSettings).not.toHaveBeenCalled();
    expect(wrapper.emitted('connect')).toStrictEqual([['github']]);
  });

  it('uses a saved client ID without forcing a settings update on connect', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      connections: [{ provider: 'github', status: 'disconnected' }],
      providerSettings: {
        github: {
          oauthClientId: 'client-id',
        },
      },
      updateSettings,
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Connect')?.trigger('click');
    await flushPromises();

    expect(updateSettings).not.toHaveBeenCalled();
    expect(wrapper.emitted('connect')).toStrictEqual([['github']]);
  });
});

function mountPanel(props: Record<string, unknown>) {
  return mount(SettingsIntegrationsPanel, {
    props: {
      connections: [],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}
