import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendBundle = path.join(rootDir, 'backend/dist/clawd.mjs');
const children = new Set();
let shuttingDown = false;

// Development resolves the linked sibling SDK directly from source so Vite
// can hot-reload changes. Package and release builds keep using SDK dist.
process.env.CODEX_APP_SDK_SOURCE = '1';

if (process.argv.includes('--help')) {
  console.log('Usage: npm run dev');
  console.log('Builds clawd once, watches backend output, then starts Electron without restarting clawd on bundle changes.');
  process.exit(0);
}

await run('npm', ['run', 'build:computer-use']);
await run('npm', ['run', 'build', '-w', '@codex-claw/backend']);

const backendWatch = start('npm', ['run', 'dev:backend'], {
  cwd: rootDir,
  name: 'backend-watch',
});

await waitForFile(backendBundle);

const electronDev = start('npm', ['run', 'dev:electron'], {
  cwd: rootDir,
  name: 'electron',
  env: {
    CODEX_CLAW_BACKEND_COMMAND: process.execPath,
    CODEX_CLAW_BACKEND_ARGS: `${backendBundle},--stdio`,
    CODEX_CLAW_BACKEND_WATCH_FILE: '',
    CODEX_CLAW_ASSETS_PATH: path.join(rootDir, 'electron', 'assets'),
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal);
  });
}

electronDev.on('exit', (code) => {
  if (!shuttingDown) {
    shutdown(`electron exited with code ${code ?? 'null'}`);
  }
});

backendWatch.on('exit', (code) => {
  if (!shuttingDown) {
    shutdown(`backend watch exited with code ${code ?? 'null'}`);
  }
});

function start(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
  });
  children.add(child);
  child.once('exit', () => {
    children.delete(child);
  });
  child.once('error', (error) => {
    console.error(`[dev:${options.name}] ${error.message}`);
    shutdown(`${options.name} failed`);
  });
  return child;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = start(command, args, { cwd: rootDir, name: command });
    child.once('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function waitForFile(filePath) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (existsSync(filePath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function shutdown(reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[dev] stopping: ${reason}`);
  for (const child of children) {
    child.kill();
  }
  setTimeout(() => process.exit(0), 250).unref();
}
