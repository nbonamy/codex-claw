import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import product from '../core/src/product.json' with { type: 'json' };
import nodeRelease from '../node-runtime-release.json' with { type: 'json' };
import codexRelease from '../codex-app-server-release.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'electron/out', `${product.name}-${process.platform}-${process.arch}`);
const resources = process.platform === 'darwin' ? path.join(app, `${product.name}.app/Contents/Resources`) : path.join(app, 'resources');
const node = path.join(resources, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
const codex = path.join(resources, 'codex', ...(process.platform === 'win32' ? ['bin', 'codex.exe'] : ['codex']));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'app-smoke-'));
const env = { ...process.env, PATH: path.dirname(node), NODE_OPTIONS: '', HOME: home, USERPROFILE: home,
  APP_HOME: home, CODEX_HOME: path.join(home, 'codex'), APP_BUNDLED_CODEX_PATH: codex };
fs.mkdirSync(env.CODEX_HOME);
try {
  const nodeVersion = execFileSync(node, ['--version'], { env, encoding: 'utf8' }).trim();
  if (nodeVersion !== `v${nodeRelease.version}`) throw new Error('Incorrect bundled Node version.');
  const daemonVersion = execFileSync(node, [path.join(resources, 'daemon', product.daemonName), '--version'], { env, encoding: 'utf8', timeout: 30_000 }).trim();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!daemonVersion.includes(version)) throw new Error('Incorrect bundled daemon version.');
  if (execFileSync(codex, ['--version'], { env, encoding: 'utf8' }).trim() !== `codex-cli ${codexRelease.version}`) throw new Error('Incorrect bundled Codex version.');
  await new Promise((resolve, reject) => {
    const child = spawn(codex, ['app-server'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => finish(new Error('Bundled app-server initialize timed out.')), 30_000);
    let settled = false;
    let buffer = '';
    let stderr = '';
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      child.once('close', () => error ? reject(error) : resolve());
    }
    child.on('error', error => finish(error));
    child.on('exit', () => { if (!settled) finish(new Error(`Bundled app-server exited before initialize: ${stderr}`)); });
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4000); });
    child.stdout.on('data', bytes => {
      buffer += bytes;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try {
          const reply = JSON.parse(line);
          if (reply.id === 1) finish(reply.result ? undefined : new Error('Bundled app-server rejected initialize.'));
        } catch { finish(new Error('Invalid bundled app-server response.')); }
      }
    });
    child.stdin.on('error', error => finish(error));
    child.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: {
      clientInfo: { name: 'desktop_build_smoke', version }, capabilities: { experimentalApi: true },
    } }) + '\n');
  });
  if (process.platform === 'darwin' && process.env.APP_SKIP_SIGNING !== '1') {
    const bundle = path.join(app, `${product.name}.app`);
    execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
    execFileSync('spctl', ['--assess', '--type', 'execute', bundle], { stdio: 'inherit' });
    execFileSync('xcrun', ['stapler', 'validate', bundle], { stdio: 'inherit' });
  }
  console.log(`Packaged Node, daemon and Codex initialize passed on ${process.platform}/${process.arch}.`);
} finally { fs.rmSync(home, { recursive: true, force: true }); }
