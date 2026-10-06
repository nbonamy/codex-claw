import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

for (const failure of ['', 'import', 'build']) test(`temporary signing materials are removed after ${failure || 'success'}`, { skip: process.platform !== 'darwin' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-keychain-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const trace = path.join(root, 'trace.jsonl');
  fs.writeFileSync(path.join(root, 'security'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2), operation = args[0];
fs.appendFileSync(process.env.APP_TRACE, JSON.stringify(operation === 'list-keychains' ? args : [operation]) + '\\n');
if (operation === process.env.APP_FAILURE) process.exit(9);
if (operation === 'list-keychains' && !args.includes('-s')) console.log('    "/fixture/original.keychain-db"');
if (operation === 'create-keychain') fs.writeFileSync(args.at(-1), 'fixture');
if (operation === 'delete-keychain') fs.rmSync(args.at(-1));
`, { mode: 0o700 });
  const npm = path.join(root, 'npm.cjs');
  fs.writeFileSync(npm, `process.exit(process.env.APP_FAILURE === 'build' ? 8 : 0);`);
  const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'macos-keychain.mjs'), 'build'], {
    encoding: 'utf8', env: { ...process.env, PATH: root + path.delimiter + process.env.PATH,
      RUNNER_TEMP: root, npm_execpath: npm, APP_TRACE: trace, APP_FAILURE: failure,
      BUILD_CERTIFICATE_BASE64: Buffer.from('fixture').toString('base64'), BUILD_CERTIFICATE_PASSWORD: 'private-fixture-password',
      IDENTIFY_DARWIN_CODE: 'fixture', APPLE_ID: 'fixture', APPLE_PASSWORD: 'private-fixture-password', APPLE_TEAM_ID: 'fixture' },
  });
  assert.equal(result.status, failure ? 1 : 0, result.stderr);
  const calls = fs.readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.at(-2), ['list-keychains', '-d', 'user', '-s', '/fixture/original.keychain-db']);
  assert.deepEqual(calls.at(-1), ['delete-keychain']);
  assert.equal(fs.readdirSync(root).some(file => file.startsWith('app-signing')), false);
  assert.doesNotMatch(result.stderr + result.stdout, /private-fixture-password/);
});
