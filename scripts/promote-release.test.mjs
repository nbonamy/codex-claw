import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectArtifacts, assembleArtifacts } from './release-artifacts.mjs';
import { stageRelease, promote } from './promote-release.mjs';

const identity = { version: '0.27.0', sha: 'a'.repeat(40), tag: 'v0.27.0', runId: 92, attempt: 1 };
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-promotion-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const download = path.join(root, 'download'), bundle = path.join(root, 'bundle');
  for (const [target, extensions] of Object.entries({ 'darwin-arm64': ['zip', 'dmg'],
    'win32-x64': ['zip', 'exe', 'nupkg', 'RELEASES'], 'linux-x64': ['zip', 'deb', 'rpm'], 'linux-arm64': ['zip', 'deb', 'rpm'] })) {
    const source = path.join(root, 'make', target); fs.mkdirSync(source, { recursive: true });
    for (const extension of extensions) fs.writeFileSync(path.join(source,
      extension === 'RELEASES' ? extension : `app-0.27.0.${extension}`), `fixture ${target} ${extension}`);
    await collectArtifacts({ source, output: path.join(download, `desktop-${target}-92-1`), identity, target,
      signing: target.startsWith('darwin') ? 'developer-id-notarized' : 'unsigned' });
  }
  await assembleArtifacts({ source: download, output: bundle, identity });
  const remote = { release: null, assets: new Map(), sha: identity.sha, calls: [], failUpload: false, releases: [] };
  function run(command, args) {
    assert.equal(command, 'gh'); remote.calls.push(args);
    if (args[0] === 'api') {
      if (args[1].includes('/git/ref/tags/')) return JSON.stringify({ object: { sha: remote.sha } });
      if (args[1].includes('/commits/')) return JSON.stringify({ sha: remote.sha });
      if (args[1].includes('/assets?')) return JSON.stringify([[...remote.assets.keys()].map(name => ({ name }))]);
      if (args[1].includes('/releases?')) return JSON.stringify([[...remote.releases, ...(remote.release ? [remote.release] : [])]]);
    }
    const option = key => args[args.indexOf(key) + 1];
    if (args[1] === 'create') {
      assert.ok(args.includes('--draft')); assert.ok(args.includes('--prerelease'));
      remote.release = { id: 1, tag_name: identity.tag, draft: true, prerelease: true };
    } else if (args[1] === 'upload') {
      assert.equal(remote.release.draft, true);
      assert.ok(!args.includes('--clobber'));
      if (remote.failUpload) throw new Error('upload interrupted');
      for (const file of args.slice(3, args.indexOf('--repo'))) remote.assets.set(path.basename(file), fs.readFileSync(file));
    } else if (args[1] === 'download') {
      const directory = option('--dir'); fs.mkdirSync(directory, { recursive: true });
      for (const [name, bytes] of remote.assets) fs.writeFileSync(path.join(directory, name), bytes);
    } else if (args[1] === 'edit') {
      remote.release.draft = false;
      remote.release.prerelease = !args.includes('--prerelease=false');
    } else assert.fail(`Unexpected GitHub operation: ${args.join(' ')}`);
    return '';
  }
  return { bundle, remote, options: { run } };
}

test('verified draft staging is resumable and default publication stays prerelease, never latest', async t => {
  const f = await setup(t);
  await stageRelease(f.bundle, identity, f.options);
  assert.equal(f.remote.release.draft, true);
  for (const name of ['korus-darwin-arm64.zip', 'korus-linux-arm64.deb', 'RELEASES', 'app-0.27.0.nupkg', 'darwin-arm64-provenance.json', 'release.json']) {
    assert.ok(f.remote.assets.has(name), name);
  }
  const uploads = f.remote.calls.filter(args => args[1] === 'upload').length;
  await stageRelease(f.bundle, identity, f.options);
  assert.equal(f.remote.calls.filter(args => args[1] === 'upload').length, uploads);
  await promote(f.bundle, identity, f.options);
  assert.deepEqual(f.remote.release, { id: 1, tag_name: identity.tag, draft: false, prerelease: true });
  assert.ok(f.remote.calls.find(args => args[1] === 'edit').includes('--latest=false'));
});

test('only explicit stable promotion removes the prerelease marker and advances latest', async t => {
  const f = await setup(t);
  await stageRelease(f.bundle, identity, f.options);
  await promote(f.bundle, identity, f.options);
  await promote(f.bundle, identity, { ...f.options, stable: true });
  assert.equal(f.remote.release.prerelease, false);
  assert.ok(f.remote.calls.at(-1).includes('--latest'));
  await assert.rejects(promote(f.bundle, identity, f.options), /stable|published/);
});

for (const failure of ['missing', 'corrupt', 'unexpected', 'moved-tag', 'changed-provenance']) {
  test(`publication rejects ${failure} without changing release visibility`, async t => {
    const f = await setup(t);
    await stageRelease(f.bundle, identity, f.options);
    if (failure === 'missing') f.remote.assets.delete('korus-darwin-arm64.zip');
    if (failure === 'corrupt') f.remote.assets.set('korus-darwin-arm64.zip', Buffer.from('corrupt'));
    if (failure === 'unexpected') f.remote.assets.set('unknown.zip', Buffer.from('unknown'));
    if (failure === 'moved-tag') f.remote.sha = 'b'.repeat(40);
    if (failure === 'changed-provenance') f.remote.assets.set('release.json', Buffer.from('{}'));
    await assert.rejects(promote(f.bundle, identity, f.options));
    assert.equal(f.remote.release.draft, true);
  });
}

test('upload failure leaves a draft and can be resumed without replacing assets', async t => {
  const f = await setup(t); f.remote.failUpload = true;
  await assert.rejects(stageRelease(f.bundle, identity, f.options), /interrupted/);
  assert.equal(f.remote.release.draft, true);
  f.remote.failUpload = false;
  await stageRelease(f.bundle, identity, f.options);
  await promote(f.bundle, identity, f.options);
  assert.equal(f.remote.release.prerelease, true);
});

test('stable promotion cannot roll back an existing newer stable release', async t => {
  const f = await setup(t);
  await stageRelease(f.bundle, identity, f.options);
  f.remote.releases.push({ tag_name: 'v0.28.0', draft: false, prerelease: false });
  await assert.rejects(promote(f.bundle, identity, { ...f.options, stable: true }), /newer stable/);
  assert.equal(f.remote.release.draft, true);
});

test('test tags and damaged local artifacts cannot create a GitHub release', async t => {
  const f = await setup(t);
  await assert.rejects(stageRelease(f.bundle, { ...identity, tag: 'build-test-123' }, f.options), /canonical/);
  fs.appendFileSync(path.join(f.bundle, 'darwin-arm64/korus-darwin-arm64.zip'), 'damage');
  await assert.rejects(stageRelease(f.bundle, identity, f.options), /checksum/);
  assert.equal(f.remote.calls.length, 0);
});
