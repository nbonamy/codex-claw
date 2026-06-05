import { describe, expect, it, vi } from 'vitest';
import { CodexRpcClient, type CodexTransport } from '../rpc-client';
import type { JsonRpcClientMessage, JsonRpcServerMessage } from '../protocol';

class FakeTransport implements CodexTransport {
  sent: JsonRpcClientMessage[] = [];
  private messageListener: ((message: JsonRpcServerMessage) => void) | null = null;
  private errorListener: ((error: Error) => void) | null = null;

  start = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);

  send(message: JsonRpcClientMessage): void {
    this.sent.push(message);
  }

  onMessage(listener: (message: JsonRpcServerMessage) => void): () => void {
    this.messageListener = listener;
    return () => {
      this.messageListener = null;
    };
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListener = listener;
    return () => {
      this.errorListener = null;
    };
  }

  receive(message: JsonRpcServerMessage): void {
    this.messageListener?.(message);
  }

  fail(error: Error): void {
    this.errorListener?.(error);
  }
}

describe('CodexRpcClient', () => {
  it('initializes the app-server connection and sends initialized notification', async () => {
    const transport = new FakeTransport();
    const client = new CodexRpcClient(transport);

    await client.start();
    const initializing = client.initialize();
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });

    await initializing;

    expect(transport.sent).toStrictEqual([
      {
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'codex_claw',
            title: 'Codex Claw',
            version: '0.1.0',
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
          },
        },
      },
      {
        method: 'initialized',
      },
    ]);
  });

  it('matches responses to requests and rejects JSON-RPC errors', async () => {
    const transport = new FakeTransport();
    const client = new CodexRpcClient(transport);
    await client.start();

    const ok = client.request<{ value: number }>('model/list', {});
    const failed = client.request('thread/start', {});

    transport.receive({ id: 1, result: { value: 42 } });
    transport.receive({ id: 2, error: { code: -32602, message: 'bad params' } });

    await expect(ok).resolves.toStrictEqual({ value: 42 });
    await expect(failed).rejects.toThrow('bad params');
  });

  it('emits notifications and rejects pending work on transport errors', async () => {
    const transport = new FakeTransport();
    const client = new CodexRpcClient(transport);
    const notifications: JsonRpcServerMessage[] = [];
    await client.start();
    client.onNotification((message) => notifications.push(message));

    const pending = client.request('thread/start', {});
    transport.receive({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
    transport.fail(new Error('closed'));

    expect(notifications).toStrictEqual([
      { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } },
    ]);
    await expect(pending).rejects.toThrow('closed');
  });
});
