import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AppSnapshot, CodexClawApi } from '@codex-claw/core/contracts';
import { createAgentHistoryState } from '../agent-history-state';
import { stubElectronTestWindow } from '../test/client';
import { deferred } from './app-state-test-harness';

describe('createAgentHistoryState', () => {
  it('preserves an event-before-RPC failure until a later successful retry', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.backendSession = { kind: 'codex', threadId: 'thread-dina' };
    const first = deferred<AppSnapshot>();
    const second = deferred<AppSnapshot>();
    const hydrateAgentHistory = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    stubElectronTestWindow({
      codexClaw: { hydrateAgentHistory } satisfies Partial<CodexClawApi>,
    });
    const state = createAgentHistoryState({
      adoptSnapshot: vi.fn(),
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
    first.resolve(snapshot);
    await initialHydration;

    expect(state.isActiveAgentHistoryFailed.value).toBe(true);
    expect(state.isHydratingActiveAgentHistory.value).toBe(false);

    state.reset('agent-dina');
    expect(state.isActiveAgentHistoryFailed.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(false);

    state.handleMainEvent({
      seq: 2,
      occurredAt: '2026-09-05T00:00:00.500Z',
      agentId: 'agent-dina',
      type: 'thread.historyHydrationFailed',
      payload: {},
    });

    const retry = state.retryActive();
    void state.retryActive();
    expect(state.isActiveAgentHistoryFailed.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(true);
    expect(hydrateAgentHistory).toHaveBeenCalledTimes(2);

    second.resolve(snapshot);
    await retry;

    expect(state.isActiveAgentHistoryFailed.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(false);
  });
});
