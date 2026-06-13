import type { AppSnapshot, ClientState } from './contracts';

export function isAppSnapshot(value: unknown): value is AppSnapshot {
  return isRecord(value) &&
    Array.isArray(value.teams) &&
    Array.isArray(value.agents) &&
    Array.isArray(value.bench) &&
    Array.isArray(value.loops) &&
    Array.isArray(value.messages) &&
    Array.isArray(value.backendRuntimes) &&
    isRecord(value.workBacklog) &&
    isRecord(value.sourceFolder) &&
    isRecord(value.general) &&
    isRecord(value.theme);
}

export function isClientState(value: unknown): value is ClientState {
  return isRecord(value) &&
    typeof value.sourceFolderPath === 'string' &&
    typeof value.shouldPreventDisplaySleep === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
