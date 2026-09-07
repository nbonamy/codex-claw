import type { AppSnapshot, ClientState } from './contracts';
import { isSnapshotMetadata } from './snapshot-guard-metadata';
import { isBoolean, isRecord, optional } from './snapshot-guard-primitives';

export type DecodedAppSnapshot = { value: AppSnapshot };

export function decodeAppSnapshot(value: unknown): DecodedAppSnapshot | null {
  if (!isSnapshotMetadata(value)) return null;
  return { value: value as AppSnapshot };
}

export function isAppSnapshot(value: unknown): value is AppSnapshot {
  return decodeAppSnapshot(value) !== null;
}

export function isClientState(value: unknown): value is ClientState {
  return isRecord(value) &&
    typeof value.sourceFolderPath === 'string' &&
    typeof value.shouldPreventDisplaySleep === 'boolean' &&
    optional(value, 'shouldPreventDisplaySleepForRemoteAccess', isBoolean);
}
