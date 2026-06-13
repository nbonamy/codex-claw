import { pathToFileURL } from 'node:url';
import { createClawRpcNotification } from '@codex-claw/shared/backend-protocol/rpc';
import { BackendDriverRpc, createDefaultBackendDrivers } from './driver-rpc';
import { ClawMcpService } from './mcp/service';
import { ClawBackendServer } from './server';
import { loadBackendSnapshot, saveBackendSnapshot } from './state';
import { StdioRpcPeer } from './stdio';

export const CLAWD_VERSION = '0.1.0';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--version')) {
    process.stdout.write(`clawd ${CLAWD_VERSION}\n`);
    return;
  }

  if (argv.includes('--stdio')) {
    const stateDir = readArgValue(argv, '--state-dir');
    const snapshot = await loadBackendSnapshot(stateDir);
    const mcpService = new ClawMcpService({ snapshot });
    const mcpServerUrl = await mcpService.start();
    const driverRpc = new BackendDriverRpc(createDefaultBackendDrivers({
      clawMcpServerUrl: mcpServerUrl,
    }));
    const server = new ClawBackendServer({
      version: CLAWD_VERSION,
      snapshot,
      driverRpc,
      onEvent: (event) => {
        process.stdout.write(`${JSON.stringify(createClawRpcNotification('backend/event', event))}\n`);
      },
      saveSnapshot: (nextSnapshot) => saveBackendSnapshot(stateDir, nextSnapshot),
    });
    mcpService.setDriverRpc(driverRpc);
    mcpService.setEventSink((event) => server.emitEvent(event));
    const stdio = new StdioRpcPeer({
      input: process.stdin,
      output: process.stdout,
      onMessage: (message) => server.handleMessage(message),
    });
    let stopping = false;
    const stop = async () => {
      if (stopping) {
        return;
      }
      stopping = true;
      stdio.stop();
      await server.close();
      await mcpService.stop();
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
    return;
  }

  process.stderr.write('Usage: clawd --stdio [--state-dir <path>] | --version\n');
  process.exitCode = 1;
}

function readArgValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
