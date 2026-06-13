import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '../snapshot';
import { isAppSnapshot, isClawSnapshotGetResult, isDesktopState } from '../backend-protocol/rpc';

describe('backend protocol guards', () => {
  it('recognizes complete snapshot/get results from clawd', () => {
    expect(isClawSnapshotGetResult({
      snapshot: createInitialSnapshot(),
      lastEventSeq: 17,
      desktopState: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: true,
      },
    })).toBe(true);
  });

  it('rejects partial objects that only resemble snapshots', () => {
    expect(isAppSnapshot({
      teams: [],
      agents: [],
    })).toBe(false);
    expect(isClawSnapshotGetResult({
      snapshot: {
        teams: [],
        agents: [],
      },
      lastEventSeq: 17,
      desktopState: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: false,
      },
    })).toBe(false);
  });

  it('requires backend-derived desktop state in snapshot/get results', () => {
    expect(isDesktopState({
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: false,
    })).toBe(true);
    expect(isClawSnapshotGetResult({
      snapshot: createInitialSnapshot(),
      lastEventSeq: 17,
    })).toBe(false);
  });
});
