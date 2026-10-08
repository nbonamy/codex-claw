import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkPackagedMobileSimulator } from './mobile-simulator-check.mjs';

test('packaged smoke executes the shipped companion without Python/PATH and rejects missing or mismatched resources', { skip: process.platform === 'win32' }, () => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'packaged-mobile-'));
  const directory = path.join(resources, 'mobile-simulator');
  try {
    fs.mkdirSync(path.join(directory, 'Resources'), { recursive: true });
    for (const file of ['idb.proto', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'Resources/SimulatorFrameworkBridge-iOS']) fs.writeFileSync(path.join(directory, file), 'fixture');
    const release = { version: '1.2.3', sha256: 'verified' };
    fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify(release));
    fs.writeFileSync(path.join(directory, 'idb_companion'), `#!${process.execPath}\nif(process.env.PATH!==''||process.argv[2]!=='--version')process.exit(1);console.log(JSON.stringify({build_date:'fixture'}));`, { mode: 0o755 });
    checkPackagedMobileSimulator(resources, release, { PATH: '' });
    assert.throws(() => checkPackagedMobileSimulator(resources, { ...release, version: 'wrong' }, { PATH: '' }), /Incorrect bundled/);
    fs.unlinkSync(path.join(directory, 'Resources/SimulatorFrameworkBridge-iOS'));
    assert.throws(() => checkPackagedMobileSimulator(resources, release, { PATH: '' }), /Missing bundled iOS resource/);
  } finally { fs.rmSync(resources, { recursive: true, force: true }); }
});
