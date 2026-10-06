import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('dev launches npm through its CLI path, including paths with spaces, and reports Electron failure', () => {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'app dev ')));
  try {
    mkdirSync(path.join(root, 'scripts'));
    mkdirSync(path.join(root, 'backend/dist'), { recursive: true });
    writeFileSync(path.join(root, 'backend/dist/daemon.mjs'), '');
    copyFileSync(new URL('./dev.mjs', import.meta.url), path.join(root, 'scripts/dev.mjs'));
    const npmCli = path.join(root, 'npm cli.cjs');
    const trace = path.join(root, 'calls.jsonl');
    writeFileSync(npmCli, `
      const fs = require('node:fs');
      fs.appendFileSync(process.env.APP_DEV_TRACE, JSON.stringify({ args: process.argv.slice(2), codex: process.env.APP_BUNDLED_CODEX_PATH }) + '\\n');
      if (process.argv[3] === 'dev:backend') setInterval(() => {}, 1000);
      if (process.argv[3] === 'start:electron') {
        const watcher = fs.watch(process.env.APP_DEV_TRACE, () => finish());
        const finish = () => {
          const calls = fs.readFileSync(process.env.APP_DEV_TRACE, 'utf8').trim().split('\\n').map(JSON.parse);
          if (calls.some(call => call.args[1] === 'dev:backend')) {
            watcher.close();
            process.exit(23);
          }
        };
        finish();
      }
    `);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/dev.mjs')], {
      env: { ...process.env, PATH: '', npm_execpath: npmCli, APP_DEV_TRACE: trace },
      encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 23, result.stderr);
    const calls = readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls.slice(0, 4).map(call => call.args), [
      ['run', 'build:codex'], ['run', 'build:computer-use'], ['run', 'build:tts'],
      ['run', 'build', '-w', '@workspace/backend'],
    ]);
    assert.deepEqual(calls.slice(4).map(call => call.args[1]).sort(), ['dev:backend', 'start:electron']);
    assert.equal(calls.find(call => call.args[1] === 'start:electron').codex,
      path.join(root, 'electron/resources/codex', ...(process.platform === 'win32' ? ['bin', 'codex.exe'] : ['codex'])));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed npm spawn rejects startup without an unsettled top-level await', () => {
  const env = { ...process.env, PATH: '' };
  delete env.npm_execpath;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./dev.mjs', import.meta.url))], {
    env, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /ENOENT/);
  assert.doesNotMatch(result.stderr, /unsettled top-level await/);
});
