import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ClawBackendSocketClient } from '../backend-socket-client';

describe('ClawBackendSocketClient', () => {
  it('sends backend health over the socket and resolves the response', async () => {
    const socket = createFakeSocket();
    const client = new ClawBackendSocketClient({
      socketPath: '/tmp/clawd.sock',
      connectSocket: vi.fn().mockReturnValue(socket),
    });

    const startPromise = client.start();
    socket.emit('connect');
    await startPromise;
    const healthPromise = client.health();
    const request = JSON.parse(socket.writes[0]);
    socket.writeFromServer(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        ok: true,
        name: 'clawd',
        version: '0.1.0',
        pid: 123,
      },
    })}\n`);

    await expect(healthPromise).resolves.toStrictEqual({
      ok: true,
      name: 'clawd',
      version: '0.1.0',
      pid: 123,
    });
  });

  it('emits backend event notifications from the socket', async () => {
    const socket = createFakeSocket();
    const client = new ClawBackendSocketClient({
      socketPath: '/tmp/clawd.sock',
      connectSocket: vi.fn().mockReturnValue(socket),
    });
    const listener = vi.fn();

    const startPromise = client.start();
    socket.emit('connect');
    await startPromise;
    client.onEvent(listener);
    socket.writeFromServer(`${JSON.stringify({
      jsonrpc: '2.0',
      method: 'backend/event/notify',
      params: {
        seq: 1,
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
        occurredAt: '2026-06-14T00:00:00.000Z',
      },
    })}\n`);

    expect(listener).toHaveBeenCalledWith({
      seq: 1,
      type: 'client.connectionChanged',
      payload: { status: 'connected' },
      occurredAt: '2026-06-14T00:00:00.000Z',
    });
  });

  it('handles backend-initiated client requests over the socket', async () => {
    const socket = createFakeSocket();
    const openExternal = vi.fn().mockResolvedValue(true);
    const client = new ClawBackendSocketClient({
      socketPath: '/tmp/clawd.sock',
      connectSocket: vi.fn().mockReturnValue(socket),
      requestHandlers: {
        'client/external/open': openExternal,
      },
    });

    const startPromise = client.start();
    socket.emit('connect');
    await startPromise;
    socket.writeFromServer(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'client-1',
      method: 'client/external/open',
      params: { url: 'https://example.com' },
    })}\n`);
    await flushMicrotasks();

    expect(openExternal).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(JSON.parse(socket.writes[0])).toStrictEqual({
      jsonrpc: '2.0',
      id: 'client-1',
      result: true,
    });
  });

  it('reports disconnects and can reconnect using a fresh socket', async () => {
    const firstSocket = createFakeSocket();
    const secondSocket = createFakeSocket();
    const connectSocket = vi.fn()
      .mockReturnValueOnce(firstSocket)
      .mockReturnValueOnce(secondSocket);
    const client = new ClawBackendSocketClient({ socketPath: '/tmp/clawd.sock', connectSocket });
    const connectionListener = vi.fn();
    client.onConnectionState(connectionListener);

    const firstStart = client.start();
    firstSocket.emit('connect');
    await firstStart;
    firstSocket.emit('close');

    expect(connectionListener).toHaveBeenNthCalledWith(1, 'connected', undefined);
    expect(connectionListener).toHaveBeenNthCalledWith(2, 'disconnected', expect.any(Error));

    const secondStart = client.start();
    secondSocket.emit('connect');
    await secondStart;
    expect(connectionListener).toHaveBeenNthCalledWith(3, 'connected', undefined);
    expect(connectSocket).toHaveBeenCalledTimes(2);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

function createFakeSocket() {
  const stream = new PassThrough();
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const socket = Object.assign(stream, {
    destroyed: false,
    writes: [] as string[],
    destroy: vi.fn(() => {
      socket.destroyed = true;
      socket.emit('close');
      return socket;
    }),
    end: vi.fn(() => {
      socket.destroyed = true;
      socket.emit('close');
      return socket;
    }),
    write: vi.fn((chunk: string | Uint8Array, callback?: (error?: Error | null) => void) => {
      socket.writes.push(chunk.toString());
      callback?.();
      return true;
    }),
    writeFromServer: (chunk: string) => {
      stream.emit('data', Buffer.from(chunk));
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      const onceListener = (...args: unknown[]) => {
        socket.off(event, onceListener);
        listener(...args);
      };
      socket.on(event, onceListener);
      return socket;
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return socket;
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((candidate) => candidate !== listener));
      return socket;
    },
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    },
  });
  return socket;
}
