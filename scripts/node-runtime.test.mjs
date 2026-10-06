import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { nodeRuntimeTarget, prepareNodeRuntime } from './node-runtime.mjs';

for (const platform of ['darwin', 'linux', 'win32']) {
  for (const arch of ['x64', 'arm64']) {
    test(`selects a pinned ${platform}/${arch} artifact`, () => {
      const target = nodeRuntimeTarget(platform, arch);
      assert.equal(target.executable, platform === 'win32' ? 'node.exe' : 'node');
      assert.ok(target.url.endsWith(`-${platform === 'win32' ? 'win' : platform}-${arch}.${platform === 'win32' ? 'zip' : 'tar.gz'}`));
      assert.match(target.sha256, /^[a-f0-9]{64}$/);
    });
  }
}
test('rejects unsupported targets before downloading anything', () => {
  assert.throws(() => nodeRuntimeTarget('linux', 'ia32'), /No pinned Node runtime/);
});

test('rejects tampered downloads before extracting or installing them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-runtime-test-'));
  try {
    let extracted = false;
    await assert.rejects(prepareNodeRuntime({ platform: 'linux', arch: 'x64', outputDir: path.join(root, 'out'), cacheDir: path.join(root, 'cache') }, {
      fetch: async () => new Response('tampered'),
      extract: () => { extracted = true; },
    }), /checksum mismatch/);
    assert.equal(extracted, false);
    await assert.rejects(readFile(path.join(root, 'out/node')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('extracts only the runtime and notices, verifies cached bytes, and replaces a corrupt cache', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-runtime-test-'));
  try {
    const directory = 'node-v22.0.0-linux-x64';
    await mkdir(path.join(root, directory, 'bin'), { recursive: true });
    await writeFile(path.join(root, directory, 'bin/node'), 'fixture executable');
    await writeFile(path.join(root, directory, 'bin/npm'), 'not shipped');
    await writeFile(path.join(root, directory, 'LICENSE'), 'fixture notices');
    const archivePath = path.join(root, 'fixture.tar.gz');
    execFileSync('tar', ['-czf', archivePath, '-C', root, directory]);
    const archive = await readFile(archivePath);
    const config = { version: '22.0.0', checksums: { 'linux-x64': createHash('sha256').update(archive).digest('hex') } };
    const options = { platform: 'linux', arch: 'x64', outputDir: path.join(root, 'out'), cacheDir: path.join(root, 'cache'), config };
    let downloads = 0;
    const dependencies = { fetch: async () => { downloads++; return new Response(archive); } };
    const executable = await prepareNodeRuntime(options, dependencies);
    assert.equal(await readFile(executable, 'utf8'), 'fixture executable');
    assert.equal(await readFile(path.join(options.outputDir, 'LICENSE'), 'utf8'), 'fixture notices');
    await assert.rejects(readFile(path.join(options.outputDir, 'npm')), { code: 'ENOENT' });
    await prepareNodeRuntime(options, dependencies);
    assert.equal(downloads, 1);
    await writeFile(path.join(options.cacheDir, `${directory}.tar.gz`), 'corrupt cache');
    await prepareNodeRuntime(options, dependencies);
    assert.equal(downloads, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
