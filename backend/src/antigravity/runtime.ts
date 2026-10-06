import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveRuntimeExecutable, withDiscoveredRuntimePath } from '@workspace/core/runtime-discovery';
import { backendHomeDir } from '../state';

export const acpVersion = '1.3.0';
// Google's ACP registry, pinned in plans/antigravity.md. Checksums were verified in Phase 0 / T3's release audit.
const releases: Record<string, { platform: string; arch: string; sha256: string }> = {
  'darwin-arm64': { platform: 'macos', arch: 'arm64', sha256: '7cd97045f7b4fe81175a107cdf16f9c51484e3c78a5162cae415338bb6aa5b88' },
  'darwin-x64': { platform: 'macos', arch: 'x86_64', sha256: 'bb23956b89984bf5d354af2c3725e6c57f0cc1b7228e77a0e91c9c2bc1d47646' },
  'linux-x64': { platform: 'linux', arch: 'x86_64', sha256: '9fb60956af0a9d76220a4db91ca9ac88e2a2372ad68f985ab5fceace6b825b96' },
  'linux-arm64': { platform: 'linux', arch: 'arm64', sha256: '500b0bc0fb858e88f4df404d4cedf80bf9298c178291e39e383d6c50b111cbdf' },
};

function runtimeDirectory(): string { return path.join(backendHomeDir(), 'antigravity', acpVersion); }
export function antigravityHome(): string { return process.env.GEMINI_HOME || path.join(backendHomeDir(), 'antigravity-home'); }

export function resolveAcpRuntime(): { command: string; harness: string; args: string[] } | null {
  const command = resolveRuntimeExecutable(process.env.APP_ANTIGRAVITY_COMMAND || path.join(runtimeDirectory(), 'agy_acp_server.par'));
  if (!command) return null;
  const harness = resolveRuntimeExecutable(process.env.ANTIGRAVITY_HARNESS_PATH || path.join(path.dirname(command), 'localharness_external'));
  return harness ? { command, harness, args: process.platform === 'linux' ? ['--uid='] : [] } : null;
}

export function acpEnvironment(home: string, harness: string, temp: string): NodeJS.ProcessEnv {
  const env = { ...withDiscoveredRuntimePath(undefined) };
  for (const key of Object.keys(env)) {
    if (/^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_|GOOGLE_GENAI_|AGY_ACP_)/.test(key)) delete env[key];
  }
  return { ...env, GEMINI_HOME: home, ANTIGRAVITY_HARNESS_PATH: harness,
    AGY_ACP_FORCE_FILE_STORAGE: '1', PYTHONUNBUFFERED: '1', TMPDIR: temp };
}

export async function installAcpRuntime(): Promise<void> {
  const release = releases[`${process.platform}-${process.arch}`];
  if (!release) throw new Error('Automatic Antigravity ACP installation is unavailable on this platform. Configure the official ACP runtime and matching harness.');
  const parent = path.dirname(runtimeDirectory());
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(path.join(parent, '.install-'));
  try {
    const url = `https://dl.google.com/agy-extensions/releases/${release.platform}/agy-acp-server-${acpVersion}-${process.platform}-${release.arch}.zip`;
    const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok || !response.body) throw new Error('Antigravity ACP download failed.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 400 * 1024 * 1024) throw new Error('Antigravity ACP archive exceeds the download limit.');
      chunks.push(chunk);
    }
    const archive = Buffer.concat(chunks);
    if (createHash('sha256').update(archive).digest('hex') !== release.sha256) throw new Error('Antigravity ACP checksum mismatch.');
    const zip = path.join(staging, 'runtime.zip');
    await writeFile(zip, archive, { mode: 0o600 });
    // Extract only the two pinned executables, with no shell or archive-owned paths.
    await promisify(execFile)('unzip', ['-j', zip, 'agy_acp_server.par', 'localharness_external', '-d', staging], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    for (const name of ['agy_acp_server.par', 'localharness_external']) await chmod(path.join(staging, name), 0o700);
    await rm(zip);
    await rename(staging, runtimeDirectory());
  } finally { await rm(staging, { recursive: true, force: true }); }
}
