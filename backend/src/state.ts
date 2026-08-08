import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { AppSnapshot } from '@codex-claw/core/contracts';
import { CODEX_CLAW_CODEX_HOME_ENV, CODEX_CLAW_HOME_ENV } from '@codex-claw/core/clawd-launch';
import { AppStatePersistence } from './state-persistence';

export { CODEX_CLAW_HOME_ENV };
let persistence: AppStatePersistence | null = null;
let persistencePath: string | null = null;

export function backendHomeDir(): string {
  const configured = process.env[CODEX_CLAW_HOME_ENV]?.trim();
  return configured || path.join(homedir(), '.codex-claw');
}

export function backendStateFilePath(): string {
  return path.join(backendHomeDir(), 'state.json');
}

export function backendProviderTokensFilePath(): string {
  return path.join(backendHomeDir(), 'provider-tokens.json');
}

/** Isolated provider home; managed hosts may supply a trusted per-user path. */
export function backendCodexHomeDir(): string {
  const configured = process.env[CODEX_CLAW_CODEX_HOME_ENV]?.trim();
  if (configured) return configured;
  return path.join(backendHomeDir(), 'codex-home');
}

export async function ensureBackendCodexHome(): Promise<string> {
  const home = backendCodexHomeDir();
  await mkdir(home, { recursive: true, mode: 0o700 });
  return home;
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
  const filePath = backendStateFilePath();
  if (!persistence || persistencePath !== filePath) {
    persistence = new AppStatePersistence(filePath);
    persistencePath = filePath;
  }
  return persistence;
}
