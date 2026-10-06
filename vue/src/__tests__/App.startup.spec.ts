import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptySnapshot, createInitialSnapshot } from '@workspace/core/snapshot';
import type { RendererSnapshotState } from '@workspace/core/contracts';
import { createClientApiMock } from '../test/client-api-mock';
import { deferred } from './app-state-test-harness';

beforeEach(() => {
  vi.resetModules();
  window.sessionStorage.clear();
});
afterEach(() => window.sessionStorage.clear());

async function mountStartup(api: ReturnType<typeof createClientApiMock>['api']) {
  const { setElectronTestClient } = await import('../test/client');
  setElectronTestClient(api);
  const { default: App } = await import('../App.vue');
  return mount(App);
}

describe('app startup', () => {
  it('waits for the saved workspace before deciding whether to show onboarding', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = [{ backend: 'codex', installed: true, connected: true, checking: false }];
    const { api } = createClientApiMock(snapshot);
    const pending = deferred<RendererSnapshotState>();
    api.getSnapshotState.mockReturnValue(pending.promise);
    const wrapper = await mountStartup(api);
    await flushPromises();

    expect(wrapper.find('.codex-login--sign-in').exists()).toBe(false);
    expect(window.sessionStorage.getItem('app:firstRunOnboardingStage')).toBeNull();
    pending.resolve({ snapshot, connection: { status: 'connected' }, lastBackendEventSeq: 0 });
    await flushPromises();
    expect(wrapper.find('.codex-login').exists()).toBe(false);
    expect(wrapper.text()).toContain('Dina');
    wrapper.unmount();
  });

  it.each(['rejected', 'disconnected'] as const)('shows a connection problem, not onboarding, after a %s initial snapshot and recovers', async mode => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = [{ backend: 'codex', installed: true, connected: true, checking: false }];
    const { api, emit } = createClientApiMock(snapshot);
    if (mode === 'rejected') api.getSnapshotState.mockRejectedValueOnce(new Error('daemon socket is not connected.'));
    else api.getSnapshotState.mockResolvedValueOnce({ snapshot: createEmptySnapshot(), connection: { status: 'error', detail: 'daemon socket is not connected.' }, lastBackendEventSeq: 0 });
    const wrapper = await mountStartup(api);
    await flushPromises();

    expect(wrapper.find('.codex-login--sign-in').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toContain('daemon socket is not connected.');
    expect(window.sessionStorage.getItem('app:firstRunOnboardingStage')).toBeNull();
    emit({ type: 'client.connectionChanged', source: 'client', payload: { status: 'connected' }, seq: 0, occurredAt: '2026-10-06T00:00:00Z' });
    await flushPromises();
    expect(wrapper.find('.codex-login').exists()).toBe(false);
    expect(wrapper.text()).toContain('Dina');
    wrapper.unmount();
  });

  it.each(['cached', 'rejected'] as const)('re-reads the workspace when the daemon connects during a %s initial snapshot request', async mode => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = [{ backend: 'codex', installed: true, connected: true, checking: false }];
    const { api, emit } = createClientApiMock(snapshot);
    const pending = deferred<RendererSnapshotState>();
    api.getSnapshotState.mockReturnValueOnce(pending.promise);
    const wrapper = await mountStartup(api);
    await flushPromises();
    emit({ type: 'client.connectionChanged', source: 'client', payload: { status: 'connected' }, seq: 0, occurredAt: '2026-10-06T00:00:00Z' });
    if (mode === 'rejected') pending.reject(new Error('daemon socket is not connected.'));
    else pending.resolve({ snapshot: createEmptySnapshot(), connection: { status: 'connecting' }, lastBackendEventSeq: 0 });
    await flushPromises();

    expect(wrapper.find('.codex-login').exists()).toBe(false);
    expect(wrapper.text()).toContain('Dina');
    expect(window.sessionStorage.getItem('app:firstRunOnboardingStage')).toBeNull();
    wrapper.unmount();
  });

  it('allows retry after startup fails without waiting for a transport event', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = [{ backend: 'codex', installed: true, connected: true, checking: false }];
    const { api } = createClientApiMock(snapshot);
    api.getSnapshotState.mockRejectedValueOnce(new Error('snapshot unavailable'));
    const wrapper = await mountStartup(api);
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.codex-login').exists()).toBe(false);
    expect(wrapper.text()).toContain('Dina');
    wrapper.unmount();
  });

  it('still offers onboarding for a confirmed fresh install', async () => {
    const { api } = createClientApiMock(createEmptySnapshot());
    const wrapper = await mountStartup(api);
    await flushPromises();
    expect(wrapper.find('.codex-login--sign-in').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the workspace visible through a later disconnect and a failed provider probe', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = [{ backend: 'codex', installed: true, connected: true, checking: false }];
    const { api, emit } = createClientApiMock(snapshot);
    api.getProviderSetup.mockRejectedValue(new Error('provider probe unavailable'));
    api.getProviderConnections.mockRejectedValue(new Error('provider probe unavailable'));
    const wrapper = await mountStartup(api);
    await flushPromises();
    expect(wrapper.find('.codex-login').exists()).toBe(false);
    emit({ type: 'client.connectionChanged', source: 'client', payload: { status: 'reconnecting' }, seq: 0, occurredAt: '2026-10-06T00:00:00Z' });
    await flushPromises();
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.find('.codex-login').exists()).toBe(false);
    expect(wrapper.get('.app-shell__connection-status').text()).toContain('Reconnecting');
    wrapper.unmount();
  });
});
