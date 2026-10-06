import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const targets = ['darwin-arm64', 'win32-x64', 'linux-x64', 'linux-arm64'];
export const requiredJobs = ['quality', ...targets.map(target => `build (${target})`), 'stage'];
export const workflow = 'desktop-build.yml';

export function validateIdentity(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value.version) || !/^[a-f0-9]{40}$/.test(value.sha)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.tag)
    || !Number.isSafeInteger(value.runId) || value.runId < 1
    || !Number.isSafeInteger(value.attempt) || value.attempt < 1) throw new Error('Invalid release identity.');
}

export function assertIdentity(actual, expected) {
  validateIdentity(actual);
  for (const key of ['version', 'sha', 'tag', 'runId', 'attempt']) {
    if (actual[key] !== expected[key]) throw new Error(`Release identity mismatch: ${key}.`);
  }
}

export async function checksum(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

export async function verifyTarget(directory, expected, target) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'provenance.json'), 'utf8'));
  assertIdentity(manifest, expected);
  if (!targets.includes(target) || manifest.target !== target || manifest.schemaVersion !== 1) throw new Error('Invalid release target.');
  if (manifest.signing !== (target === 'darwin-arm64' ? 'developer-id-notarized' : 'unsigned')) throw new Error('Invalid signing provenance.');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Missing release files.');
  const names = new Set();
  for (const file of manifest.files) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file.name) || names.has(file.name)
      || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid or duplicate artifact filename/checksum.');
    names.add(file.name);
    const location = path.join(directory, file.name);
    const info = await fs.lstat(location);
    if (!info.isFile() || info.size !== file.size || await checksum(location) !== file.sha256) throw new Error(`Artifact checksum/size mismatch: ${target}/${file.name}`);
  }
  const extensions = target.startsWith('darwin') ? ['.zip', '.dmg', 'RELEASES.json']
    : target.startsWith('win32') ? ['.zip', '.exe', '.nupkg', 'RELEASES'] : ['.zip', '.deb', '.rpm'];
  for (const extension of extensions) {
    if (![...names].some(name => name.endsWith(extension))) throw new Error(`Missing ${extension} artifact for ${target}.`);
  }
  const actualFiles = await fs.readdir(directory);
  if (actualFiles.some(name => name !== 'provenance.json' && !names.has(name))) throw new Error(`Unexpected files in ${target}.`);
  return manifest;
}

export async function verifyBundle(directory, expected) {
  const index = JSON.parse(await fs.readFile(path.join(directory, 'release.json'), 'utf8'));
  assertIdentity(index, expected);
  if (index.schemaVersion !== 1 || JSON.stringify(index.targets) !== JSON.stringify(targets)) throw new Error('Incomplete required target set.');
  return Promise.all(targets.map(target => verifyTarget(path.join(directory, target), expected, target)));
}
