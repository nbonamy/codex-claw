import { describe, expect, it, vi } from 'vitest';
import { createClawBrowserClient } from '../browser-client';

describe('Claw browser client', () => {
  it('waits for readiness, correlates operations, and emits backend events', async () => {
    const socket = new FakeBrowserSocket();
    const api = createClawBrowserClient({ createSocket: () => socket as unknown as WebSocket });
    const listener = vi.fn();
    api.onEvent(listener);
    queueMicrotask(() => socket.receive({ version: 1, type: 'ready', userId: 'local-single-user' }));

    const pending = api.createTeam({ name: 'Claw' });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const request = JSON.parse(socket.sent[0]!);
    expect(request).toMatchObject({ operation: 'createTeam', args: [{ name: 'Claw' }] });

    socket.receive({ version: 1, type: 'response', id: request.id, ok: true, result: { teams: [] } });
    await expect(pending).resolves.toEqual({ teams: [] });

    const fork = api.forkAgent('agent-1', undefined);
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
    const forkRequest = JSON.parse(socket.sent[1]!);
    expect(forkRequest.args).toEqual(['agent-1']);
    socket.receive({ version: 1, type: 'response', id: forkRequest.id, ok: true });
    await expect(fork).resolves.toBeUndefined();

    socket.receive({
      version: 1,
      type: 'event',
      event: {
        seq: 3,
        source: 'backend',
        type: 'snapshot.updated',
        payload: {},
        occurredAt: '2026-08-07T00:00:00.000Z',
      },
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ seq: 3 }));
  });
});

class FakeBrowserSocket extends EventTarget {
  readonly sent: string[] = [];
  send(data: string): void { this.sent.push(data); }
  close(code?: number, reason?: string): void {
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
  receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}
