import { pathToFileURL } from 'node:url';
import { createClawRpcNotification } from '@codex-claw/shared/backend-protocol/rpc';
import { createClawdRuntime, type ClawdRuntime } from './runtime';
import { backendSocketPath } from './state';
import { LocalSocketRpcServer } from './socket-server';
import { StdioRpcPeer } from './stdio';

export const CLAWD_VERSION = '0.1.0';

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

  process.stderr.write('Usage: clawd --stdio | serve | --version\nSet CODEX_CLAW_HOME to override ~/.codex-claw.\n');
  process.exitCode = 1;
}

async function runStdio(): Promise<void> {
  let runtime: ClawdRuntime;
  const stdio = new StdioRpcPeer({
    input: process.stdin,
    output: process.stdout,
    onMessage: (message) => runtime.server.handleMessage(message),
  });
  runtime = await createClawdRuntime({
    version: CLAWD_VERSION,
    requestClient: (method, params) => stdio.request(method, params),
    emitEvent: (event) => process.stdout.write(`${JSON.stringify(createClawRpcNotification('backend/event', event))}\n`),
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    stdio.stop();
    await runtime.stop();
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
  stdio.start();
  process.stdin.resume();
}

async function serve(): Promise<void> {
  let socketServer: LocalSocketRpcServer | null = null;
  const runtime = await createClawdRuntime({
    version: CLAWD_VERSION,
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
  process.stderr.write(`[clawd:daemon] listening {"socketPath":"${backendSocketPath()}"}\n`);

  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    await socketServer?.stop();
    await runtime.stop();
  };
  process.once('SIGTERM', () => {
    void stop().finally(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void stop().finally(() => process.exit(0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
