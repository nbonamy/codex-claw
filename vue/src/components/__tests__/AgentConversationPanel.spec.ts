import { flushPromises, mount } from '@vue/test-utils';
import { computed, shallowReactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { claudeBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { createClaudeConversationReplica } from '@codex-claw/core/claude-conversation-replica';
import { createAgentComposerState } from '../../agent-composer-state';
import type { AgentConversationView } from '../../app-state';
import { claudeConversationSnapshot } from '../../test/claude-conversation-fixtures';
import type { AgentConversationActions } from '../use-agent-conversation';
import AgentConversationPanel from '../AgentConversationPanel.vue';
import { backendChoicesKey } from '../backend-selection';

describe('AgentConversationPanel', () => {
  it('queues the focused split Claude pane shortcut for its own agent and disables shelf steering', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[1]!;
    agent.backend = 'claude';
    agent.backendDefaults = { kind: 'claude' };
    agent.status = { type: 'working' };
    agent.backendSession = { kind: 'claude', sessionId: 'session-claude', transport: 'stdio' };
    const view = shallowReactive<AgentConversationView>({
      agent, codexSnapshot: null,
      claudeSnapshot: claudeConversationSnapshot([], { agentId: agent.id, sessionId: 'session-claude', busy: true, activeTurnId: 'turn-1' }),
      composer: createAgentComposerState({ getSnapshot: () => snapshot }).configurationForAgent(agent.id),
      composerState: { text: 'Split follow-up', selectionStart: 15, selectionEnd: 15 },
      attachments: [], capabilities: claudeBackendCapabilities, approvals: [], sending: true,
      queuedPrompts: [{ id: 'queued-split', agentId: agent.id, text: 'Already queued', createdAt: '2026-10-03T00:00:00Z' }],
      history: { failed: false, hydrating: false, hasOlder: false, loadingOlder: false },
      answeredClientRequestIds: new Set(),
    });
    const actions: AgentConversationActions = {
      planReview: vi.fn(), clearGoal: vi.fn(), threadFlag: vi.fn(), prepare: vi.fn(), loadOlder: vi.fn(),
      send: vi.fn(), steer: vi.fn(), interrupt: vi.fn(), deleteTurn: vi.fn(), editTurn: vi.fn(), forkTurn: vi.fn(), retryTurn: vi.fn(),
      continueInterruptedTurn: vi.fn(), resolveApproval: vi.fn(), clientResponse: vi.fn(),
      selectModel: vi.fn(), selectReasoningEffort: vi.fn(), selectServiceTier: vi.fn(), setPlanMode: vi.fn(),
      setApprovalPreset: vi.fn(), setPermissionMode: vi.fn(),
      updateComposerState: (_id, state) => { view.composerState = state; },
      updateAttachments: (_id, attachments) => { view.attachments = attachments; },
      deleteQueuedPrompt: vi.fn(), updateQueuedPrompt: vi.fn(), steerQueuedPrompt: vi.fn(),
    };
    const wrapper = mount(AgentConversationPanel, { props: {
      view, actions, agents: snapshot.agents, focused: true, mentionGroups: [], modelMenuItems: [], selectModelMenuItem: vi.fn(),
      savedPromptDrafts: [], savePromptDraft: vi.fn(), removePromptDraft: vi.fn(), openLink: vi.fn(), openImage: vi.fn(), openVisualization: vi.fn(),
    }, global: { provide: { [backendChoicesKey as symbol]: computed(() => ['codex', 'claude']) } } });
    expect(wrapper.get<HTMLButtonElement>('[aria-label="Steer queued prompt now"]').element.disabled).toBe(true);
    await wrapper.get('.chat-rich-text-editor').trigger('keydown', { key: 'Enter', metaKey: true });
    await flushPromises();
    expect(actions.send).toHaveBeenCalledExactlyOnceWith(agent.id, 'Split follow-up', undefined);
    expect(actions.steer).not.toHaveBeenCalled();
  });

  it('routes an unfocused Claude pane’s composer approval to its own agent and restores its draft and attachment', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backend = 'claude'; agent.backendDefaults = { kind: 'claude' };
    agent.backendSession = { kind: 'claude', sessionId: 'session-claude', transport: 'stdio' };
    const replica = createClaudeConversationReplica(claudeConversationSnapshot([], { agentId: agent.id, sessionId: 'session-claude' }));
    const view = shallowReactive<AgentConversationView>({
      agent, codexSnapshot: null, claudeSnapshot: replica.getSnapshot(),
      composer: createAgentComposerState({ getSnapshot: () => snapshot }).configurationForAgent(agent.id),
      composerState: { text: 'Keep the split draft', selectionStart: 5, selectionEnd: 5 },
      attachments: [{ id: 'notes', type: 'file', reference: '/tmp/notes.txt', name: 'notes.txt', mimeType: 'text/plain', size: 10 }],
      capabilities: claudeBackendCapabilities, approvals: [], queuedPrompts: [], sending: false,
      history: { failed: false, hydrating: false, hasOlder: false, loadingOlder: false },
      answeredClientRequestIds: new Set(),
    });
    const actions: AgentConversationActions = {
      planReview: vi.fn(), clearGoal: vi.fn(), threadFlag: vi.fn(), prepare: vi.fn(), loadOlder: vi.fn(),
      send: vi.fn(), steer: vi.fn(), interrupt: vi.fn(), deleteTurn: vi.fn(), editTurn: vi.fn(), forkTurn: vi.fn(), retryTurn: vi.fn(),
      continueInterruptedTurn: vi.fn(), resolveApproval: vi.fn(), clientResponse: vi.fn(),
      selectModel: vi.fn(), selectReasoningEffort: vi.fn(), selectServiceTier: vi.fn(), setPlanMode: vi.fn(),
      setApprovalPreset: vi.fn(), setPermissionMode: vi.fn(),
      updateComposerState: (_id, state) => { view.composerState = state; },
      updateAttachments: (_id, attachments) => { view.attachments = attachments; },
      deleteQueuedPrompt: vi.fn(), updateQueuedPrompt: vi.fn(), steerQueuedPrompt: vi.fn(),
    };
    const wrapper = mount(AgentConversationPanel, { props: {
      view, actions, agents: snapshot.agents, focused: false, mentionGroups: [], modelMenuItems: [], selectModelMenuItem: vi.fn(),
      savedPromptDrafts: [], savePromptDraft: vi.fn(), removePromptDraft: vi.fn(), openLink: vi.fn(), openImage: vi.fn(), openVisualization: vi.fn(),
    }, global: { provide: { [backendChoicesKey as symbol]: computed(() => ['codex', 'claude']) } } });
    expect(wrapper.get('.chat-rich-text-editor').text()).toBe('Keep the split draft');
    view.claudeSnapshot = replica.apply({ type: 'approval.requested', backend: 'claude', agentId: agent.id, seq: 1, occurredAt: '2026-10-03T00:00:00Z', turnId: 'turn-1', payload: {
      id: 'permission', kind: 'confirm_tool', payload: { confirmation: { integrationId: 'claude', integrationName: 'Claude', toolName: 'Edit', summary: 'Edit this file?', argumentsPreview: '{}', allowAlways: true } },
    } });
    await flushPromises();
    const footer = wrapper.get('.codex-conversation-pane__footer');
    expect(wrapper.findAll('.chat-tool-confirmation')).toHaveLength(1);
    expect(footer.text()).toContain('Edit this file?');
    expect(footer.findAll('button').map(button => button.text())).toEqual(['Allow', 'Always allow', 'Deny']);
    await footer.findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(actions.clientResponse).toHaveBeenCalledExactlyOnceWith({ agentId: agent.id, id: 'permission', payload: { decision: 'always_allow' } });
    view.claudeSnapshot = replica.apply({ type: 'clientRequest.resolved', backend: 'claude', agentId: agent.id, seq: 2, occurredAt: '2026-10-03T00:00:01Z', payload: { id: 'permission' } });
    await flushPromises();
    expect(wrapper.get('.chat-rich-text-editor').text()).toBe('Keep the split draft');
    expect(view.composerState).toEqual({ text: 'Keep the split draft', selectionStart: 5, selectionEnd: 5 });
    expect(wrapper.text()).toContain('notes.txt');
    expect(wrapper.text()).toContain('Allowed tool call');
  });
});
