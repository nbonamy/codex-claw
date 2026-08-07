import { cp, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { CodexResourceSharingStatus, SetCodexResourceSharingInput } from '@codex-claw/core/contracts';
import { backendCodexHomeDir } from './state';

const resourceDirectoryNames = ['skills', 'plugins'] as const;

export type CodexResourceSharingPaths = {
  clawCodexHome: string;
  userCodexHome: string;
};

export function defaultCodexResourceSharingPaths(): CodexResourceSharingPaths {
  return {
    clawCodexHome: backendCodexHomeDir(),
    userCodexHome: path.join(homedir(), '.codex'),
  };
}

export async function reconcileCodexResourceSharing(
  enabled: boolean,
  paths = defaultCodexResourceSharingPaths(),
): Promise<void> {
  if (enabled) {
    await shareCodexResources(paths);
    return;
  }

  await ensureIsolatedCodexResources(paths);
}

export async function initializeCodexResourceSharing(
  enabled: boolean,
  paths = defaultCodexResourceSharingPaths(),
): Promise<void> {
  if (!enabled) {
    await ensureIsolatedCodexResources(paths);
    return;
  }

  if (await hasConflictingCodexResources(paths)) return;
  await shareCodexResources(paths);
}

export async function getCodexResourceSharingStatus(
  enabled: boolean,
  paths = defaultCodexResourceSharingPaths(),
): Promise<CodexResourceSharingStatus> {
  return {
    enabled,
    migrationRequired: enabled && await hasConflictingCodexResources(paths),
  };
}

export async function setCodexResourceSharing(
  input: SetCodexResourceSharingInput,
  paths = defaultCodexResourceSharingPaths(),
): Promise<void> {
  if (input.enabled) {
    await shareCodexResources(paths);
    return;
  }

  if (input.mode === 'keep') return;

  await isolateCodexResources(input.mode, paths);
}

async function shareCodexResources(paths: CodexResourceSharingPaths): Promise<void> {
  await mkdir(paths.clawCodexHome, { recursive: true, mode: 0o700 });
  await mkdir(paths.userCodexHome, { recursive: true, mode: 0o700 });

  for (const name of resourceDirectoryNames) {
    const sharedPath = path.join(paths.userCodexHome, name);
    const clawPath = path.join(paths.clawCodexHome, name);
    await mkdir(sharedPath, { recursive: true, mode: 0o700 });
    if (await isLinkTo(clawPath, sharedPath)) continue;
    await rm(clawPath, { recursive: true, force: true });
    await symlink(path.relative(paths.clawCodexHome, sharedPath), clawPath, 'dir');
  }
}

async function ensureIsolatedCodexResources(paths: CodexResourceSharingPaths): Promise<void> {
  await mkdir(paths.clawCodexHome, { recursive: true, mode: 0o700 });
  for (const name of resourceDirectoryNames) {
    const clawPath = path.join(paths.clawCodexHome, name);
    if (await isSymbolicLink(clawPath)) {
      await rm(clawPath, { force: true });
    }
    await mkdir(clawPath, { recursive: true, mode: 0o700 });
  }
}

async function isolateCodexResources(
  mode: Extract<SetCodexResourceSharingInput, { enabled: false }>['mode'],
  paths: CodexResourceSharingPaths,
): Promise<void> {
  await mkdir(paths.clawCodexHome, { recursive: true, mode: 0o700 });
  await mkdir(paths.userCodexHome, { recursive: true, mode: 0o700 });

  for (const name of resourceDirectoryNames) {
    const sharedPath = path.join(paths.userCodexHome, name);
    const clawPath = path.join(paths.clawCodexHome, name);
    await mkdir(sharedPath, { recursive: true, mode: 0o700 });
    await rm(clawPath, { recursive: true, force: true });
    if (mode === 'copy') {
      await cp(sharedPath, clawPath, { recursive: true, preserveTimestamps: true });
    } else {
      await mkdir(clawPath, { recursive: true, mode: 0o700 });
    }
  }
}

async function isLinkTo(linkPath: string, targetPath: string): Promise<boolean> {
  try {
    const stats = await lstat(linkPath);
    if (!stats.isSymbolicLink()) return false;
    const target = await readlink(linkPath);
    return path.resolve(path.dirname(linkPath), target) === path.resolve(targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function hasConflictingCodexResources(paths: CodexResourceSharingPaths): Promise<boolean> {
  for (const name of resourceDirectoryNames) {
    const clawPath = path.join(paths.clawCodexHome, name);
    const sharedPath = path.join(paths.userCodexHome, name);
    try {
      await lstat(clawPath);
      if (!await isLinkTo(clawPath, sharedPath)) return true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
    }
  }
  return false;
}

async function isSymbolicLink(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isSymbolicLink();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
