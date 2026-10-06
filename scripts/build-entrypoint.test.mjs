import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

for (const failedStage of ['', 'build:backend']) test(`build uses the npm JS entrypoint and propagates ${failedStage || 'success'}`, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'app build '));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const npm = path.join(temp, 'npm cli.cjs');
  const trace = path.join(temp, 'trace');
  fs.writeFileSync(npm, `const fs = require('node:fs');
fs.appendFileSync(process.env.APP_TRACE, JSON.stringify(process.argv.slice(2)) + '\\n');
process.exit(process.argv[3] === process.env.APP_FAILED_STAGE ? 19 : 0);`);
  const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'build.mjs')], {
    encoding: 'utf8', env: { ...process.env, npm_execpath: npm, APP_SKIP_SIGNING: '1', APP_TRACE: trace, APP_FAILED_STAGE: failedStage },
  });
  assert.equal(result.status, failedStage ? 19 : 0, result.stderr);
  const stages = fs.readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(stages, failedStage ? [['run', 'build:backend']] : [['run', 'build:backend'], ['run', 'build', '-w', '@workspace/electron']]);
});
