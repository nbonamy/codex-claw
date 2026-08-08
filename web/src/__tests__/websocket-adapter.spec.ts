import { describe, expect, it, vi } from 'vitest';
import type { CodexWebSocketClose, CodexWebSocketPort } from '@codex-app-sdk/web';
import { bindClawWebSocket } from '../server/websocket-adapter';

describe('Claw web WebSocket adapter', () => {
  it('sends tenant context, correlates requests, and forwards backend events', async () => {
    const socket = new FakeSocket();
    let eventListener: ((event: never) => void) | undefined;
    const backend = {
      request: vi.fn().mockResolvedValue({ agents: [] }),
      onEvent: vi.fn((listener) => {
        eventListener = listener;
        return () => { eventListener = undefined; };
      }),
    };

    bindClawWebSocket({ backend, socket, userId: 'local-single-user' });
    expect(socket.messages.map(JSON.parse)).toContainEqual({
      version: 1,
      type: 'ready',
      userId: 'local-single-user',
    });

    socket.receive(JSON.stringify({
      version: 1,
      type: 'request',
      id: 'request-1',
      operation: 'createTeam',
      args: [{ name: 'Claw' }],
    }));
    await vi.waitFor(() => expect(socket.messages.map(JSON.parse)).toContainEqual({
      version: 1,
      type: 'response',
      id: 'request-1',
      ok: true,
      result: { agents: [] },
    }));

    eventListener?.({
      seq: 7,
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
      occurredAt: '2026-08-07T00:00:00.000Z',
    } as never);
    expect(socket.messages.map(JSON.parse)).toContainEqual({
      version: 1,
      type: 'event',
      event: expect.objectContaining({ seq: 7, source: 'backend' }),
    });
  });

  it('returns operation failures and closes malformed frames', async () => {
    const socket = new FakeSocket();
    const backend = {
      request: vi.fn(),
      onEvent: () => () => undefined,
    };
    bindClawWebSocket({ backend, socket, userId: 'local-single-user' });

    socket.receive(JSON.stringify({ version: 1, type: 'request', id: 'bad', operation: 'quit', args: [] }));
    await vi.waitFor(() => expect(socket.messages.map(JSON.parse)).toContainEqual({
      version: 1,
      type: 'response',
      id: 'bad',
      ok: false,
      error: "'quit' is not available in Claw Web.",
    }));

    socket.receive('{');
    await vi.waitFor(() => expect(socket.closed).toEqual({ code: 4400, reason: 'Invalid Claw web request' }));
  });

  it('preserves successful void responses as valid protocol frames', async () => {
    const socket = new FakeSocket();
    const backend = {
      request: vi.fn().mockResolvedValue(undefined),
      onEvent: () => () => undefined,
    };
    bindClawWebSocket({ backend, socket, userId: 'local-single-user' });

    socket.receive(JSON.stringify({
      version: 1,
      type: 'request',
      id: 'void',
      operation: 'revokePairedDevice',
      args: ['environment', 'client'],
    }));
    await vi.waitFor(() => expect(socket.messages.map(JSON.parse)).toContainEqual({
      version: 1,
      type: 'response',
      id: 'void',
      ok: true,
    }));
  });

  it('accepts byte frames and closes idempotently on socket errors', async () => {
    const socket = new FakeSocket();
    const unsubscribeEvent = vi.fn();
    const backend = {
      request: vi.fn().mockResolvedValue({ ok: true }),
      onEvent: () => unsubscribeEvent,
    };
    const session = bindClawWebSocket({ backend, socket, userId: 'local-single-user' });
    socket.receive(Buffer.from(JSON.stringify({
      version: 1,
      type: 'request',
      id: 'bytes',
      operation: 'getPluginStatus',
      args: [],
    })));
    await vi.waitFor(() => expect(socket.messages.map(JSON.parse)).toContainEqual({
      version: 1,
      type: 'response',
      id: 'bytes',
      ok: true,
      result: { ok: true },
    }));

    socket.fail();
    session.close(1000, 'again');
    expect(unsubscribeEvent).toHaveBeenCalledOnce();
    expect(socket.closed).toBeNull();
  });

  it('returns string failures and ignores outbound messages after closing', async () => {
    const socket = new FakeSocket();
    let emitEvent: ((event: never) => void) | undefined;
    const backend = {
      request: vi.fn().mockRejectedValue('plain failure'),
      onEvent: (listener: (event: never) => void) => {
        emitEvent = listener;
        return () => undefined;
      },
    };
    const session = bindClawWebSocket({ backend, socket, userId: 'local-single-user' });
    socket.receive(JSON.stringify({
      version: 1,
      type: 'request',
      id: 'failure',
      operation: 'getPluginStatus',
      args: [],
    }));
    await vi.waitFor(() => expect(socket.messages.map(JSON.parse)).toContainEqual({
      version: 1,
      type: 'response',
      id: 'failure',
      ok: false,
      error: 'plain failure',
    }));
    const count = socket.messages.length;
    session.close(1000, 'done');
    emitEvent?.({ seq: 9 } as never);
    expect(socket.messages).toHaveLength(count);
    expect(socket.closed).toEqual({ code: 1000, reason: 'done' });
  });
});

class FakeSocket implements CodexWebSocketPort {
  readonly messages: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private readonly messageListeners = new Set<(data: unknown) => void>();
  private readonly closeListeners = new Set<(event: CodexWebSocketClose) => void>();
  private readonly errorListeners = new Set<(error: unknown) => void>();

  send(data: string): void { this.messages.push(data); }
  close(code?: number, reason?: string): void { this.closed = { code, reason }; }
  onMessage(listener: (data: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }
  onClose(listener: (event: CodexWebSocketClose) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  onError(listener: (error: unknown) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
  receive(data: unknown): void {
    for (const listener of this.messageListeners) listener(data);
  }
  fail(): void {
    for (const listener of this.errorListeners) listener(new Error('socket failed'));
  }
}
