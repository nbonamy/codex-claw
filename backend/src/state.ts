import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { AppSnapshot } from '@codex-claw/shared/contracts';
import { AppStatePersistence } from './state-persistence';

export const CODEX_CLAW_HOME_ENV = 'CODEX_CLAW_HOME';

export function backendHomeDir(): string {
  const configured = process.env[CODEX_CLAW_HOME_ENV]?.trim();
  return configured || path.join(homedir(), '.codex-claw');
}

export function backendStateFilePath(): string {
  return path.join(backendHomeDir(), 'state.json');
}

export function backendWorkIntegrationTokensFilePath(): string {
  return path.join(backendHomeDir(), 'work-integration-tokens.json');
}

export function backendSocketPath(): string {
  return path.join(backendHomeDir(), 'clawd.sock');
}

export async function loadBackendSnapshot(): Promise<AppSnapshot> {
  await mkdir(backendHomeDir(), { recursive: true, mode: 0o700 });
  return backendStatePersistence().load();
}

export async function saveBackendSnapshot(snapshot: AppSnapshot): Promise<void> {
  await mkdir(backendHomeDir(), { recursive: true, mode: 0o700 });
  await backendStatePersistence().save(snapshot);
}

export function backendStatePersistence(): AppStatePersistence {
  return new AppStatePersistence(backendStateFilePath());
}
