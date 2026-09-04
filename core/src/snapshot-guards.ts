import type { AppSnapshot, AppSnapshotMetadata, ClientState } from './contracts';
import { isRendererMessage } from './snapshot-guard-collections';
import { isSnapshotMetadata } from './snapshot-guard-metadata';
import { hasOwn, isArrayOf, isBoolean, isRecord, optional } from './snapshot-guard-primitives';

export type DecodedAppSnapshot =
  | { kind: 'full'; value: AppSnapshot }
  | { kind: 'metadata'; value: AppSnapshotMetadata };

export function decodeAppSnapshot(value: unknown): DecodedAppSnapshot | null {
  if (!isSnapshotMetadata(value)) return null;
  if (hasOwn(value, 'messages')) {
    if (!isArrayOf(value.messages, isRendererMessage)) return null;
    return { kind: 'full', value: value as AppSnapshot };
  }
  return { kind: 'metadata', value: value as AppSnapshotMetadata };
}

export function isAppSnapshot(value: unknown): value is AppSnapshot {
  return decodeAppSnapshot(value)?.kind === 'full';
}

export function isAppSnapshotMetadata(value: unknown): value is AppSnapshotMetadata {
  return decodeAppSnapshot(value) !== null;
}

export function isClientState(value: unknown): value is ClientState {
  return isRecord(value) &&
    typeof value.sourceFolderPath === 'string' &&
    typeof value.shouldPreventDisplaySleep === 'boolean' &&
    optional(value, 'shouldPreventDisplaySleepForRemoteAccess', isBoolean);
}
