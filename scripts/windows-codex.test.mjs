import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareWindowsCodex } from './windows-codex.mjs';

function fixture(arch = 'x64', { wrongMachine = false, missingHelper = false, wrongVersion = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codex windows '));
  const source = path.join(root, 'source');
  const outputDir = path.join(root, 'installed');
  const version = '0.159.3';
  const triple = `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`;
  const bytes = Buffer.alloc(134);
  bytes.write('MZ');
  bytes.writeUInt32LE(128, 60);
  bytes.write('PE\0\0', 128);
  bytes.writeUInt16LE(wrongMachine ? 0x14c : arch === 'x64' ? 0x8664 : 0xaa64, 132);
  for (const entry of ['bin/codex.exe', 'bin/codex-code-mode-host.exe', 'codex-path/rg.exe',
    'codex-resources/codex-command-runner.exe', 'codex-resources/codex-windows-sandbox-setup.exe']) {
    if (missingHelper && entry.includes('sandbox-setup')) continue;
    mkdirSync(path.dirname(path.join(source, entry)), { recursive: true });
    writeFileSync(path.join(source, entry), bytes);
  }
  writeFileSync(path.join(source, 'codex-package.json'), JSON.stringify({
    version, target: triple, entrypoint: 'bin/codex.exe', layoutVersion: 1,
  }));
  mkdirSync(path.join(source, 'codex-resources/voice/licenses'), { recursive: true });
  writeFileSync(path.join(source, 'codex-resources/voice/licenses/NOTICE'), 'upstream notices');
  const archivePath = path.join(root, 'package.tar.gz');
  execFileSync('tar', ['-czf', archivePath, '-C', source, '.']);
  const archive = readFileSync(archivePath);
  const urls = [];
  const dependencies = {
    fetch: async (url) => {
      urls.push(url);
      return url.endsWith('/release.json') ? Response.json({
        tag_name: `rust-v${version}`,
        assets: [{ name: `codex-package-${triple}.tar.gz`, digest: `sha256:${createHash('sha256').update(archive).digest('hex')}` }],
      }) : new Response(archive);
    },
    // Exercise real archive extraction; Windows executable execution is the
    // OS boundary substituted on non-Windows test hosts.
    execFileSync: (command, args, options) => command === 'tar'
      ? execFileSync(command, args, options) : `codex-cli ${wrongVersion ? '0.1.0' : version}\n`,
  };
  return {
    root, urls, dependencies,
    options: { config: { version, targets: [{ platform: 'win32', arch,
      archive: `codex-package-${triple}.tar.gz`, sha256: createHash('sha256').update(archive).digest('hex') }] }, arch, outputDir },
  };
}

for (const arch of ['x64', 'arm64']) {
  test(`installs the complete verified Windows ${arch} package, reuses it, and repairs missing helpers`, async () => {
    const { root, options, dependencies, urls } = fixture(arch);
    try {
      mkdirSync(options.outputDir);
      writeFileSync(path.join(options.outputDir, '.gitignore'), '*\n!.gitignore\n');
      const executable = await prepareWindowsCodex(options, dependencies);
      assert.equal(executable, path.join(options.outputDir, 'bin/codex.exe'));
      assert.equal(readFileSync(path.join(options.outputDir, '.gitignore'), 'utf8'), '*\n!.gitignore\n');
      assert.equal(readFileSync(path.join(options.outputDir, 'codex-resources/voice/licenses/NOTICE'), 'utf8'), 'upstream notices');
      assert.equal(urls.length, 2);
      assert.equal(await prepareWindowsCodex(options, dependencies), executable);
      assert.equal(urls.length, 2);
      rmSync(path.join(options.outputDir, 'codex-resources/codex-windows-sandbox-setup.exe'));
      await prepareWindowsCodex(options, dependencies);
      assert.equal(urls.length, 4);
      assert.equal(readFileSync(path.join(options.outputDir, 'codex-resources/codex-windows-sandbox-setup.exe')).toString('ascii', 0, 2), 'MZ');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('rejects modified archive bytes before extracting or replacing an existing installation', async () => {
  const { root, options, dependencies } = fixture();
  try {
    mkdirSync(options.outputDir);
    writeFileSync(path.join(options.outputDir, 'previous'), 'keep');
    let extracted = false;
    await assert.rejects(prepareWindowsCodex(options, {
      fetch: async (url) => url.endsWith('/release.json') ? dependencies.fetch(url) : new Response('modified'),
      execFileSync: () => { extracted = true; },
    }), /checksum mismatch/);
    assert.equal(extracted, false);
    assert.equal(readFileSync(path.join(options.outputDir, 'previous'), 'utf8'), 'keep');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const cached of [false, true]) {
  test(`rejects upstream metadata that disagrees with the pinned checksum${cached ? ' even with a cached installation' : ''}`, async () => {
    const { root, options, dependencies } = fixture();
    try {
      if (cached) await prepareWindowsCodex(options, dependencies);
      else mkdirSync(options.outputDir);
      writeFileSync(path.join(options.outputDir, 'previous'), 'keep');
      options.config.targets[0].sha256 = '0'.repeat(64);
      let extracted = false;
      await assert.rejects(prepareWindowsCodex(options, {
        ...dependencies,
        execFileSync: (command, args, runOptions) => {
          if (command === 'tar') extracted = true;
          return dependencies.execFileSync(command, args, runOptions);
        },
      }), /pinned checksum/);
      assert.equal(extracted, false);
      assert.equal(readFileSync(path.join(options.outputDir, 'previous'), 'utf8'), 'keep');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

for (const invalid of ['wrongMachine', 'missingHelper', 'wrongVersion']) {
  test(`rejects a package with ${invalid} and preserves the previous installation`, async () => {
    const { root, options, dependencies } = fixture('x64', { [invalid]: true });
    try {
      mkdirSync(options.outputDir);
      writeFileSync(path.join(options.outputDir, 'previous'), 'keep');
      await assert.rejects(prepareWindowsCodex(options, dependencies), /failed validation/);
      assert.equal(readFileSync(path.join(options.outputDir, 'previous'), 'utf8'), 'keep');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('failed promotion restores the previous installation', async (t) => {
  const { root, options, dependencies } = fixture();
  const rename = fs.renameSync;
  const promotionError = Object.assign(new Error('promotion I/O error'), { code: 'EIO' });
  mkdirSync(options.outputDir);
  writeFileSync(path.join(options.outputDir, 'previous'), 'keep');
  t.mock.method(console, 'warn', () => {});
  t.mock.method(fs, 'renameSync', (source, destination) => {
    if (path.basename(source) === 'package') throw promotionError;
    return rename(source, destination);
  });
  try {
    await assert.rejects(prepareWindowsCodex(options, dependencies), error => error === promotionError);
    assert.equal(readFileSync(path.join(options.outputDir, 'previous'), 'utf8'), 'keep');
  } finally {
    t.mock.restoreAll();
    rmSync(root, { recursive: true, force: true });
  }
});
