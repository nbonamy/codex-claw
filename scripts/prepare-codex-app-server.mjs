import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../codex-app-server-release.json' with { type: 'json' };
import { hasExpectedExecutableArchitecture, selectCodexReleaseTarget } from './runtime-artifacts.mjs';

const root = path.resolve(import.meta.dirname, '..');
const target = selectCodexReleaseTarget(config, process.platform, process.arch);
if (!/^codex-package-[a-z0-9-]+\.tar\.gz$/.test(target.archive) || !/^[a-f0-9]{64}$/.test(target.sha256)) {
  throw new Error('The Codex archive and SHA-256 must be pinned for this target.');
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-codex-'));
const output = path.join(root, 'electron/resources/codex');
try {
  const archive = path.join(temp, target.archive);
  execFileSync('curl', ['--fail', '--location', '--retry', '3', '--silent', '--show-error',
    '--output', archive, `https://github.com/openai/codex/releases/download/rust-v${config.version}/${target.archive}`], { stdio: 'inherit' });
  const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  if (digest !== target.sha256) throw new Error(`Codex archive checksum mismatch: ${target.archive}`);
  const extracted = path.join(temp, 'release');
  fs.mkdirSync(extracted);
  execFileSync('tar', ['-xzf', archive, '-C', extracted]);
  const suffix = process.platform === 'win32' ? '.exe' : '';
  for (const name of ['codex', 'codex-code-mode-host']) {
    const executable = path.join(extracted, 'bin', name + suffix);
    if (!hasExpectedExecutableArchitecture(executable, target, {
      verifyDarwinSignature: file => execFileSync('codesign', ['--verify', '--strict', file]),
    })) throw new Error(`Wrong architecture: ${name}`);
  }
  const version = execFileSync(path.join(extracted, 'bin', 'codex' + suffix), ['--version'], { encoding: 'utf8' }).trim();
  if (version !== `codex-cli ${config.version}`) throw new Error(`Unexpected Codex version: ${version}`);
  fs.mkdirSync(output, { recursive: true });
  for (const entry of fs.readdirSync(output)) {
    if (entry !== '.gitignore') fs.rmSync(path.join(output, entry), { recursive: true, force: true });
  }
  if (process.platform === 'win32') {
    // The sandbox runners, rg, voice host and DLLs resolve relative to bin/codex.exe.
    fs.cpSync(extracted, output, { recursive: true });
  } else {
    fs.mkdirSync(output, { recursive: true });
    for (const name of ['codex', 'codex-code-mode-host']) {
      fs.copyFileSync(path.join(extracted, 'bin', name), path.join(output, name));
      fs.chmodSync(path.join(output, name), 0o755);
    }
  }
  fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify({ version: config.version, ...target }, null, 2) + '\n');
  console.log(`[prepare-codex-app-server] prepared Codex ${config.version} for ${target.platform}/${target.arch}`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
