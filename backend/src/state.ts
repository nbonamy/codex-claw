import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { AppSnapshot } from '@codex-claw/shared/contracts';
import { AppStatePersistence } from '@codex-claw/shared/state-persistence';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';

export async function loadBackendSnapshot(stateDir?: string): Promise<AppSnapshot> {
  if (!stateDir) {
    return createEmptySnapshot();
  }

  await mkdir(stateDir, { recursive: true });
  return backendStatePersistence(stateDir).load();
}

export async function saveBackendSnapshot(stateDir: string | undefined, snapshot: AppSnapshot): Promise<void> {
  if (!stateDir) {
    return;
  }

  await backendStatePersistence(stateDir).save(snapshot);
}

export function backendStatePersistence(stateDir: string): AppStatePersistence {
  return new AppStatePersistence(path.join(stateDir, 'state.json'));
}
