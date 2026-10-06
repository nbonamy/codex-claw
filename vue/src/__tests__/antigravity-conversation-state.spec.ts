import { expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import { emptyAntigravitySnapshot } from '@workspace/core/antigravity-conversation-replica';
import { createAntigravityConversationState } from '../antigravity-conversation-state';

it('recovers revision gaps, replaces history atomically, and evicts frames after identity changes', async () => {
  const recover = vi.fn().mockResolvedValue(undefined);
  const state = createAntigravityConversationState(recover);
  const agent = { ...createInitialSnapshot().agents[0]!, backend: 'antigravity' as const, backendSession: { kind: 'antigravity' as const, sessionId: 'native' } };
  const identity = { agentId: agent.id, backend: 'antigravity' as const, backendSessionId: 'native', seq: 1, occurredAt: '2026-10-06T10:00:00Z' };
  const snapshot = emptyAntigravitySnapshot(agent.id, 'native');
  state.receive({ ...identity, type: 'antigravity.conversationSnapshotChanged', payload: { revision: 1, snapshot } });
  const event = { agentId: agent.id, sessionId: 'native', turnId: 'turn', occurredAt: identity.occurredAt, type: 'turn.started' as const, payload: { turn: { id: 'turn' } } };
  state.receive({ ...identity, type: 'antigravity.conversationEventReceived', payload: { revision: 3, event } });
  expect(state.select(agent)).toBeNull();
  expect(recover).toHaveBeenCalledExactlyOnceWith(agent.id);
  await flushPromises();
  state.receive({ ...identity, type: 'antigravity.conversationSnapshotChanged', payload: { revision: 4, snapshot } });
  state.receive({ ...identity, type: 'antigravity.conversationEventReceived', payload: { revision: 5, event } });
  expect(state.select(agent)).toMatchObject({ busy: true, activeTurnId: 'turn' });
  state.receive({ ...identity, type: 'antigravity.conversationSnapshotChanged', payload: { revision: 4, snapshot } });
  expect(state.select(agent)?.busy).toBe(true);
  state.reconcile([{ ...agent, backendSession: { kind: 'antigravity', sessionId: 'other' } }]);
  expect(state.select(agent)).toBeNull();
});
