import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const ELECTRON_ROOT = path.join(ROOT, 'electron');
const HOST = process.env.CODEX_CLAW_UPDATE_PUBLISH_HOST ?? 'joshua';
const REMOTE_ROOT = process.env.CODEX_CLAW_UPDATE_REMOTE_ROOT ?? '/var/www/codex-claw';
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const desktopVersion = packageJson.version;
const REMOTE_RELEASE_MANIFEST = `${REMOTE_ROOT}/releases/darwin/arm64/RELEASES.json`;

function requireFile(filePath, description) {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) throw new Error(`Missing ${description}: ${filePath ?? '(not found)'}`);
  return filePath;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function findArtifact(root, predicate) {
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const match = findArtifact(filePath, predicate);
      if (match) return match;
    } else if (predicate(filePath)) {
      return filePath;
    }
  }
  return null;
}

export function parsePublishedManifest(rawManifest) {
  const trimmed = String(rawManifest ?? '').trim();
  return trimmed ? JSON.parse(trimmed) : null;
}

export function assertVersionNotAlreadyPublished({ currentVersion, publishedManifest }) {
  if (publishedManifest?.currentRelease === currentVersion) {
    throw new Error(`Codex Claw version ${currentVersion} is already published. Bump the root package version before publishing.`);
  }
}

export function readPublishedManifest({
  execFileSyncImpl = execFileSync,
  host = HOST,
  remoteManifest = REMOTE_RELEASE_MANIFEST,
} = {}) {
  const remoteCommand = `test -f ${shellQuote(remoteManifest)} && cat ${shellQuote(remoteManifest)} || true`;
  return parsePublishedManifest(execFileSyncImpl('ssh', [host, remoteCommand], { encoding: 'utf8' }));
}

export function checkPublishedVersion({
  currentVersion = desktopVersion,
  execFileSyncImpl = execFileSync,
  host = HOST,
  remoteManifest = REMOTE_RELEASE_MANIFEST,
} = {}) {
  const publishedManifest = readPublishedManifest({ execFileSyncImpl, host, remoteManifest });
  assertVersionNotAlreadyPublished({ currentVersion, publishedManifest });
  if (publishedManifest?.currentRelease) {
    console.log(`Latest published Codex Claw version is ${publishedManifest.currentRelease}; local version is ${currentVersion}.`);
  } else {
    console.log(`No published Codex Claw version found at ${host}:${remoteManifest}; local version is ${currentVersion}.`);
  }
}

function publishMacos() {
  checkPublishedVersion();
  const zipPath = requireFile(
    findArtifact(path.join(ELECTRON_ROOT, 'out', 'make', 'zip', 'darwin', 'arm64'),
      (filePath) => filePath.endsWith('.zip') && filePath.includes(`-${desktopVersion}.zip`)),
    `macOS arm64 zip for version ${desktopVersion}`,
  );
  const manifestPath = requireFile(
    path.join(ELECTRON_ROOT, 'out', 'make', 'zip', 'darwin', 'arm64', 'RELEASES.json'),
    'update manifest',
  );
  const dmgPath = requireFile(
    findArtifact(path.join(ELECTRON_ROOT, 'out', 'make'),
      (filePath) => filePath.endsWith('.dmg') && filePath.includes(`-${desktopVersion}-`)),
    `macOS dmg for version ${desktopVersion}`,
  );

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.currentRelease !== desktopVersion) {
    throw new Error(`Update manifest currentRelease ${manifest.currentRelease} does not match root package version ${desktopVersion}`);
  }

  execFileSync('ssh', [HOST, `mkdir -p ${shellQuote(`${REMOTE_ROOT}/downloads`)} ${shellQuote(`${REMOTE_ROOT}/releases/darwin/arm64`)}`], { stdio: 'inherit' });
  execFileSync('scp', [zipPath, manifestPath, `${HOST}:${REMOTE_ROOT}/releases/darwin/arm64/`], { stdio: 'inherit' });
  execFileSync('scp', [dmgPath, `${HOST}:${REMOTE_ROOT}/downloads/codex-claw-macos-arm64.dmg`], { stdio: 'inherit' });
  console.log(`Published ${path.basename(dmgPath)}, ${path.basename(zipPath)}, and RELEASES.json to ${HOST}:${REMOTE_ROOT}`);
}

function isMainModule() {
  return process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
}

if (isMainModule()) {
  if (process.argv.includes('--check-only')) checkPublishedVersion();
  else publishMacos();
}
