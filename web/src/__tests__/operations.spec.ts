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
