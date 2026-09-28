import { flushPromises, mount } from '@vue/test-utils';
import { resolveCodexConversationPaneValue } from '@codex-app-sdk/vue';
import { reactive, shallowReactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { AppCommand, CodexClawApi } from '@codex-claw/core/contracts';
import type { AgentConversationView } from '../../app-state';
import AppShell from '../AppShell.vue';
import AgentWorkspace from '../AgentWorkspace.vue';
import ConversationPane from '../ConversationPane.vue';
import type { AgentConversationActions } from '../use-agent-conversation';
import { codexConversationSnapshot, codexTextMessage } from '../../test/codex-conversation-fixtures';
import { clickPortaledMenuItem } from './agent-sidebar-test-harness';

async function attachedWorkspace(attachToDocument = false) {
  const snapshot = reactive(createInitialSnapshot());
  const guest = snapshot.agents[1]!;
  const actions = Object.fromEntries(['planReview', 'prepare', 'clearGoal', 'threadFlag', 'loadOlder', 'send', 'steer', 'interrupt', 'deleteTurn', 'editTurn', 'retryTurn', 'continueInterruptedTurn', 'resolveApproval', 'clientResponse', 'selectModel', 'selectReasoningEffort', 'selectServiceTier', 'setPlanMode', 'setApprovalPreset', 'setPermissionMode', 'updateComposerState', 'updateAttachments', 'deleteQueuedPrompt', 'updateQueuedPrompt', 'steerQueuedPrompt'].map(name => [name, vi.fn().mockResolvedValue(undefined)])) as unknown as AgentConversationActions;
    const view = shallowReactive<AgentConversationView>( {
      agent: guest,
      codexSnapshot: null,
      claudeSnapshot: null,
      composer: {
        backend: guest.backend, selectionSource: '', models: [], modelStatus: 'loaded', modelError: null,
        skills: [], plugins: [], skillStatus: 'loaded', skillError: null, files: [], fileStatus: 'loaded', fileError: null,
        selectedModelId: null, selectedReasoningEffort: null, selectedServiceTier: null, planMode: false, pendingSelection: null,
      },
      composerState: { text: '', selectionStart: 0, selectionEnd: 0 },
      attachments: [],
      capabilities: defaultBackendCapabilities(guest.backend),
      approvals: [],
      queuedPrompts: [],
      history: { failed: false, hasOlder: true, hydrating: false, loadingOlder: false },
      sending: false,
      answeredClientRequestIds: new Set(),
    });

  view.codexSnapshot = codexConversationSnapshot([codexTextMessage('guest-message', 'assistant', 'See [source](src/guest.ts) and [docs](https://example.com).')]);
  const previewAgentFile = vi.fn().mockResolvedValue({ kind: 'text', path: 'src/guest.ts', content: 'export const guest = true;', truncated: false });
  const wrapper = mount(AppShell, {
    ...(attachToDocument ? { attachTo: document.body } : {}),
    props: { snapshot, activeAgent: snapshot.agents[0], isLoading: false, isSending: false,
      agentConversationFor: id => id === guest.id ? view : null, agentConversationActions: actions, previewAgentFile },
  });
  await wrapper.findAll('.agent-sidebar__agent')[1]!.trigger('contextmenu');
  await clickPortaledMenuItem('Attach to Current Agent');
  await flushPromises();
  const workspace = wrapper.findAllComponents(AgentWorkspace).find(component => component.props('embedded'))!;
  expect(workspace).toBeDefined();
  const pane = workspace.getComponent(ConversationPane);
  const paneActions = resolveCodexConversationPaneValue(pane.props('controller').actions);
  return { wrapper, workspace, pane, paneActions, view, guest, snapshot, actions, previewAgentFile };
}

describe('attached AgentWorkspace', () => {
  it('routes native draft commands to the last focused visible composer and honors explicit composer targets', async () => {
    let command: (value: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn(listener => { command = listener; return () => undefined; }),
    } as Partial<CodexClawApi> as CodexClawApi;
    const { wrapper, workspace, view, guest, snapshot } = await attachedWorkspace(true);
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    await wrapper.setProps({
      composerState: { text: 'Host draft', selectionStart: 0, selectionEnd: 0 },
      updateSettings,
    });
    view.composerState = { text: 'Guest draft', selectionStart: 0, selectionEnd: 0 };
    await flushPromises();
    const guestEditor = workspace.get<HTMLElement>('[contenteditable="true"]');
    guestEditor.element.focus();
    guestEditor.element.blur(); // Native menus can take focus out of the renderer.
    command({ type: 'save-active-prompt-draft' });
    await flushPromises();
    expect(updateSettings).toHaveBeenLastCalledWith({ general: { savedPromptDrafts: [expect.objectContaining({ agentId: guest.id, text: 'Guest draft' })] } });
    command({ type: 'open-saved-prompt-drafts' });
    await flushPromises();
    expect(workspace.find('.saved-prompt-draft-picker').exists()).toBe(true);
    await workspace.get('.saved-prompt-draft-picker').trigger('keydown', { key: 'Escape' });

    command({ type: 'open-agent-composer' });
    await flushPromises();
    expect(document.activeElement).toBe(guestEditor.element);

    const hostPane = wrapper.getComponent(AgentWorkspace).getComponent(ConversationPane);
    command({ type: 'open-agent-composer', agentId: snapshot.agents[0]!.id });
    await flushPromises();
    expect(document.activeElement).toBe(hostPane.get('[contenteditable="true"]').element);
    command({ type: 'save-active-prompt-draft' });
    await flushPromises();
    expect(updateSettings).toHaveBeenLastCalledWith({ general: { savedPromptDrafts: [expect.objectContaining({ agentId: snapshot.agents[0]!.id, text: 'Host draft' })] } });

    guestEditor.element.focus();
    await workspace.get('a[href="src/guest.ts"]').trigger('click');
    await flushPromises();
    command({ type: 'open-saved-prompt-drafts' });
    await flushPromises();
    expect(hostPane.find('.saved-prompt-draft-picker').exists()).toBe(true);
    await hostPane.get('.saved-prompt-draft-picker').trigger('keydown', { key: 'Escape' });
    command({ type: 'open-agent-composer', agentId: guest.id });
    await flushPromises();
    expect(document.activeElement).toBe(guestEditor.element);
    await wrapper.get('[aria-label="Close Jesse tab"]').trigger('click');
    command({ type: 'open-saved-prompt-drafts' });
    await flushPromises();
    expect(hostPane.find('.saved-prompt-draft-picker').exists()).toBe(true);
  });

  it.each(['guest', 'host'] as const)('releases the attachment and its artifact tabs when the %s moves teams', async (moved) => {
    const { wrapper, workspace, guest, snapshot } = await attachedWorkspace();
    const host = snapshot.agents[0]!;
    await workspace.get('a[href="src/guest.ts"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[aria-label="Close Jesse · guest.ts tab"]').exists()).toBe(true);
    const targetTeam = { ...snapshot.teams[0]!, id: 'other-team', name: 'Other', agentIds: [] as string[] };
    snapshot.teams.push(targetTeam);
    const agent = moved === 'guest' ? guest : host;
    snapshot.teams.find(team => team.id === agent.teamId)!.agentIds = snapshot.teams.find(team => team.id === agent.teamId)!.agentIds.filter(id => id !== agent.id);
    agent.teamId = targetTeam.id;
    targetTeam.agentIds.push(agent.id);
    await wrapper.setProps({ activeAgent: agent });
    await wrapper.setProps({ activeAgent: host });
    expect(wrapper.find('[aria-label="Close Jesse tab"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Close Jesse · guest.ts tab"]').exists()).toBe(false);
    await wrapper.setProps({ activeAgent: guest });
    snapshot.activeTeamId = guest.teamId ?? null;
    await flushPromises();
    await wrapper.findAll('.agent-sidebar__agent').find(row => row.text().includes('Jesse'))!.trigger('click');
    expect(wrapper.emitted('select-agent')?.at(-1)).toStrictEqual([guest.id]);
    expect(wrapper.get('.source-preview-panel').text()).toContain('export const guest = true;');
  });

  it('focuses the attached composer with its finding context after clicking Clarify', async () => {
    const { wrapper, workspace, guest } = await attachedWorkspace(true);
    guest.threadFlags = { ready_for_review: true };
    guest.codeReview = {
      id: 'guest-review', targetAgentId: guest.id, reviewerAgentId: guest.id,
      scope: { type: 'uncommitted' }, threadMode: 'current', status: 'ready', activeRoundId: 'round',
      createdAt: '', updatedAt: '',
      rounds: [{ id: 'round', number: 1, status: 'ready', startedAt: '', findings: [{
        id: 'finding', roundId: 'round', priority: 'p2', title: 'Preserve guest state', body: 'Keep the guest workspace.',
        decision: { state: 'undecided' }, discussion: [], remediation: { state: 'notStarted' }, createdAt: '', updatedAt: '',
      }] }],
    };
    await flushPromises();
    await workspace.get('[aria-label="Open code review"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Clarify"]').trigger('click');
    await flushPromises();

    expect(workspace.isVisible()).toBe(true);
    expect(workspace.text()).toContain('Preserve guest state');
    expect(document.activeElement).toBe(workspace.get('[contenteditable="true"]').element);
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('detaches children and preserves their workspace when attaching their host elsewhere', async () => {
    const { wrapper, workspace, snapshot, guest, view } = await attachedWorkspace();
    const host = snapshot.agents[0]!;
    const third = { ...host, id: 'agent-third', name: 'Third' };
    snapshot.agents.push(third);
    snapshot.teams.find(team => team.id === third.teamId)!.agentIds.push(third.id);
    await wrapper.setProps({
      agentConversationFor: id => ({ ...view, agent: snapshot.agents.find(agent => agent.id === id)! }),
    });
    await workspace.get('a[href="src/guest.ts"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[aria-label="Close Jesse · guest.ts tab"]').isVisible()).toBe(true);

    await wrapper.setProps({ activeAgent: third });
    await wrapper.findAll('.agent-sidebar__agent').find(row => row.text().includes('Dina'))!.trigger('contextmenu');
    await clickPortaledMenuItem('Attach to Current Agent');
    await flushPromises();
    expect(wrapper.find('[aria-label="Close Jesse tab"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Close Jesse · guest.ts tab"]').exists()).toBe(false);

    await wrapper.findAll('.agent-sidebar__agent').find(row => row.text().includes('Jesse'))!.trigger('click');
    expect(wrapper.emitted('select-agent')?.at(-1)).toStrictEqual([guest.id]);
    await wrapper.setProps({ activeAgent: guest });
    expect(wrapper.get('.source-preview-panel').isVisible()).toBe(true);
    expect(wrapper.get('.source-preview-panel').text()).toContain('export const guest = true;');
  });

  it('routes thread flags and goal clearing to the attached agent through the shared controls', async () => {
    const { wrapper, workspace, view, guest, actions } = await attachedWorkspace();
    view.agent = { ...guest, threadFlags: { ready_for_review: true } };
    view.codexSnapshot = { ...view.codexSnapshot!, goal: { objective: 'Review the guest', status: 'active', tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0, threadId: 'guest-thread' } };
    await flushPromises();
    await workspace.get('[aria-label="Open code review"]').trigger('click');
    await flushPromises();
    expect(actions.threadFlag).toHaveBeenCalledWith(guest.id, { id: 'ready_for_review', action: 'execute' });
    expect(wrapper.findAll('[role="tab"]').some(tab => tab.text().includes('Jesse') && tab.text().includes('Review'))).toBe(true);
    const review = wrapper.getComponent({ name: 'CodeReviewPanel' });
    expect(review.props('agent').id).toBe(guest.id);
    await workspace.get('[aria-label="Clear goal"]').trigger('click');
    expect(actions.clearGoal).toHaveBeenCalledWith(guest.id);
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('opens files in the containing tabs using the guest repository and keeps the composer', async () => {
    const { wrapper, workspace, guest, previewAgentFile } = await attachedWorkspace();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await workspace.get('a[href="https://example.com"]').trigger('click');
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    await workspace.get('a[href="src/guest.ts"]').trigger('click');
    await flushPromises();
    expect(previewAgentFile).toHaveBeenCalledWith(guest.id, 'src/guest.ts');
    expect(wrapper.get('.source-preview-panel').text()).toContain('guest');
    expect(wrapper.findAll('.right-workspace-panel__tabs').filter(header => header.isVisible())).toHaveLength(1);
    expect(wrapper.findAllComponents(ConversationPane)).toHaveLength(2);
    expect(wrapper.emitted('select-agent')).toBeUndefined();
    await wrapper.get('[aria-label="Close Jesse tab"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.source-preview-panel').some(panel => panel.isVisible())).toBe(false);
    await wrapper.findAll('.agent-sidebar__agent')[1]!.trigger('click');
    expect(wrapper.emitted('select-agent')).toStrictEqual([[guest.id]]);
    open.mockRestore();
  });

  it('includes attached text annotations in its prompt and opens its image annotation dialog', async () => {
    const { pane, workspace, paneActions, guest, actions } = await attachedWorkspace();
    pane.vm.$emit('add-text-annotation', { selection: { text: 'Guest text', role: 'assistant', messageIndex: 0, messageId: 'guest-message' }, comment: 'Explain this' });
    await flushPromises();
    expect(workspace.text()).toContain('Annotation');
    await paneActions.submit?.('Please clarify');
    expect(actions.send).toHaveBeenCalledWith(guest.id, expect.stringContaining('Explain this'), undefined);
    expect(actions.send).toHaveBeenCalledWith(guest.id, expect.stringContaining('Please clarify'), undefined);
    pane.vm.$emit('annotate-attachment', { type: 'image', reference: 'guest-image', name: 'guest.png', previewUrl: 'data:image/png;base64,aGVsbG8=' });
    await flushPromises();
    expect(workspace.getComponent({ name: 'ImageAnnotationDialog' }).props('visible')).toBe(true);
    expect(workspace.getComponent({ name: 'ImageAnnotationDialog' }).props('fileName')).toBe('guest-annotated.png');
  });

  it('keeps an attached plan proposal and its acceptance on the guest', async () => {
    const { wrapper, view, guest, actions } = await attachedWorkspace();
    view.agent = { ...guest, planReview: { id: 'guest-plan', conversationId: null, turnId: 'turn', itemId: 'proposal', markdown: '# Guest plan\n\nOnly change the guest.', status: 'pending' } };
    await flushPromises();
    const plan = wrapper.getComponent({ name: 'PlanReviewPanel' });
    expect(plan.text()).toContain('Only change the guest.');
    plan.vm.$emit('confirmPlan');
    await flushPromises();
    expect(actions.planReview).toHaveBeenCalledWith(guest.id, 'accept', undefined);
    expect(actions.setPlanMode).toHaveBeenCalledWith(guest.id, false);
    expect(wrapper.findComponent({ name: 'PlanReviewPanel' }).exists()).toBe(false);
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('prepares the attached conversation again on provider changes without reloading on unrelated snapshots', async () => {
    const { view, actions, guest, snapshot } = await attachedWorkspace();
    expect(actions.prepare).toHaveBeenCalledTimes(1);
    view.agent = { ...guest, backend: 'claude', backendSession: undefined };
    await flushPromises();
    expect(actions.prepare).toHaveBeenCalledTimes(2);
    expect(actions.prepare).toHaveBeenLastCalledWith(guest.id);
    snapshot.agents = snapshot.agents.map(agent => ({ ...agent }));
    await flushPromises();
    expect(actions.prepare).toHaveBeenCalledTimes(2);
  });
});
