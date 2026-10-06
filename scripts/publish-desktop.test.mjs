import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { publishDesktop } from './publish-desktop.mjs';

// Publication policy against a fake gh, not proof of GitHub Actions or network behavior.
function setup(t, release) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-policy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [target, extensions] of Object.entries({ 'darwin-arm64': ['zip', 'dmg'], 'win32-x64': ['zip', 'exe', 'nupkg', 'RELEASES'],
    'linux-x64': ['zip', 'deb', 'rpm'], 'linux-arm64': ['zip', 'deb', 'rpm'] })) {
    fs.mkdirSync(path.join(directory, `desktop-${target}`), { recursive: true });
    for (const extension of extensions) fs.writeFileSync(path.join(directory, `desktop-${target}`, `${target}.${extension}`), extension);
  }
  const remote = { release, calls: [] };
  const run = (command, args) => {
    assert.equal(command, 'gh');
    remote.calls.push(args);
    if (args[1] === 'view') {
      if (!remote.release) throw Object.assign(new Error('failed'), { stderr: 'release not found' });
      return JSON.stringify(remote.release);
    }
    if (args[1] === 'create') remote.release = { isDraft: true, isPrerelease: true };
    if (args[1] === 'edit') remote.release = { isDraft: false, isPrerelease: args.includes('--prerelease') };
    return '';
  };
  return { directory, remote, run, verbs: () => remote.calls.map(call => call[1]) };
}

test('a new release is staged as a draft, filled with every installer, then published as a prerelease', async t => {
  const f = setup(t, null);
  await publishDesktop({ directory: f.directory, tag: 'v0.27.0', channel: 'prerelease', run: f.run });
  assert.deepEqual(f.verbs(), ['view', 'create', 'view', 'upload', 'edit', 'view']);
  assert.equal(f.remote.calls.find(call => call[1] === 'upload').filter(arg => arg.endsWith('.exe')).length, 1);
  assert.deepEqual(f.remote.release, { isDraft: false, isPrerelease: true });
});

test('latest publishes a leftover draft without recreating it', async t => {
  const f = setup(t, { isDraft: true, isPrerelease: true });
  await publishDesktop({ directory: f.directory, tag: 'v0.27.0', channel: 'latest', run: f.run });
  assert.ok(!f.verbs().includes('create'));
  assert.ok(f.remote.calls.find(call => call[1] === 'edit').includes('--latest'));
  assert.deepEqual(f.remote.release, { isDraft: false, isPrerelease: false });
});

test('an already published release is never modified', async t => {
  const f = setup(t, { isDraft: false, isPrerelease: false });
  await assert.rejects(publishDesktop({ directory: f.directory, tag: 'v0.27.0', channel: 'prerelease', run: f.run }), /already published/);
  assert.deepEqual(f.verbs(), ['view']);
});

test('nothing is staged when a platform is incomplete', async t => {
  const f = setup(t, null);
  fs.rmSync(path.join(f.directory, 'desktop-linux-x64', 'linux-x64.rpm'));
  await assert.rejects(publishDesktop({ directory: f.directory, tag: 'v0.27.0', channel: 'latest', run: f.run }), /Missing \.rpm artifact for linux-x64/);
  assert.deepEqual(f.remote.calls, []);
});
