import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import backendPackage from '../../package.json';
import { CLAWD_VERSION, connectToDaemon, main, runtimeFeatures } from '../clawd';
import { LocalSocketRpcServer } from '../socket-server';

describe('clawd entrypoint', () => {
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let socketServer: LocalSocketRpcServer | null = null;

  afterEach(async () => {
    await socketServer?.stop();
    socketServer = null;
    process.exitCode = originalExitCode;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  });

  it('uses the backend package version', async () => {
    const writes: string[] = [];
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    await main(['--version']);

    expect(CLAWD_VERSION).toBe(backendPackage.version);
    expect(writes.join('')).toBe(`clawd ${backendPackage.version}\n`);
  });

  it('rejects --state-dir so CODEX_CLAW_HOME is the only state-home override', async () => {
    const writes: string[] = [];
    process.exitCode = undefined;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    await main(['--stdio', '--state-dir', '/tmp/codex-claw']);

    expect(process.exitCode).toBe(1);
    expect(writes.join('')).toContain('Unsupported option: --state-dir');
    expect(writes.join('')).toContain('CODEX_CLAW_HOME');
  });

  it('disables desktop backend tools for Cloud and unknown named hosts', () => {
    expect(runtimeFeatures('cloud')).toStrictEqual({ computerUse: false, embeddedBrowser: false });
    expect(runtimeFeatures('web')).toStrictEqual({ computerUse: false, embeddedBrowser: false });
    expect(runtimeFeatures('unexpected-host')).toStrictEqual({ computerUse: false, embeddedBrowser: false });
    expect(runtimeFeatures('electron')).toStrictEqual({ computerUse: true, embeddedBrowser: true });
  });

  it('prints usage and exits non-zero when no command is selected', async () => {
    const writes: string[] = [];
    process.exitCode = undefined;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    await main([]);

    expect(process.exitCode).toBe(1);
    expect(writes.join('')).toContain('Usage: clawd --stdio | serve | connect | --version');
  });

  it('bridges clawd connect stdio to a running daemon socket', async () => {
    const socketPath = await tempSocketPath();
    socketServer = new LocalSocketRpcServer({
      socketPath,
      onMessage: (message) => ({
        jsonrpc: '2.0',
        id: 'id' in message ? message.id : null,
        result: { method: 'method' in message ? message.method : 'none' },
      }),
    });
    await socketServer.start();
    const input = new PassThrough();
    const output = new PassThrough();
    const outputChunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => outputChunks.push(chunk));

    const connect = connectToDaemon({ input, output, socketPath });
    input.write('{"jsonrpc":"2.0","id":"health","method":"backend/health/get"}\n');
    await waitFor(() => Buffer.concat(outputChunks).toString('utf8').includes('"backend/health/get"'));
    input.end();

    await expect(connect).resolves.toBe(0);
    expect(JSON.parse(Buffer.concat(outputChunks).toString('utf8'))).toStrictEqual({
      jsonrpc: '2.0',
      id: 'health',
      result: { method: 'backend/health/get' },
    });
  });

  it('exits non-zero when clawd connect cannot reach the daemon socket', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const stderr = new PassThrough();
    const outputChunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => outputChunks.push(chunk));

    await expect(connectToDaemon({
      input,
      output,
      stderr,
      socketPath: await tempSocketPath(),
    })).resolves.toBe(1);

    expect(Buffer.concat(outputChunks).toString('utf8')).toBe('');
  });

  it.each(['socket', 'input', 'output'] as const)('exits non-zero when the connected %s stream fails', async (failingStream) => {
    const socket = new PassThrough() as PassThrough & { destroy: () => PassThrough };
    const input = new PassThrough();
    const output = new PassThrough();
    const connect = connectToDaemon({
      connectSocket: (() => {
        queueMicrotask(() => socket.emit('connect'));
        return socket as unknown as ReturnType<typeof import('node:net').createConnection>;
      }) as never,
      input,
      output,
      socketPath: '/tmp/fake-clawd.sock',
    });
    await Promise.resolve();
    await Promise.resolve();

    (failingStream === 'socket' ? socket : failingStream === 'input' ? input : output).emit('error', new Error('stream failed'));

    await expect(connect).resolves.toBe(1);
  });
});

async function tempSocketPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clawd-connect-test-'));
  return path.join(dir, 'clawd.sock');
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for predicate.');
}
