import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import SettingsIntegrationsPanel from '../SettingsIntegrationsPanel.vue';

describe('SettingsIntegrationsPanel', () => {
  it('emits connect for disconnected GitHub', async () => {
    const wrapper = mountPanel({
      connections: [{ provider: 'github', status: 'disconnected' }],
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Connect')?.trigger('click');

    expect(wrapper.emitted('connect')).toStrictEqual([['github']]);
  });

  it('shows the GitHub verification code and emits finish', async () => {
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

    await wrapper.findAll('button').find((button) => button.text() === 'Finish connection')?.trigger('click');

    expect(wrapper.emitted('complete')).toStrictEqual([['github']]);
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

  it('keeps unconfigured GitHub disabled when no client ID is saved', async () => {
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
    expect(connectButton?.attributes('disabled')).toBeDefined();

    await connectButton?.trigger('click');
    await flushPromises();

    expect(updateSettings).not.toHaveBeenCalled();
    expect(wrapper.emitted('connect')).toBeUndefined();
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
