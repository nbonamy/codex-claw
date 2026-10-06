import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectArtifacts, assembleArtifacts } from './release-artifacts.mjs';
import { verifyBundle } from './release-contract.mjs';

const identity = { version: '0.27.0', sha: 'a'.repeat(40), tag: 'v0.27.0', runId: 92, attempt: 1 };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'app-artifacts-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'download');
  for (const [target, extensions] of Object.entries({ 'darwin-arm64': ['zip', 'dmg'],
    'win32-x64': ['zip', 'exe', 'nupkg', 'RELEASES'], 'linux-x64': ['zip', 'deb', 'rpm'], 'linux-arm64': ['zip', 'deb', 'rpm'] })) {
    const make = path.join(root, 'make', target);
    await fs.mkdir(make, { recursive: true });
    for (const extension of extensions) await fs.writeFile(path.join(make,
      extension.startsWith('RELEASES') ? extension : `app-0.27.0.${extension}`), `fixture ${target} ${extension}`);
    await collectArtifacts({ source: make, output: path.join(source, `desktop-${target}-92-1`), identity, target,
      signing: target.startsWith('darwin') ? 'developer-id-notarized' : 'unsigned' });
  }
  return { root, source, output: path.join(root, 'bundle'), identity };
}

test('assembled bundle preserves every target and checksums verified artifact bytes', async t => {
  const f = await fixture(t);
  await assembleArtifacts(f);
  const manifests = await verifyBundle(f.output, identity);
  assert.equal(manifests.length, 4);
  assert.equal(manifests.find(m => m.target === 'win32-x64').signing, 'unsigned');
  assert.deepEqual(manifests.find(m => m.target === 'darwin-arm64').files.map(f => f.name),
    ['korus-darwin-arm64.zip', 'korus-macos-arm64.dmg']);
  assert.deepEqual(manifests.find(m => m.target === 'win32-x64').files.map(f => f.name),
    ['app-0.27.0.nupkg', 'korus-win32-x64-setup.exe', 'korus-win32-x64.zip', 'RELEASES'].sort((a, b) => a.localeCompare(b)));
  await fs.appendFile(path.join(f.output, 'linux-arm64/korus-linux-arm64.deb'), 'corrupt');
  await assert.rejects(verifyBundle(f.output, identity), /checksum\/size/);
});

for (const change of ['missing-target', 'wrong-sha', 'wrong-version', 'wrong-attempt', 'missing-installer', 'path-traversal']) {
  test(`staging refuses ${change}`, async t => {
    const f = await fixture(t);
    const target = path.join(f.source, 'desktop-win32-x64-92-1');
    const file = path.join(target, 'provenance.json');
    const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
    if (change === 'missing-target') await fs.rm(target, { recursive: true });
    else {
      if (change === 'wrong-sha') manifest.sha = 'b'.repeat(40);
      if (change === 'wrong-version') manifest.version = '0.28.0';
      if (change === 'wrong-attempt') manifest.attempt = 2;
      if (change === 'path-traversal') manifest.files[0].name = '../outside';
      if (change === 'missing-installer') {
        manifest.files = manifest.files.filter(item => !item.name.endsWith('.exe'));
        await fs.rm(path.join(target, 'korus-win32-x64-setup.exe'));
      }
      await fs.writeFile(file, JSON.stringify(manifest));
    }
    await assert.rejects(assembleArtifacts(f));
  });
}
