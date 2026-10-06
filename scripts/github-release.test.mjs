import assert from 'node:assert/strict';
import { test } from 'node:test';
import { release, watch } from './github-release.mjs';

const head = 'a'.repeat(40);

// Command orchestration against fake gh/git, not proof of GitHub behavior.
function setup({ dirty = '', remoteHead = head, tagSha = '', published, runs = [{ status: 'completed', conclusion: 'success', jobs: [] }], url = true } = {}) {
  const calls = [], lines = [], panels = [];
  const queue = [...runs];
  let current;
  const gh = args => {
    calls.push(args);
    if (args[0] === 'api' && args[1] === 'repos/nbonamy/korus') return JSON.stringify({ default_branch: 'main' });
    if (args[0] === 'api' && args[1].includes('/actions/runs/42/jobs')) return JSON.stringify({ jobs: current.jobs });
    if (args[0] === 'api' && args[1].endsWith('/actions/runs/42')) {
      current = queue.length > 1 ? queue.shift() : queue[0];
      return JSON.stringify({ html_url: 'run-url', ...current });
    }
    if (args[0] === 'release') {
      if (published === undefined) throw Object.assign(new Error('failed'), { stderr: 'release not found' });
      return JSON.stringify({ isDraft: !published });
    }
    if (args[0] === 'workflow') return url ? 'https://github.com/nbonamy/korus/actions/runs/42\n' : '';
    if (args[0] === 'run' && args[1] === 'list') return JSON.stringify([{ databaseId: 42, createdAt: new Date().toISOString() }]);
    if (args[0] === 'run' && args.includes('--log-failed')) return 'boom';
    return '';
  };
  const git = args => {
    if (args[0] === 'status') return dirty;
    if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? head : 'main';
    if (args[1] === 'origin' && args[2] === 'refs/heads/main') return `${remoteHead}\trefs/heads/main`;
    return tagSha ? `${tagSha}\trefs/tags/v0.27.0` : '';
  };
  return { gh, git, calls, lines, panels, output: { write: chunk => panels.push(chunk) }, log: line => lines.push(line), wait: async () => {}, version: '0.27.0' };
}
const dispatched = f => f.calls.find(call => call[0] === 'workflow');

test('a release tags the pushed commit, dispatches that tag, and shows the progress panel only when it changes', async () => {
  const f = setup({ runs: [
    { status: 'in_progress', jobs: [{ name: 'quality', status: 'in_progress' }] },
    { status: 'in_progress', jobs: [{ name: 'quality', status: 'in_progress' }] },
    { status: 'completed', conclusion: 'success', jobs: [{ name: 'quality', status: 'completed', conclusion: 'success' }] },
  ] });
  await release('latest', f);
  const tag = f.calls.find(call => call[0] === 'api' && call.includes('--method'));
  assert.ok(tag.includes('ref=refs/tags/v0.27.0') && tag.includes(`sha=${head}`));
  assert.ok(dispatched(f).includes('v0.27.0') && dispatched(f).includes('channel=latest'));
  assert.equal(f.panels.length, 2);
  assert.match(f.panels[0], /v0\.27\.0 · latest · in_progress/);
  assert.match(f.panels[1], /✓ quality +success/);
  assert.match(f.lines.at(-1), /Published latest: .*\/releases\/tag\/v0\.27\.0/);
});

test('the run is found by ref when gh does not print it', async () => {
  const f = setup({ url: false });
  await release('prerelease', f);
  assert.ok(f.lines.some(line => line.includes('run 42')));
});

for (const [name, options, message] of [
  ['uncommitted changes', { dirty: ' M package.json' }, /Commit release changes/],
  ['an unpushed commit', { remoteHead: 'b'.repeat(40) }, /Push main/],
  ['a tag on another commit', { tagSha: 'c'.repeat(40) }, /already exists at cccccccc/],
  ['a published release', { published: true }, /already published/],
]) {
  test(`a release refuses ${name} before dispatching`, async () => {
    const f = setup(options);
    await assert.rejects(release('prerelease', f), message);
    assert.equal(dispatched(f), undefined);
  });
}

test('an existing tag on HEAD is reused and build-only validation never tags', async () => {
  const reused = setup({ tagSha: head });
  await release('prerelease', reused);
  assert.ok(!reused.calls.some(call => call.includes('--method')));
  const build = setup();
  await release('build', build);
  assert.ok(!build.calls.some(call => call.includes('--method')) && dispatched(build).includes('channel=none') && dispatched(build).includes('main'));
});

test('a failed run prints the failure and how to resume', async () => {
  const f = setup({ runs: [{ status: 'completed', conclusion: 'failure', jobs: [{ id: 7, name: 'build (win32-x64)', status: 'completed', conclusion: 'failure' }] }] });
  await assert.rejects(watch(42, f), /failure/);
  assert.match(f.panels.at(-1), /✗ build \(win32-x64\) +failed/);
  assert.ok(f.lines.includes('\nFailure details: build (win32-x64)') && f.lines.includes('boom'));
  assert.ok(f.lines.some(line => line.includes('gh run rerun 42') && line.includes('npm run release:watch -- 42')));
});
