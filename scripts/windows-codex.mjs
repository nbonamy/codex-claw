import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hasExpectedExecutableArchitecture, selectCodexReleaseTarget } from './runtime-artifacts.mjs';

// Keep the official package layout: Codex locates its Windows sandbox, command
// runner, ripgrep, and voice resources relative to bin/codex.exe.
export async function prepareWindowsCodex({ config, arch, outputDir }, dependencies = {}) {
  const target = selectCodexReleaseTarget(config, 'win32', arch);
  const triple = `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`;
  const run = dependencies.execFileSync ?? execFileSync;
  const fetchRelease = dependencies.fetch ?? fetch;
  const executable = path.join(outputDir, 'bin', 'codex.exe');
  if (isExpectedPackage(outputDir)) return executable;

  const baseUrl = `https://releases.openai.com/codex/releases/${config.version}`;
  const metadataResponse = await fetchRelease(`${baseUrl}/release.json`, { signal: AbortSignal.timeout(30_000) });
  if (!metadataResponse.ok) throw new Error(`Codex release metadata download failed: HTTP ${metadataResponse.status}.`);
  const metadata = await metadataResponse.json();
  const archiveName = `codex-package-${triple}.tar.gz`;
  const asset = metadata.assets?.find(candidate => candidate.name === archiveName);
  if (metadata.tag_name !== `rust-v${config.version}` || !/^sha256:[a-f0-9]{64}$/.test(asset?.digest ?? '')) {
    throw new Error(`Codex ${config.version} has no verified Windows ${arch} package.`);
  }
  const response = await fetchRelease(`${baseUrl}/${archiveName}`, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Codex package download failed: HTTP ${response.status}.`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (`sha256:${createHash('sha256').update(archive).digest('hex')}` !== asset.digest) {
    throw new Error(`Codex package checksum mismatch: ${archiveName}.`);
  }

  fs.mkdirSync(path.dirname(outputDir), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(outputDir), '.codex-'));
  const packageDir = path.join(staging, 'package');
  const previousDir = path.join(staging, 'previous');
  try {
    const archivePath = path.join(staging, archiveName);
    fs.writeFileSync(archivePath, archive);
    fs.mkdirSync(packageDir);
    // tar.exe ships with supported Windows versions; no Unix shell or npm shim.
    run('tar', ['-xzf', archivePath, '-C', packageDir], { stdio: 'pipe' });
    if (!isExpectedPackage(packageDir)) throw new Error(`Codex ${config.version} Windows package failed validation.`);
    if (fs.existsSync(outputDir)) fs.renameSync(outputDir, previousDir);
    try {
      fs.renameSync(packageDir, outputDir);
    } catch (error) {
      if (fs.existsSync(previousDir)) fs.renameSync(previousDir, outputDir);
      throw error;
    }
  } finally {
    try {
      // Windows can retain temporary locks after executing or scanning files.
      fs.rmSync(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      // Cleanup must neither fail an installed package nor mask the original
      // extraction/validation error. Leave the directory available for cleanup.
      console.warn(`[prepare-codex-app-server] Temporary files remain at ${staging}: ${error.code ?? error.message}`);
    }
  }
  return executable;

  function isExpectedPackage(directory) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'codex-package.json'), 'utf8'));
      if (manifest.version !== config.version || manifest.target !== triple
        || manifest.entrypoint !== 'bin/codex.exe' || manifest.layoutVersion !== 1) return false;
      for (const entry of ['bin/codex.exe', 'bin/codex-code-mode-host.exe', 'codex-path/rg.exe',
        'codex-resources/codex-command-runner.exe', 'codex-resources/codex-windows-sandbox-setup.exe']) {
        if (!hasExpectedExecutableArchitecture(path.join(directory, entry), target)) return false;
      }
      return run(path.join(directory, 'bin/codex.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }).trim()
        === `codex-cli ${config.version}`;
    } catch {
      return false;
    }
  }
}
