import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import AppShell from '../components/AppShell.vue';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import { setElectronTestClient } from '../test/client';

afterEach(() => {
  delete window.codexClaw;
});

describe('App', () => {
  it('loads the main-process snapshot on mount', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.backendRuntimes = [{
      backend: 'codex',
      status: 'running',
      detail: 'ready',
    }];

    const getSnapshot = vi.fn().mockResolvedValue(snapshot);
    setElectronTestClient({
      getSnapshot,
      onEvent: vi.fn(),
    });

    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElPopover: {
            template: '<div><slot name="reference" /><slot /></div>',
          },
        },
      },
    });

    await flushPromises();

    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Ready to get going');
    expect(wrapper.text()).toContain('Chat with Dina');
  });

  it('blocks the whole app while resource sharing restarts the backend', async () => {
    const snapshot = createInitialSnapshot();
    let resolveSharing!: (value: typeof snapshot) => void;
    const setCodexResourceSharing = vi.fn().mockReturnValue(new Promise<typeof snapshot>((resolve) => {
      resolveSharing = resolve;
    }));
    const reloadRenderer = vi.fn().mockRejectedValue(new Error('renderer replaced'));
    setElectronTestClient({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      onEvent: vi.fn(),
      setCodexResourceSharing,
      reloadRenderer,
    });
    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElPopover: {
            template: '<div><slot name="reference" /><slot /></div>',
          },
        },
      },
    });
    await flushPromises();

    const appShell = wrapper.findComponent(AppShell);
    const operation = (appShell.props() as {
      setCodexResourceSharing(input: { enabled: true }): Promise<void>;
    }).setCodexResourceSharing({ enabled: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="backend-restart-overlay"]').text()).toContain('Restarting the backend and reconnecting your chats.');
    expect(wrapper.get('.app-shell').attributes('inert')).toBe('');
    expect(wrapper.get('.app-shell').attributes('aria-hidden')).toBe('true');

    resolveSharing(snapshot);
    await operation;
    await flushPromises();

    expect(reloadRenderer).toHaveBeenCalledOnce();
    expect(wrapper.find('[data-testid="backend-restart-overlay"]').exists()).toBe(false);
  });

  it('tracks desktop update status, installs updates, and releases subscriptions', async () => {
    const snapshot = createInitialSnapshot();
    let statusListener: ((status: { state: 'available'; version: string }) => void) | undefined;
    const unsubscribe = vi.fn();
    const installUpdate = vi.fn().mockResolvedValue(undefined);
    setElectronTestClient({
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      onEvent: vi.fn(),
      getUpdateStatus: vi.fn().mockResolvedValue({ state: 'idle' }),
      onUpdateStatusChanged: vi.fn((listener) => {
        statusListener = listener as typeof statusListener;
        return unsubscribe;
      }),
      installUpdate,
    });
    const wrapper = mount(App, {
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();

    statusListener?.({ state: 'available', version: '0.7.0' });
    await wrapper.vm.$nextTick();
    const appShell = wrapper.findComponent(AppShell);
    appShell.vm.$emit('install-update');
    await flushPromises();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(installUpdate).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
