import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const cli = path.resolve(import.meta.dirname, 'github-release.mjs');
const sha = 'a'.repeat(40);
const requestId = 'b'.repeat(32);
const expectedJobs = ['quality', 'build (darwin-arm64)', 'build (win32-x64)', 'build (linux-x64)', 'build (linux-arm64)', 'stage'];

function fixture(t, scenario = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'app-release-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const state = { repository: 'nbonamy/korus', tag: 'v0.27.0', version: '0.27.0', sha,
    requestId, runId: 91, attempt: 1, createdAt: '2026-10-06T00:00:00Z' };
  const statePath = path.join(directory, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  const run = { id: 91, head_sha: sha, run_attempt: 1, event: 'workflow_dispatch',
    display_title: `desktop 0.27.0 ${requestId}`, path: '.github/workflows/desktop-build.yml',
    status: 'completed', conclusion: 'success', html_url: 'https://github.com/nbonamy/korus/actions/runs/91', ...scenario.run };
  const jobs = expectedJobs.filter(name => name !== scenario.missingJob).map((name, index) => ({
    id: index + 10, name, status: 'completed', conclusion: scenario.failedJob === name ? 'cancelled' : 'success',
    html_url: `${run.html_url}/job/${index + 10}`,
  }));
  const dataPath = path.join(directory, 'fixture.json');
  writeFileSync(dataPath, JSON.stringify({ run, jobs, missing: scenario.missing, delayed: scenario.delayed }));
  const gh = path.join(directory, 'gh');
  writeFileSync(gh, `#!${process.execPath}
const fs = require('node:fs');
const f = JSON.parse(fs.readFileSync(process.env.APP_GH_FIXTURE));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.APP_GH_TRACE, JSON.stringify(args) + '\\n');
const route = args[1];
if (args[0] === 'workflow' && args[1] === 'run') {
  const value = key => args.find(a => a.startsWith(key + '=')).slice(key.length + 1);
  f.run.display_title = 'desktop ' + value('version') + ' ' + value('request_id');
  fs.writeFileSync(process.env.APP_GH_FIXTURE, JSON.stringify(f));
  process.exit(0);
}
if (args[0] !== 'api') process.exit(27);
if (route.includes('/git/ref/tags/')) console.log(JSON.stringify({object:{sha:f.run.head_sha}}));
else if (route.includes('/commits/')) console.log(JSON.stringify({sha:f.run.head_sha}));
else if (route.includes('/contents/package.json')) console.log(JSON.stringify({content:Buffer.from(JSON.stringify({version:'0.27.0'})).toString('base64')}));
else if (route.includes('/attempts/' + f.run.run_attempt + '/jobs')) console.log(JSON.stringify([{jobs:f.jobs}]));
else if (route.includes('/actions/workflows/')) {
  const countFile = process.env.APP_GH_TRACE + '.count';
  const count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile)) : 0;
  fs.writeFileSync(countFile, String(count + 1));
  console.log(JSON.stringify([{workflow_runs:f.missing || (f.delayed && !count) ? [] : [f.run]}]));
}
else if (route.endsWith('/actions/runs/91')) console.log(JSON.stringify(f.run));
else process.exit(28);
`, { mode: 0o700 });
  const trace = path.join(directory, 'trace.jsonl');
  return { directory, statePath, state, trace, execute: (args = [], command = 'monitor') => spawnSync(process.execPath,
    [cli, command, '--state', statePath, '--timeout', '0', ...args], {
      encoding: 'utf8', env: { ...process.env, PATH: directory + path.delimiter + process.env.PATH,
        APP_GH_FIXTURE: dataPath, APP_GH_TRACE: trace, NO_COLOR: '1' },
    }) };
}

test('non-TTY monitoring reports every required job and the exact run URL', t => {
  const f = fixture(t);
  const result = f.execute();
  assert.equal(result.status, 0, result.stderr);
  for (const name of expectedJobs) assert.ok(result.stdout.includes(name));
  assert.match(result.stdout, /https:\/\/github.com\/nbonamy\/korus\/actions\/runs\/91/);
  assert.doesNotMatch(result.stdout, /\x1b/);
  assert.ok(readFileSync(f.trace, 'utf8').includes('/attempts/1/jobs'));
});

for (const scenario of [
  { missingJob: 'build (linux-arm64)' },
  { failedJob: 'build (win32-x64)' },
  { run: { conclusion: 'cancelled' } },
  { run: { conclusion: 'timed_out' } },
  { run: { head_sha: 'c'.repeat(40) } },
  { run: { display_title: `desktop 9.0.0 ${requestId}` } },
  { run: { run_attempt: 2 } },
  { run: { status: 'queued', conclusion: null } },
]) test(`monitor fails closed: ${JSON.stringify(scenario)}`, t => {
  const result = fixture(t, scenario).execute();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /missing|unsuccessful|identity|attempt|Timed out/i);
});

test('discovery timeout never reports success for an absent dispatch', t => {
  const f = fixture(t, { missing: true });
  writeFileSync(f.statePath, JSON.stringify({ ...f.state, runId: null }));
  const result = f.execute();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Timed out.*discover/i);
});

test('discovery saves the matching exact run for later resume', t => {
  const f = fixture(t);
  writeFileSync(f.statePath, JSON.stringify({ ...f.state, runId: null }));
  assert.equal(f.execute().status, 0);
  assert.equal(JSON.parse(readFileSync(f.statePath)).runId, 91);
});

test('discovery tolerates delayed visibility without accepting an empty target set', t => {
  const f = fixture(t, { delayed: true });
  writeFileSync(f.statePath, JSON.stringify({ ...f.state, runId: null }));
  const result = f.execute(['--timeout', '0.2']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(f.statePath)).runId, 91);
});

test('dispatch resolves the remote tag and persists its SHA/version before launching one exact workflow', t => {
  const f = fixture(t);
  rmSync(f.statePath);
  const result = f.execute(['--tag', 'v0.27.0'], 'dispatch');
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(readFileSync(f.statePath));
  assert.equal(saved.sha, sha);
  assert.equal(saved.version, '0.27.0');
  assert.equal(saved.runId, 91);
  const calls = readFileSync(f.trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.find(args => args[0] === 'workflow'), ['workflow', 'run', 'desktop-build.yml', '--repo', 'nbonamy/korus',
    '--ref', 'v0.27.0', '-f', `sha=${sha}`, '-f', 'version=0.27.0', '-f', 'tag=v0.27.0', '-f', `request_id=${saved.requestId}`]);
});

test('a complete rerun requires explicit attempt selection and saves that attempt', t => {
  const f = fixture(t, { run: { run_attempt: 2 } });
  const result = f.execute(['--attempt', '2']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(f.statePath)).attempt, 2);
  assert.ok(readFileSync(f.trace, 'utf8').includes('/attempts/2/jobs'));
});
