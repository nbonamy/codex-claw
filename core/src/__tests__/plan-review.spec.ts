import { describe, expect, it } from 'vitest';
import { agentConversationId, isPlanReview, planReviewFromEvent } from '../plan-review';
import { createInitialSnapshot } from '../snapshot';

describe('plan review identity', () => {
  it('keeps provider identity opaque and derives stable proposal identity', () => {
    const agent = createInitialSnapshot().agents[0]!;
    delete agent.backendSession;
    expect(agentConversationId(agent)).toBeNull();
    const event = { type: 'plan.readyForReview' as const, agentId: agent.id, turnId: 'turn', seq: 1, occurredAt: 'now', payload: { markdown: '# Plan' } };
    const draft = planReviewFromEvent(agent, event);
    expect(draft.conversationId).toBeNull();
    expect(isPlanReview(draft)).toBe(true);
    agent.backendSession = { kind: 'claude', sessionId: 'session', transport: 'stdio' };
    expect(planReviewFromEvent(agent, event).conversationId).toBe('session');
    agent.backendSession = { kind: 'codex', threadId: 'thread' };
    expect(agentConversationId(agent)).toBe('thread');
    const targeted = planReviewFromEvent(agent, { ...event, conversationId: 'explicit', payload: { markdown: '# Plan', itemId: 'item' } });
    expect(targeted).toMatchObject({ conversationId: 'explicit', itemId: 'item', status: 'pending' });
    expect(planReviewFromEvent(agent, { ...event, conversationId: 'explicit', payload: { markdown: '# Plan', itemId: 'item' } }).id).toBe(targeted.id);
    for (const value of [null, 'plan', {}, { ...targeted, status: 'unknown' }, { ...targeted, conversationId: 1 }, { ...targeted, itemId: 1 }, { ...targeted, markdown: null }, { ...targeted, turnId: 1 }]) expect(isPlanReview(value)).toBe(false);
  });
});
