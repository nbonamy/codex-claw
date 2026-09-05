import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot, snapshotMetadata } from '@codex-claw/core/snapshot';
import type { AppSnapshotMetadata, CodexClawApi } from '@codex-claw/core/contracts';
import { createAgentHistoryState } from '../agent-history-state';
import { stubElectronTestWindow } from '../test/client';
import { deferred } from './app-state-test-harness';

describe('createAgentHistoryState', () => {
  it('preserves an event-before-RPC failure until a later successful retry', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.backendSession = { kind: 'codex', threadId: 'thread-dina' };
    const first = deferred<AppSnapshotMetadata>();
    const second = deferred<AppSnapshotMetadata>();
    const hydrateAgentHistory = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    stubElectronTestWindow({
      codexClaw: { hydrateAgentHistory } satisfies Partial<CodexClawApi>,
    });
    const state = createAgentHistoryState({
      adoptSnapshotMetadata: vi.fn(),
      getSnapshot: () => snapshot,
      synchronizeComposerSelection: vi.fn(),
    });

    const initialHydration = state.hydrateActive();
    expect(state.isHydratingActiveAgentHistory.value).toBe(true);

    state.handleMainEvent({
      seq: 1,
      occurredAt: '2026-09-05T00:00:00.000Z',
      agentId: 'agent-dina',
      type: 'thread.historyHydrationFailed',
      payload: {},
    });
    first.resolve(snapshotMetadata(snapshot));
    await initialHydration;

    expect(state.isActiveAgentHistoryFailed.value).toBe(true);
    expect(state.isHydratingActiveAgentHistory.value).toBe(false);

    const retry = state.retryActive();
    void state.retryActive();
    expect(state.isActiveAgentHistoryFailed.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(true);
    expect(hydrateAgentHistory).toHaveBeenCalledTimes(2);

    state.handleMainEvent({
      seq: 2,
      occurredAt: '2026-09-05T00:00:01.000Z',
      agentId: 'agent-dina',
      type: 'thread.historyLoaded',
      payload: { messages: [], replace: true },
    });
    second.resolve(snapshotMetadata(snapshot));
    await retry;

    expect(state.isActiveAgentHistoryFailed.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(false);
  });
});
