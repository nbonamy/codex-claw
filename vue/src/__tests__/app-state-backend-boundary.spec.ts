import { afterEach, describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { installBackendFixture } from '../test/backend-fixture';
import { useAppState } from '../app-state';

afterEach(() => { delete window.codexClaw; });

describe('unified backend → app state request lifecycle', () => {
  it('keeps a background proposal attached to its owner and opens it after navigation', async () => {
    const snapshot = createInitialSnapshot();
    const other = snapshot.agents[1]!;
    other.backendSession = undefined;
    const { api, emit } = installBackendFixture(snapshot);
    const state = useAppState();
    await state.loadSnapshot();
    state.sidePanelRequest.value = null;
    emit({ type: 'plan.readyForReview', agentId: other.id, turnId: 'turn', payload: { itemId: 'proposal', markdown: '# Background plan\n\nReview after switching.' } });
    expect(state.sidePanelRequest.value).toBeNull();
    const planReview = { id: JSON.stringify([other.id, null, 'turn', 'proposal']), conversationId: null, turnId: 'turn', itemId: 'proposal', markdown: '# Background plan\n\nReview after switching.', status: 'pending' as const };
    expect(state.snapshot.value.agents.find((agent) => agent.id === other.id)?.planReview).toStrictEqual(planReview);
    expect(state.snapshot.value.activeAgentId).toBe(snapshot.activeAgentId);
    expect(state.snapshot.value.agents.find((agent) => agent.id === snapshot.activeAgentId)?.planReview).toBeUndefined();
    const navigated = { ...snapshot, activeAgentId: other.id, agents: snapshot.agents.map((agent) => agent.id === other.id ? { ...agent, planReview } : agent) };
    api.selectAgent.mockResolvedValue(navigated);
    api.loadConversationHistory.mockResolvedValue(navigated);
    await state.selectAgent(other.id);
    expect(state.sidePanelRequest.value).toMatchObject({ kind: 'markdown', purpose: 'plan', title: 'Background plan', content: 'Review after switching.' });
    const revised = { ...navigated, agents: navigated.agents.map((agent) => agent.id === other.id ? { ...agent, planReview: { ...planReview, status: 'revise' as const } } : agent) };
    api.respondToPlanReview.mockResolvedValue(revised);
    await state.respondToPlanReview('revise', 'Include failure paths');
    expect(api.respondToPlanReview).toHaveBeenCalledExactlyOnceWith(other.id, { reviewId: planReview.id, resolution: 'revise', feedback: 'Include failure paths' });
    expect(api.sendPrompt).not.toHaveBeenCalled();
    expect(state.snapshot.value.agents.find((agent) => agent.id === other.id)?.planReview?.status).toBe('revise');
  });

  it.each(['codex', 'claude'] as const)('keeps %s requests on their agent through navigation and failed response', async (backend) => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.backend = backend;
    snapshot.agents[0]!.backendDefaults = undefined;
    const { api, emit } = installBackendFixture(snapshot);
    const state = useAppState();
    await state.loadSnapshot();
    const agentId = snapshot.agents[0]!.id;
    const otherId = snapshot.agents[1]!.id;
    const request = { id: '0', conversationId: 'conversation', turnId: 'turn', kind: 'question' as const, question: { itemId: 'item', delivery: 'async' as const, blocking: false, questions: [] } };
    emit({ type: 'agentRequest.created', backend, agentId, payload: { request } });
    emit({ type: 'agentRequest.created', backend, agentId: otherId, payload: { request: { ...request, conversationId: 'other' } } });
    expect(state.snapshot.value.agentRequests?.[agentId]).toStrictEqual([request]);
    const navigated = { ...snapshot, activeAgentId: otherId, agentRequests: { [agentId]: [request], [otherId]: [{ ...request, conversationId: 'other' }] } };
    api.selectAgent.mockResolvedValue(navigated);
    api.loadConversationHistory.mockResolvedValue(navigated);
    await state.selectAgent(otherId);
    api.respondToClientRequest.mockRejectedValueOnce(new Error('offline'));
    await expect(state.respondToClientRequest({ agentId, id: '0', payload: { answers: {} } })).rejects.toThrow('offline');
    expect(state.snapshot.value.agentRequests?.[agentId]).toStrictEqual([request]);
    api.respondToClientRequest.mockResolvedValue(navigated);
    await state.respondToClientRequest({ agentId, id: '0', payload: { answers: {} } });
    expect(api.respondToClientRequest).toHaveBeenLastCalledWith({ agentId, id: '0', payload: { answers: {} } });
    emit({ type: 'agentRequest.resolved', backend, agentId, conversationId: 'conversation', payload: { id: '0', outcome: { kind: 'answered', answers: {} } } });
    expect(state.snapshot.value.agentRequests?.[agentId]).toStrictEqual([]);
    expect(state.snapshot.value.agentRequests?.[otherId]).toHaveLength(1);
  });
});
