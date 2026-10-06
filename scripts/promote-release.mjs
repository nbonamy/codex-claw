import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import product from '../core/src/product.json' with { type: 'json' };
import { checksum, verifyBundle } from './release-contract.mjs';

// Only this explicit operator path can write releases. CI remains artifact-only.
async function publication(directory, identity, options, action) {
  if (identity.tag !== `v${identity.version}`) throw new Error('Publication requires a canonical v<version> tag.');
  const manifests = await verifyBundle(directory, identity);
  const run = options.run ?? execFileSync;
  const gh = args => run('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900_000 });
  const api = args => JSON.parse(gh(['api', ...args]));
  const base = `repos/${product.repository}`;
  const releases = () => api([`${base}/releases?per_page=100`, '--paginate', '--slurp']).flat();
  const resolveRelease = () => releases().find(release => release.tag_name === identity.tag);
  function verifyTag() {
    api([`${base}/git/ref/tags/${identity.tag}`]);
    if (api([`${base}/commits/${identity.tag}`]).sha !== identity.sha) throw new Error('Remote release tag no longer matches the build SHA.');
  }
  verifyTag();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'app-release-publication-'));
  try {
    const upload = path.join(temporary, 'upload');
    await fs.mkdir(upload);
    const files = new Map();
    async function add(source, name, expectedChecksum) {
      if (files.has(name)) throw new Error(`Duplicate GitHub asset: ${name}`);
      const file = path.join(upload, name);
      await fs.copyFile(source, file);
      const sha256 = await checksum(file);
      if (expectedChecksum && sha256 !== expectedChecksum) throw new Error(`Artifact changed during staging: ${name}`);
      files.set(name, { file, sha256 });
    }
    await add(path.join(directory, 'release.json'), 'release.json');
    for (const manifest of manifests) {
      const target = path.join(directory, manifest.target);
      await add(path.join(target, 'provenance.json'), `${manifest.target}-provenance.json`);
      for (const file of manifest.files) await add(path.join(target, file.name), file.name, file.sha256);
    }
    let release = resolveRelease();
    async function verifyAssets(allowMissing) {
      const downloaded = await fs.mkdtemp(path.join(temporary, 'download-'));
      // An empty draft has no downloadable assets; enumerate through the release API first.
      const assets = api([`${base}/releases/${release.id}/assets?per_page=100`, '--paginate', '--slurp']).flat();
      const names = assets.map(asset => asset.name);
      if (names.length !== new Set(names).size || names.some(name => !files.has(name))) throw new Error('Unexpected or duplicate GitHub release assets.');
      if (names.length) gh(['release', 'download', identity.tag, '--repo', product.repository, '--dir', downloaded]);
      for (const name of names) {
        if (await checksum(path.join(downloaded, name)) !== files.get(name).sha256) throw new Error(`GitHub asset checksum mismatch: ${name}`);
      }
      const missing = [...files.keys()].filter(name => !names.includes(name));
      if (!allowMissing && missing.length) throw new Error(`Missing GitHub release assets: ${missing.join(', ')}`);
      return missing;
    }
    if (action === 'stage') {
      if (release && !release.draft) {
        await verifyAssets(false);
        console.log(`Verified existing release (unchanged): ${product.repositoryUrl}/releases/tag/${identity.tag}`);
        return;
      }
      if (!release) {
        gh(['release', 'create', identity.tag, '--repo', product.repository, '--verify-tag', '--target', identity.sha,
          '--draft', '--prerelease', '--latest=false', '--title', `${product.name} ${identity.version}`,
          '--notes', `Build: ${identity.sha}\nActions: ${product.repositoryUrl}/actions/runs/${identity.runId}/attempts/${identity.attempt}\n\nWindows installers are unsigned. Linux updates use package downloads. Automatic updates follow stable releases only.`]);
        release = resolveRelease();
        if (!release?.draft) throw new Error('Unable to confirm the newly created draft release.');
      }
      const missing = await verifyAssets(true);
      if (missing.length) gh(['release', 'upload', identity.tag, ...missing.map(name => files.get(name).file), '--repo', product.repository]);
      await verifyAssets(false);
      console.log(`Verified draft: ${product.repositoryUrl}/releases/tag/${identity.tag}`);
      return;
    }
    if (!release || (!release.draft && !release.prerelease)) throw new Error('Stage a draft first; an already published stable release cannot be changed.');
    await verifyAssets(false);
    verifyTag();
    const current = resolveRelease();
    if (!current || current.id !== release.id || current.draft !== release.draft || current.prerelease !== release.prerelease) {
      throw new Error('Release state changed during verification; inspect before retrying.');
    }
    if (options.stable) {
      const compare = tag => {
        const parts = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)?.slice(1).map(Number);
        if (!parts) return false;
        const version = identity.version.split('.').map(Number);
        for (let i = 0; i < 3; i++) if (parts[i] !== version[i]) return parts[i] > version[i];
        return true;
      };
      if (releases().some(item => item.id !== release.id && !item.draft && !item.prerelease && compare(item.tag_name))) {
        throw new Error('An equal or newer stable release already exists.');
      }
    }
    gh(['release', 'edit', identity.tag, '--repo', product.repository, '--draft=false',
      options.stable ? '--prerelease=false' : '--prerelease', options.stable ? '--latest' : '--latest=false']);
    console.log(`Published ${options.stable ? 'stable release' : 'prerelease (manual downloads only)'}: ${product.repositoryUrl}/releases/tag/${identity.tag}`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

export function stageRelease(directory, identity, options = {}) {
  return publication(directory, identity, options, 'stage');
}

export function promote(directory, identity, options = {}) {
  return publication(directory, identity, options, 'publish');
}
