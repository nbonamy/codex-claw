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
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
        occurredAt: '2026-08-07T00:00:00.000Z',
      },
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ seq: 3 }));
  });

  it('supports host no-op subscriptions, errors, binary responses, and unsubscription', async () => {
    const socket = new FakeBrowserSocket();
    const api = createClawBrowserClient({ createSocket: () => socket as unknown as WebSocket });
    const listener = vi.fn();
    const unsubscribe = api.onEvent(listener);
    const unsubscribeCommand = api.onAppCommand(vi.fn());
    const unsubscribeUpdate = api.onUpdateStatusChanged(vi.fn());

    expect(Reflect.get(api, Symbol.toStringTag)).toBeUndefined();
    expect(unsubscribeCommand()).toBeUndefined();
    expect(unsubscribeUpdate()).toBeUndefined();
    socket.receive({ version: 1, type: 'ready', userId: 'local-single-user' });

    const failed = api.createTeam({ name: 'Claw' });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const failedRequest = JSON.parse(socket.sent[0]!);
    socket.receiveBytes({
      version: 1,
      type: 'response',
      id: failedRequest.id,
      ok: false,
      error: 'No team for you',
    });
    await expect(failed).rejects.toThrow('No team for you');

    unsubscribe();
    socket.receive({
      version: 1,
      type: 'event',
      event: {
        seq: 4,
        source: 'backend',
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
        occurredAt: 'now',
      },
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops malformed web events without disturbing pending responses or later events', async () => {
    const socket = new FakeBrowserSocket();
    const api = createClawBrowserClient({ createSocket: () => socket as unknown as WebSocket });
    const listener = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const secret = 'secret-event-value';
    api.onEvent(listener);
    const malformedEvents = [
      {
        seq: 1,
        source: 'backend',
        type: 'agent.statusChanged',
        agentId: 'agent-1',
        payload: { type: secret },
        occurredAt: 'now',
      },
      {
        seq: secret,
        source: 'backend',
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
        occurredAt: 'now',
      },
      { seq: 2, source: 'backend', type: secret, payload: {}, occurredAt: 'now' },
    ];
    socket.receive({ version: 1, type: 'event', event: malformedEvents[0] });
    socket.receive({ version: 1, type: 'ready', userId: 'local-single-user' });

    const pending = api.createTeam({ name: 'Claw' });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const request = JSON.parse(socket.sent[0]!);
    for (const event of malformedEvents.slice(1)) {
      socket.receive({ version: 1, type: 'event', event });
    }
    const validEvent = {
      seq: 3,
      source: 'backend' as const,
      type: 'client.connectionChanged' as const,
      payload: { status: 'connected' as const },
      occurredAt: 'now',
    };
    socket.receive({ version: 1, type: 'event', event: validEvent });
    socket.receive({ version: 1, type: 'response', id: request.id, ok: true, result: { teams: [] } });

    await expect(pending).resolves.toEqual({ teams: [] });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(validEvent);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual(expect.arrayContaining([
      expect.stringContaining('$.payload.type'),
      expect.stringContaining('$.seq'),
      expect.stringContaining('$.type'),
    ]));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    warn.mockRestore();
  });

  it('rejects pending and connecting requests when the socket disconnects', async () => {
    const connectedSocket = new FakeBrowserSocket();
    const connectedApi = createClawBrowserClient({ createSocket: () => connectedSocket as unknown as WebSocket });
    const pending = connectedApi.getSnapshot();
    connectedSocket.receive({ version: 1, type: 'ready', userId: 'local-single-user' });
    await vi.waitFor(() => expect(connectedSocket.sent).toHaveLength(1));
    const pendingRejection = expect(pending).rejects.toThrow('Claw web socket disconnected.');
    connectedSocket.disconnect();
    await pendingRejection;

    const connectingSocket = new FakeBrowserSocket();
    const connectingApi = createClawBrowserClient({ createSocket: () => connectingSocket as unknown as WebSocket });
    const connecting = connectingApi.getSnapshot();
    const connectingRejection = expect(connecting).rejects.toThrow('Claw web socket disconnected.');
    connectingSocket.disconnect();
    await connectingRejection;
  });

  it('times out requests and rejects malformed handshake frames', async () => {
    const timeoutSocket = new FakeBrowserSocket();
    const timeoutApi = createClawBrowserClient({
      createSocket: () => timeoutSocket as unknown as WebSocket,
      requestTimeoutMs: 1,
    });
    const timedOut = timeoutApi.getSnapshot();
    timeoutSocket.receive({ version: 1, type: 'ready', userId: 'local-single-user' });
    await expect(timedOut).rejects.toThrow('Claw web request timed out: getSnapshot');

    const malformedSocket = new FakeBrowserSocket();
    const malformedApi = createClawBrowserClient({ createSocket: () => malformedSocket as unknown as WebSocket });
    const malformed = malformedApi.getSnapshot();
    const malformedRejection = expect(malformed).rejects.toThrow(
      'Claw WebSocket messages must contain text or UTF-8 bytes.',
    );
    malformedSocket.receiveRaw(new Blob(['not supported']));
    await malformedRejection;
  });
});

class FakeBrowserSocket extends EventTarget {
  readonly sent: string[] = [];
  send(data: string): void { this.sent.push(data); }
  close(code?: number, reason?: string): void {
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
  }
  disconnect(): void { this.close(1006, 'gone'); }
  receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
  receiveBytes(data: unknown): void {
    this.receiveRaw(new TextEncoder().encode(JSON.stringify(data)));
  }
  receiveRaw(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}
