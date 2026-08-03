import type { AppSnapshot, AppSnapshotMetadata, ClientState } from './contracts';

export function isAppSnapshot(value: unknown): value is AppSnapshot {
  return isAppSnapshotMetadata(value) &&
    'messages' in value &&
    Array.isArray(value.messages);
}

export function isAppSnapshotMetadata(value: unknown): value is AppSnapshotMetadata {
  return isRecord(value) &&
    Array.isArray(value.teams) &&
    Array.isArray(value.agents) &&
    Array.isArray(value.bench) &&
    Array.isArray(value.loops) &&
    isRecord(value.backendApprovals) &&
    Array.isArray(value.backendRuntimes) &&
    isRecord(value.workBacklog) &&
    isRecord(value.remoteConnections) &&
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
