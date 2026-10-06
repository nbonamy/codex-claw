import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { collectArtifacts } from './release-artifacts.mjs';
import { publishDesktop } from './publish-desktop.mjs';

const identity = { version: '0.27.0', sha: 'a'.repeat(40), tag: 'v0.27.0', runId: 92, attempt: 1 };

// Publication policy tests, not proof of GitHub Actions or network behavior.
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [target, extensions] of Object.entries({ 'darwin-arm64': ['zip', 'dmg'],
    'win32-x64': ['zip', 'exe', 'nupkg', 'RELEASES'], 'linux-x64': ['zip', 'deb', 'rpm'], 'linux-arm64': ['zip', 'deb', 'rpm'] })) {
    const source = path.join(root, 'make', target); fs.mkdirSync(source, { recursive: true });
    for (const extension of extensions) fs.writeFileSync(path.join(source,
      extension === 'RELEASES' ? extension : `app-0.27.0.${extension}`), `fixture ${target} ${extension}`);
    await collectArtifacts({ source, output: path.join(root, `desktop-${target}-92-1`), identity, target,
      signing: target.startsWith('darwin') ? 'developer-id-notarized' : 'unsigned' });
  }
  const remote = { release: null, assets: new Map(), calls: [], sha: identity.sha, delayed: 0, failUpload: false, corrupt: false, newer: false };
  function upload(files) {
    if (remote.failUpload) throw new Error('upload interrupted');
    for (const file of files) remote.assets.set(path.basename(file), fs.readFileSync(file));
  }
  function run(command, args) {
    assert.equal(command, 'gh'); remote.calls.push(args);
    if (args[0] === 'api') {
      if (args[1].includes('/git/ref/')) return JSON.stringify({ object: { sha: remote.sha } });
      if (args[1].includes('/commits/')) return JSON.stringify({ sha: remote.sha });
      if (args[1].includes('/assets?')) return JSON.stringify([[...remote.assets].map(([name, bytes]) => ({
        name, size: bytes.length, state: 'uploaded', digest: 'sha256:' + (remote.corrupt ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex')),
      }))]);
      // A list can remain stale after create: the publisher must use the release itself.
      if (args[1].includes('/releases?')) return JSON.stringify([remote.newer ? [{ id: 2, tag_name: 'v0.28.0', draft: false, prerelease: false }] : []]);
    }
    if (args[1] === 'create') {
      assert.ok(args.includes('--draft')); assert.ok(args.includes('--prerelease'));
      remote.release = { databaseId: 1, tagName: identity.tag, isDraft: true, isPrerelease: true };
      upload(args.slice(3, args.indexOf('--repo')));
    } else if (args[1] === 'view') {
      if (remote.delayed-- > 0) throw new Error('release not found');
      return JSON.stringify(remote.release);
    } else if (args[1] === 'upload') {
      assert.ok(!args.includes('--clobber'));
      upload(args.slice(3, args.indexOf('--repo')));
    } else if (args[1] === 'edit') {
      remote.release.isDraft = false;
      remote.release.isPrerelease = !args.includes('--prerelease=false');
    } else assert.fail(`Unexpected operation: ${args.join(' ')}`);
    return '';
  }
  return { root, remote, run };
}

test('creation attaches installers before publication even when the release list stays stale', async t => {
  const f = await setup(t);
  f.remote.delayed = 1;
  await publishDesktop(f.root, identity, 'prerelease', f.run);
  assert.deepEqual(f.remote.release, { databaseId: 1, tagName: identity.tag, isDraft: false, isPrerelease: true });
  assert.ok(f.remote.assets.has('korus-macos-arm64.dmg'));
  assert.ok(f.remote.assets.has('RELEASES'));
  assert.ok(f.remote.assets.has('linux-arm64-provenance.json'));
  assert.equal(f.remote.calls.filter(args => args[1] === 'create').length, 1);
  const create = f.remote.calls.find(args => args[1] === 'create');
  assert.ok(create.includes('--verify-tag'));
  // Existing tags pin the source; an old explicit target invokes GitHub's
  // workflow-write permission check when main's workflows have changed.
  assert.equal(create.includes('--target'), false);
  assert.ok(f.remote.calls.find(args => args[1] === 'edit').includes('--latest=false'));
});

for (const failure of ['corrupt', 'upload', 'moved-tag', 'newer-stable']) test(`publication refuses ${failure}`, async t => {
  const f = await setup(t);
  if (failure === 'corrupt') f.remote.corrupt = true;
  if (failure === 'upload') f.remote.failUpload = true;
  if (failure === 'moved-tag') f.remote.sha = 'b'.repeat(40);
  if (failure === 'newer-stable') f.remote.newer = true;
  await assert.rejects(publishDesktop(f.root, identity, 'latest', f.run), /checksum|interrupted|SHA|newer/);
  assert.equal(f.remote.calls.some(args => args[1] === 'edit'), false);
});

test('explicit latest publishes stable and damaged local files never create a draft', async t => {
  const f = await setup(t);
  await publishDesktop(f.root, identity, 'latest', f.run);
  assert.ok(f.remote.calls.find(args => args[1] === 'edit').includes('--latest'));
  assert.equal(f.remote.release.isPrerelease, false);
  f.remote.calls.length = 0;
  fs.appendFileSync(path.join(f.root, 'desktop-darwin-arm64-92-1/korus-darwin-arm64.zip'), 'damage');
  await assert.rejects(publishDesktop(f.root, identity, 'prerelease', f.run), /checksum/);
  assert.equal(f.remote.calls.length, 0);
});
