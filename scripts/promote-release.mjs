import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import product from '../core/src/product.json' with { type: 'json' };
import { checksum, verifyBundle } from './release-contract.mjs';

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
function newer(version, previous) {
  if (!/^\d+\.\d+\.\d+$/.test(previous)) throw new Error('Invalid currently published version.');
  const left = version.split('.').map(Number), right = previous.split('.').map(Number);
  const differing = left.findIndex((value, index) => value !== right[index]);
  return differing >= 0 && left[differing] > right[differing];
}

export async function promote(directory, identity, { env = process.env, run = execFileSync } = {}) {
  const manifests = await verifyBundle(directory, identity);
  const host = env.APP_PUBLISH_HOST, user = env.APP_PUBLISH_USER;
  const key = env.APP_PUBLISH_SSH_KEY, knownHosts = env.APP_PUBLISH_KNOWN_HOSTS;
  const remote = env.APP_PUBLISH_ROOT ?? product.deploymentRoot;
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host ?? '') || !/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(user ?? '')
    || !key || !knownHosts || !/^\/[A-Za-z0-9/_-]+$/.test(remote) || remote === '/') {
    throw new Error('Explicit APP_PUBLISH_HOST, APP_PUBLISH_USER, APP_PUBLISH_SSH_KEY and APP_PUBLISH_KNOWN_HOSTS are required; SSH values are file paths.');
  }
  await fs.access(key); await fs.access(knownHosts);
  const options = ['-i', path.resolve(key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${path.resolve(knownHosts)}`, '-o', 'ConnectTimeout=15'];
  const destination = `${user}@${host}`;
  const ssh = (script, capture = false) => run('ssh', [...options, destination, 'sh -s'], {
    input: `set -eu\n${script}\n`, encoding: 'utf8', stdio: ['pipe', capture ? 'pipe' : 'inherit', 'pipe'], timeout: 120_000,
  });
  const feed = `${remote}/releases/darwin/arm64/RELEASES.json`;
  const previousRaw = ssh(`if test -f ${quote(feed)}; then cat ${quote(feed)}; fi`, true);
  const previous = previousRaw.trim() ? JSON.parse(previousRaw) : null;
  if (previous?.currentRelease && !newer(identity.version, previous.currentRelease)) throw new Error('Promotion must advance the published version; refusing overwrite/downgrade.');

  const mac = manifests.find(manifest => manifest.target === 'darwin-arm64');
  const zip = mac.files.filter(file => file.name.endsWith('.zip'));
  const dmg = mac.files.filter(file => file.name.endsWith('.dmg'));
  if (zip.length !== 1 || dmg.length !== 1) throw new Error('Expected one macOS ZIP and DMG.');
  const builtFeed = JSON.parse(await fs.readFile(path.join(directory, 'darwin-arm64/RELEASES.json'), 'utf8'));
  const release = builtFeed.releases?.find(item => item.version === identity.version);
  const updateUrl = `${product.updateBaseUrl}/darwin/arm64/${zip[0].name}`;
  if (builtFeed.currentRelease !== identity.version || release?.updateTo?.version !== identity.version
    || release?.updateTo?.url !== updateUrl) throw new Error('Built macOS feed does not reference the verified ZIP on the product update domain.');
  const nextFeed = { currentRelease: identity.version,
    releases: [...(previous?.releases ?? []).filter(item => item.version !== identity.version), release] };
  const nonce = randomBytes(12).toString('hex');
  const staging = `${remote}/.staging/${identity.runId}-${identity.attempt}-${nonce}`;
  const archive = `${remote}/releases/builds/${identity.version}/${identity.sha}/${identity.runId}-${identity.attempt}`;
  const local = await fs.mkdtemp(path.join(os.tmpdir(), 'app-promotion-'));
  let created = false;
  try {
    // Hash the exact prior feed for a compare-and-swap under the remote lock.
    const previousFile = path.join(local, 'previous.json');
    await fs.writeFile(previousFile, previousRaw);
    const priorHash = await checksum(previousFile);
    await fs.writeFile(path.join(local, 'RELEASES.json'), JSON.stringify(nextFeed, null, 2) + '\n');
    const uploads = [{ source: path.join(directory, 'release.json'), name: 'release.json' },
      { source: path.join(local, 'RELEASES.json'), name: 'RELEASES.json' }];
    for (const manifest of manifests) {
      for (const name of ['provenance.json', ...manifest.files.map(file => file.name)]) {
        uploads.push({ source: path.join(directory, manifest.target, name), name: `${manifest.target}/${name}` });
      }
    }
    ssh(`mkdir -p ${quote(staging)} ${manifests.map(m => quote(`${staging}/${m.target}`)).join(' ')}`);
    created = true;
    const hashes = [];
    for (const upload of uploads) {
      run('scp', [...options, upload.source, `${destination}:${staging}/${upload.name}`], { stdio: ['ignore', 'inherit', 'pipe'], timeout: 600_000 });
      hashes.push(`${await checksum(upload.source)}  ${upload.name}`);
    }
    const lock = `${remote}/.promotion-lock`;
    const zipDestination = `${remote}/releases/darwin/arm64/${zip[0].name}`;
    const dmgDestination = `${remote}/downloads/${product.downloadFileName}`;
    ssh(`cd ${quote(staging)}
sha256sum -c - <<'ARTIFACT_HASHES'
${hashes.join('\n')}
ARTIFACT_HASHES
mkdir ${quote(lock)} || { echo 'Another promotion holds the lock.' >&2; exit 1; }
trap 'rmdir ${quote(lock)}' EXIT HUP INT TERM
if test -f ${quote(feed)}; then current_hash=$(sha256sum ${quote(feed)} | cut -d ' ' -f 1); else current_hash=$(printf '' | sha256sum | cut -d ' ' -f 1); fi
test "$current_hash" = ${quote(priorHash)} || { echo 'Production feed changed; start promotion again.' >&2; exit 1; }
test ! -e ${quote(archive)}
test ! -e ${quote(zipDestination)} || { echo 'Versioned ZIP already exists; inspect the interrupted promotion.' >&2; exit 1; }
mkdir -p ${quote(path.posix.dirname(archive))} ${quote(path.posix.dirname(zipDestination))} ${quote(path.posix.dirname(dmgDestination))}
mv ${quote(staging)} ${quote(archive)}
cp ${quote(`${archive}/darwin-arm64/${zip[0].name}`)} ${quote(zipDestination + '.tmp-' + nonce)}
mv ${quote(zipDestination + '.tmp-' + nonce)} ${quote(zipDestination)}
cp ${quote(`${archive}/darwin-arm64/${dmg[0].name}`)} ${quote(dmgDestination + '.tmp-' + nonce)}
mv ${quote(dmgDestination + '.tmp-' + nonce)} ${quote(dmgDestination)}
cp ${quote(`${archive}/RELEASES.json`)} ${quote(feed + '.tmp-' + nonce)}
mv ${quote(feed + '.tmp-' + nonce)} ${quote(feed)}`);
    console.log(`Promoted ${identity.version} (${identity.sha}); archived all targets at ${archive}.`);
  } finally {
    if (created) {
      try { ssh(`rm -rf ${quote(staging)}`); }
      catch { console.error(`Staging cleanup failed: ${staging}`); }
    }
    await fs.rm(local, { recursive: true, force: true });
  }
}
