import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// Execute the real npm release entry point; replace child npm invocations so
// this contract test can never build, sign, contact a provider, or publish.
for (const failedGate of ['test:ai', 'test:coverage', null]) {
  test(`publication stops at ${failedGate ?? 'the validated build boundary'}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'app-publish-gate-'));
    try {
      const trace = path.join(directory, 'calls.jsonl');
      writeFileSync(path.join(directory, 'npm'), `#!${process.execPath}
const fs = require('node:fs');
const command = process.argv[3];
fs.appendFileSync(process.env.APP_GATE_TRACE, JSON.stringify(command) + '\\n');
process.exit(command === process.env.APP_FAILED_GATE ? 19 : 0);
`, { mode: 0o700 });
      const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'publish:electron'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, PATH: directory + path.delimiter + process.env.PATH,
          APP_GATE_TRACE: trace, APP_FAILED_GATE: failedGate ?? '' },
      });
      const calls = readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const expected = ['test:ai', 'test:coverage', 'check-publish:macos', 'make:electron', 'publish:macos'];
      assert.deepEqual(calls, failedGate ? expected.slice(0, expected.indexOf(failedGate) + 1) : expected);
      assert.equal(result.status, failedGate ? 19 : 0, result.stderr);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
