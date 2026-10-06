import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
