import { describe, expect, it } from 'vitest';
import { createAntigravityConversationReplica, emptyAntigravitySnapshot } from '../antigravity-conversation-replica';
import type { RendererMessage } from '../contracts';

const identity = { agentId: 'agent', sessionId: 'session', turnId: 'turn', occurredAt: '2026-10-06T10:00:00.000Z' };
describe('Antigravity replica ownership', () => {
  it('applies ordered replay replacements so a denied tool ends failed without duplicate messages', () => {
    const replica = createAntigravityConversationReplica(emptyAntigravitySnapshot('agent', 'session'));
    const message: RendererMessage = { id: 'replayed-tool', agentId: 'agent', role: 'assistant', status: 'complete', createdAt: identity.occurredAt,
      parts: [{ type: 'tool', id: 'replayed-call', kind: 'edit', title: 'Create file', status: 'completed' }] };
    replica.apply({ ...identity, type: 'message.upsert', payload: { message } });
    const denied = { ...message, parts: [{ type: 'tool' as const, id: 'replayed-call', kind: 'edit', title: 'Create file', status: 'failed' as const }] };
    replica.apply({ ...identity, type: 'message.upsert', payload: { message: denied } });
    expect(replica.getSnapshot().messages).toEqual([denied]);
    expect(message.parts[0]).toHaveProperty('status', 'completed');
    expect(() => replica.apply({ ...identity, sessionId: 'other', type: 'message.upsert', payload: { message } })).toThrow('identity mismatch');
    expect(replica.getSnapshot().messages).toEqual([denied]);
  });

  it('rejects overlap and does not let a stale completion clear the next turn', () => {
    const replica = createAntigravityConversationReplica(emptyAntigravitySnapshot('agent', 'session'));
    replica.apply({ ...identity, type: 'turn.started', payload: { turn: { id: 'turn' } } });
    expect(() => replica.apply({ ...identity, turnId: 'overlap', type: 'turn.started', payload: { turn: { id: 'overlap' } } })).toThrow('serialized');
    replica.apply({ ...identity, type: 'turn.completed', payload: { turn: { id: 'turn', status: 'interrupted' } } });
    replica.apply({ ...identity, turnId: 'next', type: 'turn.started', payload: { turn: { id: 'next' } } });
    replica.apply({ ...identity, type: 'turn.completed', payload: { turn: { id: 'turn', status: 'interrupted' } } });
    expect(replica.getSnapshot()).toMatchObject({ busy: true, activeTurnId: 'next', error: null });
  });
});
