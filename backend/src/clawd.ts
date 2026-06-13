import { pathToFileURL } from 'node:url';
import { ClawBackendServer } from './server';
import { startStdioRpcServer } from './stdio';

export const CLAWD_VERSION = '0.1.0';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--version')) {
    process.stdout.write(`clawd ${CLAWD_VERSION}\n`);
    return;
  }

  if (argv.includes('--stdio')) {
    const server = new ClawBackendServer({ version: CLAWD_VERSION });
    startStdioRpcServer({
      input: process.stdin,
      output: process.stdout,
      onMessage: (message) => server.handleMessage(message),
    });
    process.stdin.resume();
    return;
  }

  process.stderr.write('Usage: clawd --stdio | --version\n');
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
