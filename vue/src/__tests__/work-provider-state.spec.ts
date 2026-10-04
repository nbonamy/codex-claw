import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AppSnapshot } from '@codex-claw/core/contracts';
import { createClientApiMock } from '../test/client-api-mock';
import { configureClawClient } from '../platform-api';
import { createWorkProviderState } from '../work-provider-state';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); configureClawClient(); });

describe('work provider authorization state', () => {
  it('finishes Linear authorization without leaving settings busy or loading GitHub repositories', async () => {
    let snapshot = createInitialSnapshot();
    const { api } = createClientApiMock(snapshot);
    const connected = structuredClone(snapshot);
    connected.workBacklog.connections.push({ provider: 'linear', status: 'connected', accountLabel: 'Alex' });
    api.pollWorkProviderAuthorization.mockResolvedValue(connected);
    configureClawClient({ platform: 'desktop', api });
    const state = createWorkProviderState({ getSnapshot: () => snapshot, adoptSnapshot: value => { snapshot = value; } });
    await state.completeConnection('linear');
    expect(state.status.value).toBe('loaded');
    expect(snapshot.workBacklog.connections[1]?.accountLabel).toBe('Alex');
    expect(api.listWorkRepositories).not.toHaveBeenCalled();
  });

  it('opens Linear in the host browser and ignores a poll that finishes after cancellation', async () => {
    vi.useFakeTimers();
    let snapshot = createInitialSnapshot();
    const { api } = createClientApiMock(snapshot);
    const connecting = structuredClone(snapshot);
    connecting.workBacklog.connections.push({ provider: 'linear', status: 'connecting' });
    const connected = structuredClone(connecting);
    connected.workBacklog.connections[1] = { provider: 'linear', status: 'connected', accountLabel: 'Alex' };
    const disconnected = structuredClone(snapshot);
    disconnected.workBacklog.connections.push({ provider: 'linear', status: 'disconnected' });
    api.connectWorkProvider.mockResolvedValue({ snapshot: connecting, authorization: { provider: 'linear', flow: 'browser', verificationUri: 'https://linear.app/oauth/authorize?state=public', expiresAt: '2026-10-04' } });
    const openExternal = vi.spyOn(window, 'open').mockReturnValue(null);
    api.disconnectWorkProvider.mockResolvedValue(disconnected);
    let completePoll!: (value: AppSnapshot) => void;
    api.pollWorkProviderAuthorization.mockImplementation(() => new Promise(resolve => { completePoll = resolve; }));
    configureClawClient({ platform: 'desktop', api });
    const state = createWorkProviderState({ getSnapshot: () => snapshot, adoptSnapshot: value => { snapshot = value; } });
    await state.connect('linear');
    await state.openAuthorization('linear');
    expect(openExternal).toHaveBeenCalledWith('https://linear.app/oauth/authorize?state=public', '_blank', 'noopener,noreferrer');
    const poll = state.completeConnection('linear');
    await state.disconnect('linear');
    completePoll(connected);
    await poll;
    expect(snapshot.workBacklog.connections[1]?.status).toBe('disconnected');
    expect(state.authorization.value).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.pollWorkProviderAuthorization).toHaveBeenCalledTimes(1);
    expect(api.listWorkRepositories).not.toHaveBeenCalled();
  });
});
