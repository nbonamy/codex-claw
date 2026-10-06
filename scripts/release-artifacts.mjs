import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { targets, validateIdentity, verifyTarget, verifyBundle, checksum } from './release-contract.mjs';
import nodeRelease from '../node-runtime-release.json' with { type: 'json' };
import codexRelease from '../codex-app-server-release.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, '..');

export async function collectArtifacts({ source, output, identity, target, signing }) {
  validateIdentity(identity);
  if (!targets.includes(target)) throw new Error(`Unsupported target: ${target}`);
  await fs.mkdir(output, { recursive: true });
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /\.(zip|dmg|exe|nupkg|deb|rpm)$|^RELEASES(\.json)?$/.test(entry.name)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name) || files.some(item => item.name === entry.name)) throw new Error(`Unsafe/duplicate artifact name: ${entry.name}`);
        await fs.copyFile(file, path.join(output, entry.name));
        files.push({ name: entry.name, size: (await fs.stat(file)).size, sha256: await checksum(file) });
      }
    }
  }
  await visit(source);
  files.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(path.join(output, 'provenance.json'), JSON.stringify({ schemaVersion: 1,
    ...identity, target, signing, nodeVersion: nodeRelease.version, codexVersion: codexRelease.version,
    lockfileSha256: await checksum(path.join(root, 'package-lock.json')), files }, null, 2) + '\n');
  await verifyTarget(output, identity, target);
}

export async function assembleArtifacts({ source, output, identity }) {
  validateIdentity(identity);
  await fs.mkdir(output, { recursive: true });
  for (const target of targets) {
    const directory = path.join(source, `desktop-${target}-${identity.runId}-${identity.attempt}`);
    await verifyTarget(directory, identity, target);
    await fs.cp(directory, path.join(output, target), { recursive: true, errorOnExist: true, force: false });
  }
  await fs.writeFile(path.join(output, 'release.json'), JSON.stringify({ schemaVersion: 1, ...identity, targets }, null, 2) + '\n');
  await verifyBundle(output, identity);
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    source: { type: 'string' }, output: { type: 'string' }, target: { type: 'string' },
  } });
  const identity = { version: process.env.RELEASE_VERSION, sha: process.env.RELEASE_SHA, tag: process.env.RELEASE_TAG,
    runId: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
  validateIdentity(identity);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (head !== identity.sha || process.env.GITHUB_SHA !== identity.sha || pkg.version !== identity.version
    || process.env.GITHUB_REF !== `refs/tags/${identity.tag}`) throw new Error('Checkout SHA/tag/version does not match dispatch identity.');
  if (positionals[0] === 'validate') return;
  if (positionals[0] === 'collect') {
    if (`${process.platform}-${process.arch}` !== values.target) throw new Error('Build target does not match native runner.');
    if (process.platform === 'darwin' && (process.env.APP_SKIP_SIGNING === '1' || process.env.TEST)) throw new Error('CI macOS artifacts must be signed and notarized.');
    await collectArtifacts({ ...values, identity, signing: process.platform === 'darwin' ? 'developer-id-notarized' : 'unsigned' });
  } else if (positionals[0] === 'assemble') await assembleArtifacts({ ...values, identity });
  else throw new Error('Expected validate, collect or assemble.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
