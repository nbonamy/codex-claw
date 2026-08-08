import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { clawdRuntimeFeaturesForHost } from '@codex-claw/core/clawd-launch';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import type { Readable, Writable } from 'node:stream';
import { createClawdRuntime, type ClawdRuntime, type ClawdRuntimeOptions } from './runtime';
import { backendSocketPath } from './state';
import { LocalSocketRpcServer } from './socket-server';
import { StdioRpcPeer } from './stdio';
import { debugMain, flushBackendLogs, logMain, warnMain } from './log';
import backendPackage from '../package.json';

export const CLAWD_VERSION = backendPackage.version;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--state-dir')) {
    process.stderr.write('Unsupported option: --state-dir. Set CODEX_CLAW_HOME to override ~/.codex-claw.\n');
    process.exitCode = 1;
    return;
  }

  if (argv.includes('--version')) {
    process.stdout.write(`clawd ${CLAWD_VERSION}\n`);
    return;
  }

  if (argv.includes('--stdio')) {
    await runStdio();
    return;
  }

  if (argv.includes('serve')) {
    await serve();
    return;
  }

  if (argv.includes('connect')) {
    process.exitCode = await connectToDaemon();
    return;
  }

  process.stderr.write('Usage: clawd --stdio | serve | connect | --version\nSet CODEX_CLAW_HOME to override ~/.codex-claw.\n');
  process.exitCode = 1;
}

export type ConnectToDaemonOptions = {
  connectSocket?: typeof net.createConnection;
  input?: Readable;
  output?: Writable;
  socketPath?: string;
  stderr?: Writable;
};

export async function connectToDaemon(options: ConnectToDaemonOptions = {}): Promise<number> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const socketPath = options.socketPath ?? backendSocketPath();
  const socket = (options.connectSocket ?? net.createConnection)(socketPath);
  let connectErrorMessage = socketPath;

  const connected = await new Promise<boolean>((resolve) => {
    const onConnect = () => {
      socket.off('error', onError);
      resolve(true);
    };
    const onError = (error: Error) => {
      socket.off('connect', onConnect);
      connectErrorMessage = error.message;
      resolve(false);
    };
    socket.once('connect', onConnect);
    socket.once('error', onError);
  });

  if (!connected) {
    socket.destroy();
    stderr.write(`clawd daemon socket unavailable: ${connectErrorMessage}\n`);
    return 1;
  }

  return new Promise<number>((resolve) => {
    let finished = false;
    const finish = (code: number) => {
      if (finished) {
        return;
      }
      finished = true;
      input.unpipe(socket);
      socket.unpipe(output);
      socket.destroy();
      resolve(code);
    };

    socket.once('close', () => finish(0));
    socket.once('error', () => finish(1));
    input.once('error', () => finish(1));
    output.once('error', () => finish(1));
    input.pipe(socket);
    socket.pipe(output);
    input.resume();
  });
}

async function runStdio(): Promise<void> {
  let runtime: ClawdRuntime;
  const stdio = new StdioRpcPeer({
    input: process.stdin,
    output: process.stdout,
    onOutputBackpressure: (details) => debugMain('stdio', 'output buffered', details),
    onOutputDrain: (details) => debugMain('stdio', 'output drained', details),
    onOutputOverflow: (details) => warnMain('stdio', 'output buffer limit exceeded', details),
    onMessage: (message) => runtime.server.handleMessage(message),
  });
  runtime = await createClawdRuntime({
    version: CLAWD_VERSION,
    features: runtimeFeatures(),
    requestClient: (method, params) => stdio.request(method, params),
    emitEvent: (event) => stdio.notify(backendMethods.backendEventNotify, event),
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    stdio.stop();
    await runtime.stop();
    await flushBackendLogs();
  };
  process.once('SIGTERM', () => {
    void stop().finally(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void stop().finally(() => process.exit(0));
  });
  process.stdin.once('end', () => {
    void stop().finally(() => process.exit(0));
  });
  process.stdout.once('error', (error) => {
    warnMain('stdio', 'output closed', { message: error.message });
    void stop().finally(() => process.exit(1));
  });
  stdio.start();
  process.stdin.resume();
}

async function serve(): Promise<void> {
  let socketServer: LocalSocketRpcServer | null = null;
  const runtime = await createClawdRuntime({
    version: CLAWD_VERSION,
    features: runtimeFeatures(),
    requestClient: (method, params) => {
      if (!socketServer) {
        throw new Error(`No connected client can handle '${method}'.`);
      }
      return socketServer.requestFirstClient(method, params);
    },
    emitEvent: (event) => {
      socketServer?.broadcastEvent(event);
    },
  });
  socketServer = new LocalSocketRpcServer({
    socketPath: backendSocketPath(),
    onMessage: (message) => runtime.server.handleMessage(message),
  });
  await socketServer.start();
  logMain('daemon', 'listening', { socketPath: backendSocketPath() });

  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    await socketServer?.stop();
    await runtime.stop();
    await flushBackendLogs();
  };
  process.once('SIGTERM', () => {
    void stop().finally(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void stop().finally(() => process.exit(0));
  });
}

export function runtimeFeatures(host = process.env.CODEX_CLAW_HOST): ClawdRuntimeOptions['features'] {
  return clawdRuntimeFeaturesForHost(host);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
