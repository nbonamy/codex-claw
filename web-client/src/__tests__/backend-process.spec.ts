import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import {
  createClawdEnvironmentLaunchContract,
  type ClawdEnvironmentLaunchContract,
} from '@codex-claw/core/clawd-launch';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { ClawdStdioBackendClient } from '../backend-process';

describe('clawd stdio backend client', () => {
  it('preflights and starts clawd, resolves requests, and forwards events', async () => {
    const preflight = new FakeChild();
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(preflight).mockReturnValueOnce(child);
    const backend = new ClawdStdioBackendClient({
      launch: launch(),
      env: { CUSTOM: 'yes', CODEX_CLAW_HOST: 'cannot-override-contract' },
    });
    const eventListener = vi.fn();
    const unsubscribe = backend.onEvent(eventListener);

    const starting = backend.start();
    preflight.stdout.emit('data', 'clawd 0.6.1\n');
    preflight.emit('exit', 0, null);
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledOnce());
    const health = child.writtenMessage(0);
    expect(health).toMatchObject({ id: 1, method: backendMethods.backendHealthGet });
    expect(spawnMock).toHaveBeenNthCalledWith(1, 'node', ['clawd.mjs', '--version'], expect.objectContaining({
      cwd: '/repo',
      env: expect.objectContaining({ CUSTOM: 'yes', CODEX_CLAW_HOST: 'managed' }),
      stdio: 'pipe',
    }));
    expect(spawnMock).toHaveBeenNthCalledWith(2, 'node', ['clawd.mjs', '--stdio'], expect.objectContaining({
      cwd: '/repo',
      env: expect.objectContaining({ CODEX_CLAW_HOME: '/data/environment', CODEX_CLAW_CODEX_HOME: '/data/user/.codex' }),
      stdio: 'pipe',
    }));
    child.send({
      jsonrpc: '2.0',
      id: health.id,
      result: { ok: true, name: 'clawd', version: '0.6.1', pid: 42 },
    });
    await starting;
    await backend.start();
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const request = backend.request('thing/get', { value: 2 });
    const requestMessage = child.writtenMessage(1);
    child.send({ jsonrpc: '2.0', id: requestMessage.id, result: { value: 3 } });
    await expect(request).resolves.toStrictEqual({ value: 3 });

    child.send({
      jsonrpc: '2.0',
      method: backendMethods.backendEventNotify,
      params: { seq: 4, type: 'snapshot.updated', payload: {}, occurredAt: 'now' },
    });
    expect(eventListener).toHaveBeenCalledWith(expect.objectContaining({ seq: 4 }));
    unsubscribe();

    child.send({ jsonrpc: '2.0', id: 'server-1', method: 'client/native/doThing' });
    expect(child.writtenMessage(2)).toMatchObject({
      id: 'server-1',
      error: {
        code: -32601,
        message: "Client method 'client/native/doThing' is unavailable for this clawd host.",
      },
    });

    await backend.close();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects backend errors, pending requests on exit, and requests while stopped', async () => {
    const { backend, child } = await startBackend();
    const failed = backend.request('thing/fail');
    child.send({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'failed' } });
    await expect(failed).rejects.toThrow('failed');

    const pending = backend.request('thing/pending');
    child.emit('exit', 7, null);
    await expect(pending).rejects.toThrow('clawd exited (code=7, signal=null).');
    await expect(backend.request('thing/stopped')).rejects.toThrow('clawd is not running.');
    await backend.close();
  });

  it('times out requests and ignores malformed or unrelated output', async () => {
    vi.useFakeTimers();
    const preflight = new FakeChild();
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(preflight).mockReturnValueOnce(child);
    const backend = new ClawdStdioBackendClient({ launch: launch(), requestTimeoutMs: 5 });
    const starting = backend.start();
    preflight.stdout.emit('data', 'clawd 0.6.1\n');
    preflight.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(0);
    child.send({
      jsonrpc: '2.0', id: 1,
      result: { ok: true, name: 'clawd', version: '0.6.1', pid: 42 },
    });
    await starting;
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    child.stdout.emit('data', 'not json\n\n');
    child.send({ jsonrpc: '2.0', method: 'other/event', params: {} });
    child.send({ jsonrpc: '2.0', id: 999, result: 'ignored' });
    const pending = backend.request('thing/slow');
    const rejection = expect(pending).rejects.toThrow('clawd request timed out: thing/slow');
    await vi.advanceTimersByTimeAsync(5);
    await rejection;
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Ignored invalid clawd response'));
    stderr.mockRestore();
    vi.useRealTimers();
    await backend.close();
  });

  it('rejects incompatible and failed artifact preflights before starting clawd', async () => {
    const mismatch = new FakeChild();
    spawnMock.mockReturnValueOnce(mismatch);
    const mismatchStart = new ClawdStdioBackendClient({ launch: launch() }).start();
    mismatch.stdout.emit('data', 'clawd 0.5.0\n');
    mismatch.emit('exit', 0, null);
    await expect(mismatchStart).rejects.toThrow("expected 'clawd 0.6.1', received 'clawd 0.5.0'");

    const failed = new FakeChild();
    spawnMock.mockReturnValueOnce(failed);
    const failedStart = new ClawdStdioBackendClient({ launch: launch() }).start();
    failed.stderr.emit('data', 'cannot execute');
    failed.emit('exit', 2, null);
    await expect(failedStart).rejects.toThrow('clawd version preflight failed (code=2): cannot execute');

    const missing = new FakeChild();
    spawnMock.mockReturnValueOnce(missing);
    const missingStart = new ClawdStdioBackendClient({ launch: launch() }).start();
    missing.emit('error', new Error('spawn failed'));
    await expect(missingStart).rejects.toThrow('spawn failed');
  });

  it('times out artifact preflight and rejects incompatible runtime health', async () => {
    vi.useFakeTimers();
    const hanging = new FakeChild();
    spawnMock.mockReturnValueOnce(hanging);
    const timedOut = new ClawdStdioBackendClient({
      launch: launch(),
      versionPreflightTimeoutMs: 5,
    }).start();
    const timeoutRejection = expect(timedOut).rejects.toThrow('clawd version preflight timed out.');
    await vi.advanceTimersByTimeAsync(5);
    await timeoutRejection;
    expect(hanging.kill).toHaveBeenCalledWith('SIGTERM');

    vi.useRealTimers();
    const preflight = new FakeChild();
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(preflight).mockReturnValueOnce(child);
    const incompatible = new ClawdStdioBackendClient({ launch: launch() }).start();
    preflight.stdout.emit('data', 'clawd 0.6.1\n');
    preflight.emit('exit', 0, null);
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledOnce());
    child.send({
      jsonrpc: '2.0', id: 1,
      result: { ok: true, name: 'clawd', version: '0.5.0', pid: 42 },
    });
    await expect(incompatible).rejects.toThrow('expected 0.6.1, received 0.5.0');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects startup when the runtime process errors', async () => {
    const preflight = new FakeChild();
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(preflight).mockReturnValueOnce(child);
    const backend = new ClawdStdioBackendClient({ launch: launch() });
    const starting = backend.start();
    preflight.stdout.emit('data', 'clawd 0.6.1\n');
    preflight.emit('exit', 0, null);
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledOnce());
    child.emit('error', new Error('runtime failed'));
    await expect(starting).rejects.toThrow('runtime failed');
  });

  it('reports a runtime that ignores graceful shutdown', async () => {
    vi.useFakeTimers();
    const preflight = new FakeChild();
    const child = new FakeChild(false);
    spawnMock.mockReturnValueOnce(preflight).mockReturnValueOnce(child);
    const backend = new ClawdStdioBackendClient({ launch: launch() });
    const starting = backend.start();
    preflight.stdout.emit('data', 'clawd 0.6.1\n');
    preflight.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(0);
    child.send({
      jsonrpc: '2.0', id: 1,
      result: { ok: true, name: 'clawd', version: '0.6.1', pid: 42 },
    });
    await starting;

    const closing = backend.close();
    const rejection = expect(closing).rejects.toThrow('clawd did not exit within 5000ms.');
    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;
    vi.useRealTimers();
  });
});

