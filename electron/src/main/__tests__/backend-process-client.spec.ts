import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ClawBackendProcessClient } from '../backend-process-client';

describe('ClawBackendProcessClient', () => {
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
});

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
