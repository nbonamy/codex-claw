import { pathToFileURL } from 'node:url';
import { ClawBackendServer } from './server';
import { loadBackendSnapshot } from './state';
import { startStdioRpcServer } from './stdio';

export const CLAWD_VERSION = '0.1.0';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--version')) {
    process.stdout.write(`clawd ${CLAWD_VERSION}\n`);
    return;
  }

  if (argv.includes('--stdio')) {
    const server = new ClawBackendServer({
      version: CLAWD_VERSION,
      snapshot: await loadBackendSnapshot(readArgValue(argv, '--state-dir')),
    });
    startStdioRpcServer({
      input: process.stdin,
      output: process.stdout,
      onMessage: (message) => server.handleMessage(message),
    });
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