async function startBackend(): Promise<{ backend: ClawdStdioBackendClient; child: FakeChild }> {
  const preflight = new FakeChild();
  const child = new FakeChild();
  spawnMock.mockReturnValueOnce(preflight).mockReturnValueOnce(child);
  const backend = new ClawdStdioBackendClient({ launch: launch() });
  const starting = backend.start();
  preflight.stdout.emit('data', 'clawd 0.6.1\n');
  preflight.emit('exit', 0, null);
  await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalledOnce());
  child.send({
    jsonrpc: '2.0', id: 1,
    result: { ok: true, name: 'clawd', version: '0.6.1', pid: 42 },
  });
  await starting;
  return { backend, child };
}

function launch(): ClawdEnvironmentLaunchContract {
  return createClawdEnvironmentLaunchContract({
    backendHome: '/data/environment',
    codexHome: '/data/user/.codex',
    command: 'node',
    commandArgs: ['clawd.mjs'],
    cwd: '/repo',
    expectedVersion: '0.6.1',
    host: 'managed',
  });
}

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = { write: vi.fn() };
  killed = false;
  readonly kill = vi.fn((signal?: string) => {
    this.killed = true;
    if (this.exitOnKill) queueMicrotask(() => this.emit('exit', 0, signal ?? null));
    return true;
  });

  constructor(private readonly exitOnKill = true) {
    super();
  }

  writtenMessage(index: number): Record<string, unknown> {
    return JSON.parse(String(this.stdin.write.mock.calls[index]?.[0]).trim());
  }

  send(message: unknown): void {
    this.stdout.emit('data', `${JSON.stringify(message)}\n`);
  }
}
