import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ClawBackendProcessClient } from '../backend-process-client';

describe('ClawBackendProcessClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends backend health over stdio and resolves the response', async () => {
    const child = createFakeChildProcess();
    const spawnProcess = vi.fn().mockReturnValue(child);
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess,
    });

    await client.start();
    const healthPromise = client.health();
    const request = JSON.parse(child.stdin.writes[0]);
    child.stdout.write(`${JSON.stringify({
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
    expect(spawnProcess).toHaveBeenCalledWith('node', ['backend/dist/clawd.mjs', '--stdio'], {
      cwd: undefined,
      stdio: 'pipe',
    });
  });

  it('rejects requests when the backend returns a JSON-RPC error', async () => {
    const child = createFakeChildProcess();
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess: vi.fn().mockReturnValue(child),
    });

    await client.start();
    const requestPromise = client.request('missing/method');
    const request = JSON.parse(child.stdin.writes[0]);
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message: 'Unknown backend method: missing/method',
      },
    })}\n`);

    await expect(requestPromise).rejects.toThrow('Unknown backend method: missing/method');
  });

  it('passes configured backend environment to the spawned process', async () => {
    const child = createFakeChildProcess();
    const spawnProcess = vi.fn().mockReturnValue(child);
    const client = new ClawBackendProcessClient({
      command: {
        command: 'node',
        args: ['backend/dist/clawd.mjs', '--stdio'],
        env: {
          CODEX_CLAW_ASSETS_PATH: '/app/resources',
        },
      },
      spawnProcess,
    });

    await client.start();

    expect(spawnProcess).toHaveBeenCalledWith('node', ['backend/dist/clawd.mjs', '--stdio'], {
      cwd: undefined,
      env: expect.objectContaining({
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
      }),
      stdio: 'pipe',
    });
  });

  it('emits backend event notifications from stdio', async () => {
    const child = createFakeChildProcess();
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess: vi.fn().mockReturnValue(child),
    });
    const listener = vi.fn();

    await client.start();
    client.onEvent(listener);
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: backendMethods.backendEventNotify,
      params: {
        seq: 1,
        backend: 'codex',
        agentId: 'agent-dina',
        type: 'agent.statusChanged',
        payload: { type: 'working' },
        occurredAt: '2026-06-13T00:00:00.000Z',
      },
    })}\n`);

    expect(listener).toHaveBeenCalledWith({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-13T00:00:00.000Z',
    });
  });

  it('ignores legacy backend event notification names', async () => {
    const child = createFakeChildProcess();
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess: vi.fn().mockReturnValue(child),
    });
    const listener = vi.fn();

    await client.start();
    client.onEvent(listener);
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: 'backend/event',
      params: {
        seq: 1,
        type: 'snapshot.updated',
        payload: { ok: true },
        occurredAt: '2026-06-13T00:00:00.000Z',
      },
    })}\n`);

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps resolving requests when notifications arrive before responses', async () => {
    const child = createFakeChildProcess();
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess: vi.fn().mockReturnValue(child),
    });
    const listener = vi.fn();

    await client.start();
    client.onEvent(listener);
    const healthPromise = client.health();
    const request = JSON.parse(child.stdin.writes[0]);
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: backendMethods.backendEventNotify,
      params: {
        seq: 1,
        type: 'backend.statusChanged',
        backend: 'codex',
        payload: { backend: 'codex', status: 'running' },
        occurredAt: '2026-06-13T00:00:00.000Z',
      },
    })}\n`);
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        ok: true,
        name: 'clawd',
        version: '0.1.0',
        pid: 123,
      },
    })}\n`);

    await expect(healthPromise).resolves.toMatchObject({ ok: true });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('handles backend-initiated client requests over stdio', async () => {
    const child = createFakeChildProcess();
    const openExternal = vi.fn().mockResolvedValue(true);
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      requestHandlers: {
        'client/external/open': openExternal,
      },
      spawnProcess: vi.fn().mockReturnValue(child),
    });

    await client.start();
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'client-1',
      method: 'client/external/open',
      params: { url: 'https://example.com' },
    })}\n`);
    await flushMicrotasks();

    expect(openExternal).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(JSON.parse(child.stdin.writes[0])).toStrictEqual({
      jsonrpc: '2.0',
      id: 'client-1',
      result: true,
    });
  });

  it('returns JSON-RPC errors for unknown backend-initiated client requests', async () => {
    const child = createFakeChildProcess();
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess: vi.fn().mockReturnValue(child),
    });

    await client.start();
    child.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'client-1',
      method: 'client/nope',
      params: {},
    })}\n`);
    await flushMicrotasks();

    expect(JSON.parse(child.stdin.writes[0])).toMatchObject({
      jsonrpc: '2.0',
      id: 'client-1',
      error: {
        code: -32601,
        message: 'Unknown client method: client/nope',
      },
    });
  });

  it('rejects pending requests when the process exits', async () => {
    const child = createFakeChildProcess();
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess: vi.fn().mockReturnValue(child),
    });

    await client.start();
    const requestPromise = client.health();
    child.emit('exit', 1, null);

    await expect(requestPromise).rejects.toThrow('clawd exited before responding');
  });

  it('reports unexpected exits and starts a fresh process on reconnect', async () => {
    const firstChild = createFakeChildProcess();
    const secondChild = createFakeChildProcess();
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess,
    });
    const connectionListener = vi.fn();
    client.onConnectionState(connectionListener);

    await client.start();
    firstChild.emit('exit', 7, null);
    await client.start();

    expect(connectionListener).toHaveBeenNthCalledWith(1, 'connected', undefined);
    expect(connectionListener).toHaveBeenNthCalledWith(2, 'disconnected', expect.any(Error));
    expect(connectionListener).toHaveBeenNthCalledWith(3, 'connected', undefined);
    expect(spawnProcess).toHaveBeenCalledTimes(2);
  });

  it('restarts the backend when an explicit bundle watcher is configured', async () => {
    vi.useFakeTimers();
    const firstChild = createFakeChildProcess();
    const secondChild = createFakeChildProcess();
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);
    const watcher = { close: vi.fn() };
    const watchListenerRef: { current: (() => void) | null } = { current: null };
    const watchFileSystem = vi.fn((_file: string, listener: () => void) => {
      watchListenerRef.current = listener;
      return watcher;
    });
    const client = new ClawBackendProcessClient({
      command: { command: 'node', args: ['backend/dist/clawd.mjs', '--stdio'] },
      spawnProcess,
      watchFile: '/repo/backend/dist/clawd.mjs',
      watchFileSystem,
    });

    await client.start();
    expect(watchFileSystem).toHaveBeenCalledWith('/repo/backend/dist/clawd.mjs', expect.any(Function));
    watchListenerRef.current?.();
    await vi.advanceTimersByTimeAsync(100);

    expect(firstChild.kill).toHaveBeenCalledOnce();
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    await client.close();
    expect(watcher.close).toHaveBeenCalledOnce();
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

function createFakeChildProcess() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new WritableCapture();
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  const child = {
    stdout,
    stderr,
    stdin,
    killed: false,
    kill: vi.fn(() => {
      child.killed = true;
      child.emit('exit', 0, null);
      return true;
    }),
    once: (event: string, listener: (...args: unknown[]) => void) => {
      const onceListener = (...args: unknown[]) => {
        child.off(event, onceListener);
        listener(...args);
      };
      child.on(event, onceListener);
      return child;
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return child;
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((candidate) => candidate !== listener));
      return child;
    },
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    },
  };

  return child;
}

class WritableCapture extends PassThrough {
  readonly writes: string[] = [];

  override write(chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean {
    this.writes.push(chunk.toString());

    const maybeCallback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    maybeCallback?.();
    return true;
  }
}
