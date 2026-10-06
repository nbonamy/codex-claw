import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Exercise each public publication alias with no dispatch receipt. No alias
// may fall back to a local build, SSH alias, or an unverified artifact.
for (const command of ['publish', 'publish:electron', 'publish:macos']) {
  test(`${command} requires a successful GitHub dispatch before external operations`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'app-publish-gate-'));
    try {
      const trace = path.join(directory, 'calls');
      for (const binary of ['ssh', 'scp', 'gh']) {
        writeFileSync(path.join(directory, binary), `#!${process.execPath}
require('node:fs').appendFileSync(process.env.APP_GATE_TRACE, 'called');
process.exit(19);
`, { mode: 0o700 });
      }
      const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', command, '--', '--state', path.join(directory, 'missing.json')], {
        cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8',
        env: { ...process.env, PATH: directory + path.delimiter + process.env.PATH, APP_GATE_TRACE: trace },
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /missing.json/);
      assert.equal(existsSync(trace), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
