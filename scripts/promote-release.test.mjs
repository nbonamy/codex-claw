import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { collectArtifacts, assembleArtifacts } from './release-artifacts.mjs';
import { promote } from './promote-release.mjs';
import product from '../core/src/product.json' with { type: 'json' };

const identity = { version: '0.27.0', sha: 'a'.repeat(40), tag: 'v0.27.0', runId: 92, attempt: 1 };
async function setup(t, failure) {
  // /tmp avoids macOS TMPDIR path components outside the deployment allowlist.
  const root = fs.mkdtempSync('/tmp/app-promotion-test-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const download = path.join(root, 'download'), bundle = path.join(root, 'bundle'), remote = path.join(root, 'server');
  const previous = { currentRelease: '0.26.0', releases: [{ version: '0.26.0', updateTo: { url: 'old.zip' } }] };
  const feed = path.join(remote, 'releases/darwin/arm64/RELEASES.json');
  fs.mkdirSync(path.dirname(feed), { recursive: true }); fs.writeFileSync(feed, JSON.stringify(previous));
  for (const [target, extensions] of Object.entries({ 'darwin-arm64': ['zip', 'dmg', 'RELEASES.json'],
    'win32-x64': ['zip', 'exe', 'nupkg', 'RELEASES'], 'linux-x64': ['zip', 'deb', 'rpm'], 'linux-arm64': ['zip', 'deb', 'rpm'] })) {
    const source = path.join(root, 'make', target); fs.mkdirSync(source, { recursive: true });
    for (const extension of extensions) fs.writeFileSync(path.join(source,
      extension.startsWith('RELEASES') ? extension : `app-0.27.0.${extension}`), `fixture ${target}`);
    if (target === 'darwin-arm64') fs.writeFileSync(path.join(source, 'RELEASES.json'), JSON.stringify({ currentRelease: '0.27.0', releases: [{
      version: '0.27.0', updateTo: { version: '0.27.0', url: `${product.updateBaseUrl}/darwin/arm64/app-0.27.0.zip` },
    }] }));
    await collectArtifacts({ source, output: path.join(download, `desktop-${target}-92-1`), identity, target,
      signing: target.startsWith('darwin') ? 'developer-id-notarized' : 'unsigned' });
  }
  await assembleArtifacts({ source: download, output: bundle, identity });
  const key = path.join(root, 'key'), knownHosts = path.join(root, 'known_hosts');
  fs.writeFileSync(key, 'fixture'); fs.writeFileSync(knownHosts, 'fixture');
  let transfers = 0;
  function run(command, args, options) {
    assert.ok(args.includes('StrictHostKeyChecking=yes'));
    if (command === 'ssh') {
      // Exercise the actual remote transaction on a disposable filesystem.
      return execFileSync('sh', ['-s'], { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
    }
    assert.equal(command, 'scp');
    assert.equal(JSON.parse(fs.readFileSync(feed)).currentRelease, '0.26.0', 'feed stays unchanged throughout asset upload');
    if (++transfers === 4 && failure === 'upload') throw new Error('fixture upload failed');
    const destination = args.at(-1).split(':').slice(1).join(':');
    fs.copyFileSync(args.at(-2), destination);
    if (failure === 'corrupt' && transfers === 4) fs.appendFileSync(destination, 'corrupt');
    if (failure === 'concurrent' && transfers === 4) fs.writeFileSync(feed, JSON.stringify({ currentRelease: '0.26.0', releases: [], concurrent: true }));
  }
  return { bundle, feed, remote, previous, options: { run, env: { APP_PUBLISH_HOST: 'example.invalid', APP_PUBLISH_USER: 'release',
    APP_PUBLISH_SSH_KEY: key, APP_PUBLISH_KNOWN_HOSTS: knownHosts, APP_PUBLISH_ROOT: remote } } };
}

test('promotion uploads and verifies every target before atomically advancing the compatible feed', async t => {
  const f = await setup(t);
  await promote(f.bundle, identity, f.options);
  const current = JSON.parse(fs.readFileSync(f.feed));
  assert.equal(current.currentRelease, '0.27.0');
  assert.deepEqual(current.releases.map(release => release.version), ['0.26.0', '0.27.0']);
  assert.equal(fs.readFileSync(path.join(f.remote, 'downloads', product.downloadFileName), 'utf8'), 'fixture darwin-arm64');
  assert.ok(fs.existsSync(path.join(f.remote, `releases/builds/0.27.0/${identity.sha}/92-1/win32-x64/app-0.27.0.exe`)));
  await assert.rejects(promote(f.bundle, identity, f.options), /advance/);
});

for (const failure of ['upload', 'corrupt', 'concurrent']) test(`${failure} prevents feed promotion`, async t => {
  const f = await setup(t, failure);
  await assert.rejects(promote(f.bundle, identity, f.options));
  assert.equal(JSON.parse(fs.readFileSync(f.feed)).currentRelease, '0.26.0');
  assert.ok(!fs.existsSync(path.join(f.remote, '.promotion-lock')));
});

test('promotion requires explicit SSH configuration before contacting the server', async t => {
  const f = await setup(t);
  await assert.rejects(promote(f.bundle, identity, { env: {}, run: () => assert.fail('must not contact SSH') }), /Explicit APP_PUBLISH/);
});
