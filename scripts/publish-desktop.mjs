import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import product from '../core/src/product.json' with { type: 'json' };
import { checksum, verifyArtifacts } from './release-contract.mjs';

// The final job of the build workflow. No second workflow or combined bundle.
export async function publishDesktop(directory, identity, channel, run = execFileSync) {
  if (!['prerelease', 'latest'].includes(channel) || identity.tag !== `v${identity.version}`) {
    throw new Error('Publication requires a canonical version tag and prerelease/latest channel.');
  }
  const manifests = await verifyArtifacts(directory, identity);
  const gh = args => run('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900_000 });
  const api = route => JSON.parse(gh(['api', `repos/${product.repository}/${route}`, '-H', 'Cache-Control: no-cache']));
  const view = () => JSON.parse(gh(['release', 'view', identity.tag, '--repo', product.repository,
    '--json', 'databaseId,tagName,isDraft,isPrerelease']));
  const releases = () => JSON.parse(gh(['api', `repos/${product.repository}/releases?per_page=100`,
    '--paginate', '--slurp', '-H', 'Cache-Control: no-cache'])).flat();
  function verifyTag() {
    api(`git/ref/tags/${identity.tag}`);
    if (api(`commits/${identity.tag}`).sha !== identity.sha) throw new Error('Remote tag no longer matches the build SHA.');
  }
  verifyTag();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-publication-'));
  try {
    const files = new Map();
    for (const manifest of manifests) {
      const target = path.join(directory, `desktop-${manifest.target}-${identity.runId}-${identity.attempt}`);
      for (const file of manifest.files) {
        if (files.has(file.name)) throw new Error(`Duplicate release asset: ${file.name}`);
        files.set(file.name, { ...file, file: path.join(target, file.name) });
      }
      const name = `${manifest.target}-provenance.json`;
      const file = path.join(temporary, name);
      await fs.copyFile(path.join(target, 'provenance.json'), file);
      files.set(name, { file, size: (await fs.stat(file)).size, sha256: await checksum(file) });
    }
    const existing = releases().find(release => release.tag_name === identity.tag);
    if (!existing) {
      // gh uploads through the creation response's ID, without re-listing drafts.
      gh(['release', 'create', identity.tag, ...[...files.values()].map(item => item.file),
        '--repo', product.repository, '--verify-tag', '--target', identity.sha,
        '--draft', '--prerelease', '--latest=false', '--title', `${product.name} ${identity.version}`,
        '--notes', `Build: ${identity.sha}\nActions: ${product.repositoryUrl}/actions/runs/${identity.runId}/attempts/${identity.attempt}\n\nWindows installers are unsigned. Prereleases are manual downloads only.`]);
    }
    let release;
    // Creation can complete before tag lookups observe the draft.
    for (let attempt = 0; ; attempt++) {
      try { release = view(); break; }
      catch (error) {
        const detail = String(error.stderr ?? error.message);
        if (attempt === 5 || !/not found|HTTP 404/i.test(detail)) throw error;
        await delay(1000 * (attempt + 1));
      }
    }
    if (release.tagName !== identity.tag) throw new Error('Release tag mismatch.');
    async function verifyAssets(allowMissing) {
      const assets = JSON.parse(gh(['api', `repos/${product.repository}/releases/${release.databaseId}/assets?per_page=100`,
        '--paginate', '--slurp', '-H', 'Cache-Control: no-cache'])).flat();
      const names = new Set();
      for (const asset of assets) {
        const expected = files.get(asset.name);
        if (!expected || names.has(asset.name)) throw new Error('Unexpected or duplicate GitHub release assets.');
        if (asset.state !== 'uploaded' || asset.size !== expected.size || asset.digest !== `sha256:${expected.sha256}`) {
          throw new Error(`GitHub asset checksum/size mismatch: ${asset.name}`);
        }
        names.add(asset.name);
      }
      const missing = [...files.keys()].filter(name => !names.has(name));
      if (!allowMissing && missing.length) throw new Error(`Missing GitHub release assets: ${missing.join(', ')}`);
      return missing;
    }
    const missing = await verifyAssets(release.isDraft);
    if (missing.length) {
      gh(['release', 'upload', identity.tag, ...missing.map(name => files.get(name).file), '--repo', product.repository]);
      await verifyAssets(false);
    }
    if (!release.isDraft && !release.isPrerelease) {
      if (channel !== 'latest') throw new Error('Cannot downgrade a stable release to prerelease.');
      return;
    }
    verifyTag();
    const current = view();
    if (current.databaseId !== release.databaseId || current.isDraft !== release.isDraft || current.isPrerelease !== release.isPrerelease) {
      throw new Error('Release state changed during verification.');
    }
    if (channel === 'latest' && releases().some(item => {
      if (item.id === release.databaseId || item.draft || item.prerelease || !/^v\d+\.\d+\.\d+$/.test(item.tag_name)) return false;
      const left = item.tag_name.slice(1).split('.').map(Number), right = identity.version.split('.').map(Number);
      for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index];
      return true;
    })) throw new Error('An equal or newer stable release already exists.');
    gh(['release', 'edit', identity.tag, '--repo', product.repository, '--draft=false',
      channel === 'latest' ? '--prerelease=false' : '--prerelease', channel === 'latest' ? '--latest' : '--latest=false']);
    const published = view();
    if (published.isDraft || published.isPrerelease !== (channel === 'prerelease')) throw new Error('Release visibility does not match the requested channel.');
    console.log(`Published ${channel}: ${product.repositoryUrl}/releases/tag/${identity.tag}`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const identity = { version: process.env.RELEASE_VERSION, sha: process.env.RELEASE_SHA, tag: process.env.RELEASE_TAG,
    runId: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
  const task = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === product.repository
    ? publishDesktop(path.resolve(process.argv[2] ?? 'out/downloaded'), identity, process.env.RELEASE_CHANNEL)
    : Promise.reject(new Error('Publication runs in the build workflow. Use npm run prerelease or npm run latest.'));
  task.catch(error => { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; });
}
