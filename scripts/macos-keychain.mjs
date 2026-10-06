import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// This state contains paths only. The always() step can clean up after a failed
// build or a cancelled job without persisting the certificate/password.
if (!process.env.RUNNER_TEMP || process.platform !== 'darwin') throw new Error('This wrapper requires a macOS Actions runner.');
const stateFile = path.join(process.env.RUNNER_TEMP, 'app-signing-cleanup.json');
function security(args) {
  try { return execFileSync('security', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error(`macOS keychain operation failed: ${args[0]}`); }
}
function cleanup() {
  if (!fs.existsSync(stateFile)) return;
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  try { security(['list-keychains', '-d', 'user', '-s', ...state.previous]); }
  finally {
    try { if (fs.existsSync(state.keychain)) security(['delete-keychain', state.keychain]); }
    finally { fs.rmSync(state.directory, { recursive: true, force: true }); fs.rmSync(stateFile, { force: true }); }
  }
}
if (process.argv[2] === 'cleanup') cleanup();
else {
  for (const name of ['BUILD_CERTIFICATE_BASE64', 'BUILD_CERTIFICATE_PASSWORD', 'IDENTITY_DARWIN_CODE', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
    if (!process.env[name]) throw new Error(`Missing signing configuration: ${name}`);
  }
  const directory = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'app-signing-'));
  fs.chmodSync(directory, 0o700);
  const keychain = path.join(directory, 'build.keychain-db');
  const certificate = path.join(directory, 'certificate.p12');
  const password = randomBytes(32).toString('hex');
  const previous = [...security(['list-keychains', '-d', 'user']).matchAll(/"([^"]+)"/g)].map(match => match[1]);
  fs.writeFileSync(stateFile, JSON.stringify({ directory, keychain, previous }), { mode: 0o600 });
  try {
    fs.writeFileSync(certificate, Buffer.from(process.env.BUILD_CERTIFICATE_BASE64, 'base64'), { mode: 0o600 });
    security(['create-keychain', '-p', password, keychain]);
    security(['set-keychain-settings', '-lut', '21600', keychain]);
    security(['unlock-keychain', '-p', password, keychain]);
    security(['import', certificate, '-P', process.env.BUILD_CERTIFICATE_PASSWORD, '-A', '-t', 'cert', '-f', 'pkcs12', '-k', keychain]);
    fs.rmSync(certificate, { force: true });
    security(['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain]);
    security(['list-keychains', '-d', 'user', '-s', keychain, ...previous]);
    if (!process.env.npm_execpath) throw new Error('Invoke through npm run release:ci-build.');
    execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'make:electron'], { stdio: 'inherit' });
  } finally { cleanup(); }
}
