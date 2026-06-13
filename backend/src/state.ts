import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppSnapshot } from '@codex-claw/shared/contracts';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';

export async function loadBackendSnapshot(stateDir?: string): Promise<AppSnapshot> {
  if (!stateDir) {
    return createEmptySnapshot();
  }

  await mkdir(stateDir, { recursive: true });

  try {
    const raw = await readFile(path.join(stateDir, 'state.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isAppSnapshotLike(parsed) ? parsed : createEmptySnapshot();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return createEmptySnapshot();
    }
    throw error;
  }
}

function isAppSnapshotLike(value: unknown): value is AppSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<AppSnapshot>;
  return Array.isArray(snapshot.teams)
    && Array.isArray(snapshot.agents)
    && Array.isArray(snapshot.messages)
    && Array.isArray(snapshot.backendRuntimes)
    && typeof snapshot.workBacklog === 'object'
    && typeof snapshot.general === 'object'
    && typeof snapshot.sourceFolder === 'object'
    && typeof snapshot.theme === 'object';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
