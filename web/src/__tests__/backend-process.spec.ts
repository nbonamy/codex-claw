import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { ClawWebBackendProcess } from '../server/backend-process';

describe('Claw web backend process', () => {
  it('starts clawd, resolves requests, forwards events, and handles client requests', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(child);
    const backend = new ClawWebBackendProcess({
      command: 'node',
      args: ['clawd.mjs', '--stdio'],
      cwd: '/repo',
      env: { CUSTOM: 'yes' },
    });
    const eventListener = vi.fn();
    const unsubscribe = backend.onEvent(eventListener);

    const starting = backend.start();
    const health = child.writtenMessage(0);
    expect(health).toMatchObject({ id: 1, method: backendMethods.backendHealthGet });
    expect(spawnMock).toHaveBeenCalledWith('node', ['clawd.mjs', '--stdio'], expect.objectContaining({
      cwd: '/repo',
      env: expect.objectContaining({ CUSTOM: 'yes', CODEX_CLAW_HOST: 'web' }),
      stdio: 'pipe',
    }));
    child.send({ jsonrpc: '2.0', id: health.id, result: { ok: true } });
    await starting;
    await backend.start();
    expect(spawnMock).toHaveBeenCalledOnce();

    const request = backend.request('thing/get', { value: 2 });
    const requestMessage = child.writtenMessage(1);
    child.send({ jsonrpc: '2.0', id: requestMessage.id, result: { value: 3 } });
    await expect(request).resolves.toStrictEqual({ value: 3 });

    child.send({
      jsonrpc: '2.0',
      method: backendMethods.backendEventNotify,
      params: {
        seq: 4,
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
        occurredAt: 'now',
      },
    });
    expect(eventListener).toHaveBeenCalledWith(expect.objectContaining({ seq: 4 }));
    unsubscribe();

    child.send({ jsonrpc: '2.0', id: 'server-1', method: 'client/native/doThing' });
    expect(child.writtenMessage(2)).toMatchObject({
      id: 'server-1',
      error: { code: -32601, message: "Client method 'client/native/doThing' is unavailable in Claw Web." },
    });

    await backend.close();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('ignores malformed backend events and remains usable for later notifications', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(child);
    const backend = new ClawWebBackendProcess({ command: 'clawd', args: [] });
    const listener = vi.fn();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const secret = 'secret-event-value';
    backend.onEvent(listener);

    const starting = backend.start();
    child.send({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    await starting;
    for (const params of [
      {
        seq: 1,
        agentId: 'agent-1',
        type: 'agent.statusChanged',
        payload: { type: secret },
        occurredAt: 'now',
      },
      {
        seq: secret,
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
        occurredAt: 'now',
      },
      { seq: 2, type: secret, payload: {}, occurredAt: 'now' },
    ]) {
      child.send({
        jsonrpc: '2.0',
        method: backendMethods.backendEventNotify,
        params,
      });
    }
    child.send({
      jsonrpc: '2.0',
      method: backendMethods.backendEventNotify,
      params: {
        seq: 3,
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
        occurredAt: 'now',
      },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ seq: 3 }));
    const malformedWarnings = stderr.mock.calls
      .map(([value]) => String(value))
      .filter((value) => value.includes('Ignored malformed clawd event notification'));
    expect(malformedWarnings).toHaveLength(3);
    expect(malformedWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining('$.payload.type'),
      expect.stringContaining('$.seq'),
      expect.stringContaining('$.type'),
    ]));
    expect(malformedWarnings.join('\n')).not.toContain(secret);

    stderr.mockRestore();
    await backend.close();
  });

  it('rejects backend errors, pending requests on exit, and requests while stopped', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(child);
    const backend = new ClawWebBackendProcess({ command: 'clawd', args: [] });
    const starting = backend.start();
    child.send({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    await starting;

    const failed = backend.request('thing/fail');
    child.send({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'failed' } });
    await expect(failed).rejects.toThrow('failed');

    const pending = backend.request('thing/pending');
    child.emit('exit', 7, null);
    await expect(pending).rejects.toThrow('clawd exited (code=7, signal=null).');
    await expect(backend.request('thing/stopped')).rejects.toThrow('Claw web backend is not running.');
    await backend.close();
  });

  it('times out requests and ignores malformed or unrelated output', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(child);
    const backend = new ClawWebBackendProcess({ command: 'clawd', args: [], requestTimeoutMs: 5 });
    const starting = backend.start();
    child.send({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    await starting;
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    child.stdout.emit('data', 'not json\n\n');
    child.stdout.emit('data', '{"jsonrpc":"1.0","method":"invalid"}\n');
    child.send({ jsonrpc: '2.0', method: 'other/event', params: {} });
    child.send({ jsonrpc: '2.0', id: 999, result: 'ignored' });
    const pending = backend.request('thing/slow');
    const rejection = expect(pending).rejects.toThrow('clawd request timed out: thing/slow');
    await vi.advanceTimersByTimeAsync(5);
    await rejection;
    expect(stderr).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Ignored invalid clawd response'));
    stderr.mockRestore();
    vi.useRealTimers();
    await backend.close();
  });

  it('rejects startup when the child process errors', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValueOnce(child);
    const backend = new ClawWebBackendProcess({ command: 'missing', args: [] });
    const starting = backend.start();
    child.emit('error', new Error('spawn failed'));
    await expect(starting).rejects.toThrow('spawn failed');
  });
});

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = { write: vi.fn() };
  killed = false;
  readonly kill = vi.fn(() => {
    this.killed = true;
    queueMicrotask(() => this.emit('exit', 0, null));
    return true;
  });

  writtenMessage(index: number): Record<string, unknown> {
    return JSON.parse(String(this.stdin.write.mock.calls[index]?.[0]).trim());
  }

  send(message: unknown): void {
    this.stdout.emit('data', `${JSON.stringify(message)}\n`);
  }
}
