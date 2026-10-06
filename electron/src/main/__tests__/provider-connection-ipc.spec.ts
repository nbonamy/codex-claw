import { describe, expect, it, vi } from 'vitest';
import type { AppApi } from '@workspace/core/contracts';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import { AppController } from '../app-controller';
import { createBackendClient, fakeAppLifecycle } from './app-controller-test-harness';

const bridge = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));
vi.mock('electron', () => ({
  app: {}, BrowserWindow: {}, clipboard: {}, dialog: {}, net: {}, powerMonitor: {}, protocol: {}, shell: {},
  contextBridge: { exposeInMainWorld: (name: string, value: unknown) => bridge.exposed.set(name, value) },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => bridge.handlers.set(channel, handler),
    removeHandler: (channel: string) => bridge.handlers.delete(channel),
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = bridge.handlers.get(channel);
      if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
      return handler({}, ...args);
    },
  },
}));

describe('provider sign-out IPC', () => {
  it('carries sign-out from the real preload API to daemon with the selected engine and host', async () => {
    const result = { kind: 'claude', connected: false, state: { loggedIn: false } };
    const request = vi.fn().mockResolvedValue(result);
    const controller = new AppController(createInitialSnapshot(), createBackendClient({ request }), fakeAppLifecycle());
    controller.registerIpcHandlers();
    await import('../../preload/index');
    const api = bridge.exposed.get('app') as AppApi;
    await expect(api.disconnectProvider('claude', 'wall-e')).resolves.toEqual(result);
    expect(request).toHaveBeenLastCalledWith('provider/disconnect', { backend: 'claude', remoteConnectionId: 'wall-e' });
    await api.authenticateProvider('antigravity', 'login');
    expect(request).toHaveBeenLastCalledWith('provider/authenticate', { backend: 'antigravity', action: 'login' });
    await api.authenticateProvider('antigravity', 'cancel');
    expect(request).toHaveBeenLastCalledWith('provider/authenticate', { backend: 'antigravity', action: 'cancel' });
    request.mockRejectedValueOnce(new Error('Sign-out failed'));
    await expect(api.disconnectProvider('codex')).rejects.toThrow('Sign-out failed');
    expect(request).toHaveBeenLastCalledWith('provider/disconnect', { backend: 'codex', remoteConnectionId: undefined });
  });
});
