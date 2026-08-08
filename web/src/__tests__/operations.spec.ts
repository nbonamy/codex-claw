import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { invokeClawWebOperation } from '../server/operations';

describe('Claw web operations', () => {
  it('maps allowlisted product operations to clawd methods', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });

    await expect(invokeClawWebOperation({ request }, 'createAgent', [{ name: 'Dina' }]))
      .resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(backendMethods.agentCreate, {
      input: { name: 'Dina' },
    });
  });

  it('adapts the backend snapshot envelope for the Vue client', async () => {
    const snapshot = { teams: [], agents: [], messages: [], general: {}, workBacklog: { providerSettings: {} } };
    const request = vi.fn().mockResolvedValue({ snapshot, lastEventSeq: 42, clientState: {} });

    await expect(invokeClawWebOperation({ request }, 'getSnapshotState', [])).resolves.toEqual({
      snapshot,
      lastBackendEventSeq: 42,
      connection: { status: 'connected' },
    });
  });

  it('routes snapshot variants for local and remote locations', async () => {
    const snapshot = { teams: [] };
    const request = vi.fn().mockResolvedValue({ snapshot, lastEventSeq: 2 });
    const backend = { request };

    await expect(invokeClawWebOperation(backend, 'getSnapshot', [])).resolves.toBe(snapshot);
    await expect(invokeClawWebOperation(backend, 'getBenchSnapshot', [undefined])).resolves.toBe(snapshot);
    await expect(invokeClawWebOperation(backend, 'getLoopSnapshot', [{ kind: 'local' }])).resolves.toBe(snapshot);
    const remote = { kind: 'remote', connectionId: 'ssh-1' };
    await invokeClawWebOperation(backend, 'getBenchSnapshot', [remote]);
    await invokeClawWebOperation(backend, 'getLoopSnapshot', [remote]);

    expect(request).toHaveBeenNthCalledWith(1, backendMethods.snapshotGet);
    expect(request).toHaveBeenNthCalledWith(2, backendMethods.snapshotGet);
    expect(request).toHaveBeenNthCalledWith(3, backendMethods.snapshotGet);
    expect(request).toHaveBeenNthCalledWith(4, backendMethods.snapshotBenchGet, { location: remote });
    expect(request).toHaveBeenNthCalledWith(5, backendMethods.snapshotLoopsGet, { location: remote });
  });

  it('builds required, optional, and pass-through operation parameters', async () => {
    const request = vi.fn().mockResolvedValue('ok');
    const backend = { request };

    await invokeClawWebOperation(backend, 'listSourceFolders', [{ kind: 'remote' }]);
    await invokeClawWebOperation(backend, 'listSourceRepositories', []);
    await invokeClawWebOperation(backend, 'listSourceRepositories', ['ssh-1']);
    await invokeClawWebOperation(backend, 'forkAgent', ['agent-1', undefined]);
    await invokeClawWebOperation(backend, 'listWorkItems', ['github', null, { kind: 'remote' }]);
    await invokeClawWebOperation(backend, 'getPluginStatus', []);

    expect(request.mock.calls).toStrictEqual([
      [backendMethods.sourceFoldersList, { kind: 'remote' }],
      [backendMethods.sourceRepositoriesList, undefined],
      [backendMethods.sourceRepositoriesList, { remoteConnectionId: 'ssh-1' }],
      [backendMethods.agentFork, { agentId: 'agent-1' }],
      [backendMethods.workProviderItemsList, { provider: 'github', location: { kind: 'remote' } }],
      [backendMethods.settingsPluginStatusGet, undefined],
    ]);
  });

  it('rejects desktop-only and unknown operations without forwarding them', async () => {
    const request = vi.fn();

    await expect(invokeClawWebOperation({ request }, 'browserOpen', [])).rejects.toThrow(
      "'browserOpen' is not available in Claw Web.",
    );
    await expect(invokeClawWebOperation({ request }, 'arbitraryBackendCall', [])).rejects.toThrow(
      'Unknown Claw web operation',
    );
    expect(request).not.toHaveBeenCalled();
  });
});
