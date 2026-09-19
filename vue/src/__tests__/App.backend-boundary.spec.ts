import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App.vue';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { installBackendFixture } from '../test/backend-fixture';
import { codexConversationSnapshot } from '../test/codex-conversation-fixtures';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { approvalAgentRequest } from '@codex-claw/core/agent-request';

afterEach(() => { delete window.codexClaw; });

describe('Unified backend → mounted application', () => {
  it('submits worktree delegation through the complete client seam and clears only on success', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.threadFlags = { delegate_to_worktree: true };
    const { api } = installBackendFixture(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();

    api.respondToThreadFlag.mockRejectedValueOnce(new Error('backend unavailable'));
    await wrapper.get('.thread-flag-affordance__action').trigger('click');
    await flushPromises();
    expect(api.respondToThreadFlag).toHaveBeenCalledExactlyOnceWith(agent.id, {
      id: 'delegate_to_worktree', action: 'execute',
    });
    expect(wrapper.find('.thread-flag-affordance').exists()).toBe(true);

    const cleared = structuredClone(snapshot);
    delete cleared.agents[0]!.threadFlags;
    api.respondToThreadFlag.mockResolvedValueOnce(cleared);
    await wrapper.get('.thread-flag-affordance__action').trigger('click');
    await flushPromises();
    expect(api.respondToThreadFlag).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.thread-flag-affordance').exists()).toBe(false);
  });

  it('dismisses worktree delegation without using the prompt API', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.threadFlags = { delegate_to_worktree: true };
    const { api } = installBackendFixture(snapshot);
    const cleared = structuredClone(snapshot);
    delete cleared.agents[0]!.threadFlags;
    api.respondToThreadFlag.mockResolvedValueOnce(cleared);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();

    await wrapper.get('.thread-flag-affordance__dismiss').trigger('click');
    await flushPromises();

    expect(api.respondToThreadFlag).toHaveBeenCalledWith(agent.id, {
      id: 'delegate_to_worktree', action: 'dismiss',
    });
    expect(api.sendPrompt).not.toHaveBeenCalled();
    expect(wrapper.find('.thread-flag-affordance').exists()).toBe(false);
  });

  it('shows, updates and clears execution progress without opening a review', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backendSession = { kind: 'codex', threadId: 'thread-1' };
    const { emit } = installBackendFixture(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    const executionPlan = { turnId: 'turn', explanation: 'Implementing', steps: [{ step: 'Verify boundary behavior', status: 'inProgress' as const }], markdown: '- [ ] Verify boundary behavior', updatedAt: '2026-09-16T00:00:00Z' };
    emit({ type: 'codex.conversationSnapshotChanged', backend: 'codex', agentId: agent.id, threadId: 'thread-1', payload: { revision: 1, snapshot: codexConversationSnapshot([], { activeTurnId: 'turn', executionPlan, busy: true }) } });
    await flushPromises();
    expect(wrapper.get('.conversation-plan').text()).toContain('Verify boundary behavior');
    expect(wrapper.find('.plan-review-footer').exists()).toBe(false);
    emit({ type: 'codex.conversationSnapshotChanged', backend: 'codex', agentId: agent.id, threadId: 'thread-1', payload: { revision: 2, snapshot: codexConversationSnapshot([], { activeTurnId: 'turn', executionPlan: { ...executionPlan, steps: [{ step: 'Verify boundary behavior', status: 'completed' }] } }) } });
    await flushPromises();
    expect(wrapper.find('.conversation-plan__step--completed').exists()).toBe(true);
    emit({ type: 'codex.conversationSnapshotChanged', backend: 'codex', agentId: agent.id, threadId: 'thread-1', payload: { revision: 3, snapshot: codexConversationSnapshot([], { executionPlan: null }) } });
    await flushPromises();
    expect(wrapper.find('.conversation-plan').exists()).toBe(false);
    expect(wrapper.find('.plan-review-footer').exists()).toBe(false);
  });

  it('enforces advertised composer capabilities in the visible menu and submitted options', async () => {
    const snapshot = createInitialSnapshot();
    const { api, emit } = installBackendFixture(snapshot);
    api.sendPrompt.mockResolvedValue(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    const capabilities = { ...codexBackendCapabilities, attachments: false, planMode: 'unsupported' as const };
    emit({ type: 'backend.statusChanged', backend: 'codex', payload: { backend: 'codex', status: 'running', capabilities } });
    await flushPromises();
    await wrapper.get('button[aria-label="Composer actions"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="menu"]').text()).not.toContain('Add Files & Photos');
    expect(wrapper.get('[role="menu"]').text()).not.toContain('Plan mode');
    await wrapper.get('button[aria-label="Composer actions"]').trigger('click');
    emit({ type: 'backend.statusChanged', backend: 'codex', payload: { backend: 'codex', status: 'running', capabilities: codexBackendCapabilities } });
    await flushPromises();
    await wrapper.get('button[aria-label="Composer actions"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="menu"]').text()).toContain('Add Files & Photos');
    const planMode = wrapper.findAll('[role="menuitemcheckbox"]').find((item) => item.text().includes('Plan mode'))!;
    await planMode.trigger('click');
    const editor = wrapper.get('[contenteditable="true"]');
    editor.element.textContent = 'Plan the fix';
    await editor.trigger('input');
    await wrapper.get('button[aria-label="Send prompt"]').trigger('click');
    await flushPromises();
    expect(api.sendPrompt).toHaveBeenCalledExactlyOnceWith(snapshot.activeAgentId, 'Plan the fix', expect.objectContaining({ planMode: true }));
  });

  it('shows a normalized approval and removes it when the backend cancels the request', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backend = 'claude';
    agent.backendSession = undefined;
    agent.backendDefaults = undefined;
    const { api, emit } = installBackendFixture(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    const request = approvalAgentRequest({ id: 'permission', kind: 'permissions', conversationId: 'session', turnId: 'turn', itemId: 'item', title: 'Allow test workspace access', requestedPermissions: [{ kind: 'filesystem', access: 'write', path: '/tmp/project' }], allowedScopes: ['once'], canDeny: true });
    emit({ type: 'agentRequest.created', backend: 'claude', agentId: agent.id, payload: { request } });
    await flushPromises();
    expect(wrapper.get('.codex-approval-prompt').text()).toContain('Allow test workspace access');
    emit({ type: 'agentRequest.resolved', backend: 'claude', agentId: agent.id, payload: { id: request.id, outcome: { kind: 'cancelled' } } });
    emit({ type: 'agent.statusChanged', agentId: agent.id, payload: { type: 'working' } });
    await flushPromises();
    expect(wrapper.find('.codex-approval-prompt').exists()).toBe(false);
    expect(api.respondToClientRequest).not.toHaveBeenCalled();
  });

  it('cancels a restored plan through the review command without sending a prompt', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.planReview = { id: 'restored', conversationId: null, turnId: 'turn', markdown: '# Cancel this proposal', status: 'pending' };
    const { api } = installBackendFixture(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    const resolved = structuredClone(snapshot);
    resolved.agents[0]!.planReview!.status = 'cancel';
    api.respondToPlanReview.mockResolvedValueOnce(resolved);
    await wrapper.get('.plan-review-footer__button--cancel').trigger('click');
    await flushPromises();
    expect(api.respondToPlanReview).toHaveBeenCalledExactlyOnceWith(agent.id, { reviewId: 'restored', resolution: 'cancel' });
    expect(wrapper.find('.plan-review-footer').exists()).toBe(false);
    expect(api.sendPrompt).not.toHaveBeenCalled();
  });

  it('shows and removes backend-admitted queued work above the real composer', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backendSession = { kind: 'codex', threadId: 'thread-1' };
    const { emit } = installBackendFixture(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    emit({ type: 'codex.conversationSnapshotChanged', backend: 'codex', agentId: agent.id, threadId: 'thread-1', payload: { revision: 1, snapshot: codexConversationSnapshot() } });
    emit({ type: 'agent.promptQueued', agentId: agent.id, payload: { id: 'queued', text: 'Review the other agent change.' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Review the other agent change.');
    emit({ type: 'agent.promptDequeued', agentId: agent.id, payload: { ids: ['queued'] } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Review the other agent change.');
  });

  it.each(['codex', 'claude'] as const)('reviews a %s agent plan using only the common contract', async (backend) => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backend = backend;
    agent.backendSession = undefined;
    agent.backendDefaults = undefined;
    const { api, emit } = installBackendFixture(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    emit({ type: 'plan.readyForReview', agentId: agent.id, turnId: 'turn', payload: { itemId: 'proposal', markdown: '# Review this\n\nKeep the backend independent.' } });
    await flushPromises();
    expect(wrapper.get('[aria-label="Right workspace"]').text()).toContain('Keep the backend independent.');
    const reviewId = JSON.stringify([agent.id, null, 'turn', 'proposal']);
    const accepted = structuredClone(snapshot);
    accepted.agents[0]!.planReview = { id: reviewId, conversationId: null, turnId: 'turn', itemId: 'proposal', markdown: '# Review this', status: 'accept' };
    api.respondToPlanReview.mockResolvedValue(accepted);
    await wrapper.get('.plan-review-footer__button--primary').trigger('click');
    await flushPromises();
    expect(api.respondToPlanReview).toHaveBeenCalledExactlyOnceWith(agent.id, { reviewId, resolution: 'accept' });
    expect(api.sendPrompt).not.toHaveBeenCalled();
    expect(wrapper.find('.plan-review-footer').exists()).toBe(false);
    emit({ type: 'plan.readyForReview', agentId: agent.id, turnId: 'turn', payload: { itemId: 'proposal', markdown: '# Review this' } });
    await flushPromises();
    expect(wrapper.find('.plan-review-footer').exists()).toBe(false);
  });

  it('keeps a failed decision reviewable and permits retry', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.planReview = { id: 'restored', conversationId: null, turnId: 'turn', markdown: '# Restored proposal', status: 'pending' };
    const { api } = installBackendFixture(snapshot);
    api.respondToPlanReview.mockRejectedValueOnce(new Error('backend unavailable'));
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.get('[aria-label="Right workspace"]').text()).toContain('Restored proposal');
    await wrapper.get('.plan-review-footer__button--primary').trigger('click');
    await flushPromises();
    expect(wrapper.find('.plan-review-footer').exists()).toBe(true);
    const accepted = structuredClone(snapshot);
    accepted.agents[0]!.planReview!.status = 'accept';
    api.respondToPlanReview.mockResolvedValueOnce(accepted);
    await wrapper.get('.plan-review-footer__button--primary').trigger('click');
    await flushPromises();
    expect(api.respondToPlanReview).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.plan-review-footer').exists()).toBe(false);
  });

  it('dismisses review when a different client resolves it, without submitting a prompt', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.planReview = { id: 'restored', conversationId: null, turnId: 'turn', markdown: '# Remote decision', status: 'pending' };
    const { api, emit } = installBackendFixture(snapshot);
    const wrapper = mount(App, { global: { plugins: [ElementPlus] } });
    await flushPromises();
    expect(wrapper.find('.plan-review-footer').exists()).toBe(true);
    emit({ type: 'plan.reviewResolved', agentId: agent.id, payload: { reviewId: 'restored', resolution: 'cancel' } });
    await flushPromises();
    expect(wrapper.find('.plan-review-footer').exists()).toBe(false);
    expect(api.respondToPlanReview).not.toHaveBeenCalled();
    expect(api.sendPrompt).not.toHaveBeenCalled();
  });
});
