import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import type {
  CodexNativeAttachment,
  CodexNativeRendererApi,
} from '@codex-app-sdk/vue';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { claudeBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { CodexClawApi, RendererMessage } from '@codex-claw/core/contracts';
import { i18n } from '../../i18n';
import { setElectronTestClient } from '../../test/client';
import { useConfetti } from '../../shared/confetti/use-confetti';
import { setFirstRunOnboardingStage } from '../../onboarding-session';
import { codexConversationSnapshot, codexTextMessage } from '../../test/codex-conversation-fixtures';

import {
  conversationControllerActions,
  conversationControllerState,
  mountShell,
} from './app-shell-test-harness';

vi.mock('../image-annotation', async (importOriginal) => ({
  ...await importOriginal<typeof import('../image-annotation')>(),
  centeredImageCropDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,centered-fallback'),
}));

vi.mock('../../shared/confetti/canvas-celebration', () => ({
  launchCanvasCelebration: vi.fn(),
}));

afterEach(() => {
  useConfetti().clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.removeItem('cockpitGlobalScope:github');
  window.sessionStorage.clear();
  document.body.innerHTML = '';
  delete window.codexClaw;
  delete (window as Window & { codexAppSdkNative?: CodexNativeRendererApi }).codexAppSdkNative;
});

describe('AppShell authentication and conversation', () => {
  it('uses the provider-owned Codex conversation instead of a divergent Claw transcript', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backendSession = { kind: 'codex', threadId: 'thread-provider' };
    const staleClawMessage: RendererMessage = {
      id: 'stale-claw-message',
      agentId: agent.id,
      role: 'assistant',
      status: 'complete',
      turnId: 'turn-stale',
      parts: [{ type: 'text', text: 'Stale Claw transcript' }],
      createdAt: '2026-09-06T00:00:00.000Z',
    };
    snapshot.messages = [staleClawMessage];
    const providerMessages = [
      codexTextMessage('provider-user', 'user', 'Provider prompt', 'turn-provider'),
      codexTextMessage('provider-assistant', 'assistant', 'Provider response', 'turn-provider'),
    ];
    const providerSnapshot = codexConversationSnapshot(providerMessages, {
      activeConversationId: 'thread-provider',
      activeTurnId: 'turn-provider',
      turnIds: ['turn-provider'],
      turns: [{
        id: 'turn-provider', status: 'inProgress', error: null, willRetry: false,
        startedAt: '2026-09-06T00:00:00.000Z', completedAt: null, durationMs: null,
      }],
      busy: true,
      approvals: [{
        id: 'approval-provider',
        kind: 'command',
        conversationId: 'thread-provider',
        turnId: 'turn-provider',
        itemId: 'item-provider',
        command: 'npm test',
        cwd: '/tmp/project',
        title: 'Run tests',
      }],
    });

    const wrapper = mountShell({
      snapshot,
      codexConversationSnapshot: providerSnapshot,
    });
    const state = conversationControllerState(wrapper);

    expect(state.identity.messages).toStrictEqual(providerMessages);
    expect(state.identity.turns).toStrictEqual(providerSnapshot.turns);
    expect(state.identity.activeTurnId).toBe('turn-provider');
    expect(state.identity.busy).toBe(true);
    expect(state.thread?.approvals).toStrictEqual(providerSnapshot.approvals);
    expect(wrapper.getComponent({ name: 'ConversationPane' }).props('hasVisibleMessages')).toBe(true);
  });

  it('forwards an edited terminal Codex prompt with its authoritative turn id', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0]!;
    agent.backendSession = { kind: 'codex', threadId: 'thread-edit' };
    snapshot.messages = [
      {
        id: 'user-turn-edit',
        agentId: agent.id,
        role: 'user',
        status: 'complete',
        turnId: 'turn-edit',
        parts: [{ type: 'text', text: 'Original prompt' }],
        createdAt: '2026-09-06T00:00:00.000Z',
      },
      {
        id: 'assistant-turn-edit',
        agentId: agent.id,
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-edit',
        parts: [{ type: 'text', text: 'Original response' }],
        createdAt: '2026-09-06T00:00:01.000Z',
      },
    ];
    const providerMessages = [
      codexTextMessage('user-turn-edit', 'user', 'Original prompt', 'turn-edit'),
      codexTextMessage('assistant-turn-edit', 'assistant', 'Original response', 'turn-edit'),
    ];
    const wrapper = mountShell({
      snapshot,
      realConversationPane: true,
      codexConversationSnapshot: codexConversationSnapshot(providerMessages, {
        activeConversationId: 'thread-edit',
        turnIds: ['turn-edit'],
        turns: [{
          id: 'turn-edit', status: 'completed', error: null, willRetry: false,
          startedAt: '2026-09-06T00:00:00.000Z', completedAt: '2026-09-06T00:00:01.000Z', durationMs: 1_000,
        }],
      }),
    });

    await wrapper.get('button[aria-label="Edit"]').trigger('click');
    await wrapper.get('textarea[aria-label="Edit prompt"]').setValue('Edited prompt');
    await wrapper.get('.chat-message__edit-button--primary').trigger('click');

    expect(wrapper.emitted('edit-turn')).toStrictEqual([[
      { content: 'Edited prompt', turnId: 'turn-edit' },
    ]]);
  });

  it('shows passive connection progress while discovering existing ChatGPT credentials', async () => {
    let resolveAuthentication!: (value: {
      account: { type: 'apiKey' };
      requiresOpenaiAuth: false;
      login: { status: 'idle'; error: null };
    }) => void;
    window.codexClaw = {
      getCodexAuthentication: vi.fn().mockReturnValue(new Promise((resolve) => {
        resolveAuthentication = resolve;
      })),
    } as Partial<CodexClawApi> as CodexClawApi;

    const wrapper = mountShell();
    await nextTick();

    expect(wrapper.get('[aria-label="Connecting Codex Claw"]').text()).toContain('Connecting to ChatGPT…');
    expect(wrapper.find('[aria-label="Connecting Codex Claw"] button').exists()).toBe(false);

    resolveAuthentication({
      account: { type: 'apiKey' },
      requiresOpenaiAuth: false,
      login: { status: 'idle', error: null },
    });
    await flushPromises();

    expect(wrapper.find('.codex-login').exists()).toBe(false);
    expect(wrapper.find('.github-onboarding').exists()).toBe(false);
    wrapper.unmount();
  });

  it('offers skippable GitHub setup after the first ChatGPT sign-in', async () => {
    vi.useFakeTimers();
    const snapshot = createInitialSnapshot();
    const getCodexAuthentication = vi.fn()
      .mockResolvedValueOnce({
        account: null,
        requiresOpenaiAuth: true,
        login: { status: 'idle', error: null },
      })
      .mockResolvedValueOnce({
        account: { type: 'chatgpt' },
        requiresOpenaiAuth: true,
        login: { status: 'idle', error: null },
      });
    window.codexClaw = {
      getCodexAuthentication,
      startCodexChatGptLogin: vi.fn().mockResolvedValue(undefined),
    } as Partial<CodexClawApi> as CodexClawApi;

    const wrapper = mountShell({ snapshot });
    await flushPromises();
    await wrapper.get('.codex-login .el-button').trigger('click');
    await flushPromises();
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(wrapper.find('.codex-login').exists()).toBe(false);
    expect(wrapper.get('.github-onboarding').text()).toContain('Connect GitHub.');
    expect(wrapper.get('.app-shell').classes()).toContain('app-shell--auth-gated');

    await wrapper.setProps({
      snapshot: {
        ...snapshot,
        workBacklog: {
          ...snapshot.workBacklog,
          connections: [{
            provider: 'github',
            status: 'connected',
            accountLabel: 'nbonamy',
            connectedAt: '2026-09-01T12:00:00.000Z',
          }],
        },
      },
    });

    await nextTick();

    expect(wrapper.find('.github-onboarding').exists()).toBe(false);
    expect(wrapper.get('.onboarding-complete').text()).toContain("You're all set.");
    expect(useConfetti().bursts.value).toHaveLength(1);

    await wrapper.get('.onboarding-complete .el-button').trigger('click');

    expect(wrapper.find('.onboarding-complete').exists()).toBe(false);
    expect(wrapper.get('.app-shell').classes()).not.toContain('app-shell--auth-gated');
    wrapper.unmount();
  });

  it('shows the same celebrated completion after GitHub is skipped', async () => {
    setFirstRunOnboardingStage('github');
    window.codexClaw = {
      getCodexAuthentication: vi.fn().mockResolvedValue({
        account: { type: 'chatgpt' },
        requiresOpenaiAuth: true,
        login: { status: 'idle', error: null },
      }),
    } as Partial<CodexClawApi> as CodexClawApi;

    const wrapper = mountShell();
    await flushPromises();
    const buttons = wrapper.findAll('.github-onboarding .el-button');
    await buttons[1]!.trigger('click');

    expect(wrapper.find('.github-onboarding').exists()).toBe(false);
    expect(wrapper.get('.onboarding-complete').text()).toContain("You're all set.");
    expect(useConfetti().bursts.value).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps first-run GitHub setup pending across a renderer reload', async () => {
    window.codexClaw = {
      getCodexAuthentication: vi.fn().mockResolvedValue({
        account: null,
        requiresOpenaiAuth: true,
        login: { status: 'idle', error: null },
      }),
    } as Partial<CodexClawApi> as CodexClawApi;

    const signedOutShell = mountShell();
    await flushPromises();
    signedOutShell.unmount();

    window.codexClaw = {
      getCodexAuthentication: vi.fn().mockResolvedValue({
        account: { type: 'chatgpt' },
        requiresOpenaiAuth: true,
        login: { status: 'idle', error: null },
      }),
    } as Partial<CodexClawApi> as CodexClawApi;

    const reloadedShell = mountShell();
    await flushPromises();

    expect(reloadedShell.find('.codex-login').exists()).toBe(false);
    expect(reloadedShell.find('.github-onboarding').exists()).toBe(true);
    reloadedShell.unmount();
  });

  it('keeps the workspace visible while reporting automatic clawd reconnection', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0] ?? null,
        messages: [],
        isLoading: false,
        isSending: false,
        connectionState: { status: 'reconnecting', detail: 'socket closed' },
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    expect(wrapper.get('.app-shell__connection-status').text()).toContain('Agents keep working in the background.');
    expect(wrapper.get('.app-shell__connection-status').text()).toContain('socket closed');
    expect(wrapper.find('.app-shell__content').exists()).toBe(true);
  });

  it('gates the workspace and shortcuts when the isolated Codex home is signed out', async () => {
    window.codexClaw = {
      getCodexAuthentication: vi.fn().mockResolvedValue({
        account: null,
        requiresOpenaiAuth: true,
        login: { status: 'idle', error: null },
      }),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell();
    await flushPromises();

    expect(wrapper.get('.app-shell').classes()).toContain('app-shell--auth-gated');
    expect(wrapper.get('[aria-label="Sign in to Codex Claw"]').text()).toContain('Sign in to ChatGPT');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();

    wrapper.unmount();
  });

  it('cancels a pending ChatGPT sign-in from the landing screen', async () => {
    const cancelCodexChatGptLogin = vi.fn().mockResolvedValue({
      account: null,
      requiresOpenaiAuth: true,
      login: { status: 'cancelled', error: null },
    });
    window.codexClaw = {
      getCodexAuthentication: vi.fn().mockResolvedValue({
        account: null,
        requiresOpenaiAuth: true,
        login: { status: 'pending', error: null },
      }),
      cancelCodexChatGptLogin,
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell();
    await flushPromises();

    const cancel = wrapper.get('.codex-login__cancel');
    expect(cancel.classes()).not.toContain('codex-login__cancel--hidden');
    await cancel.trigger('click');
    await flushPromises();

    expect(cancelCodexChatGptLogin).toHaveBeenCalledOnce();
    expect(wrapper.find('.codex-login__cancel').exists()).toBe(false);
    expect(wrapper.text()).toContain('Sign in to start your first session.');

    wrapper.unmount();
  });

  it('composes the phase zero shell around the active agent', () => {
    const snapshot = createInitialSnapshot();
    const activeAgent = snapshot.agents[0];

    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: snapshot.messages,
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    expect(wrapper.getComponent({ name: 'AgentSidebar' }).props('teamName')).toBe('Codex Claw');
    expect(wrapper.text()).toContain('Sessions');
    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CC');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Ready to get going');
    expect(wrapper.text()).toContain('Chat with Dina');
    expect(wrapper.text()).not.toContain('Artifacts');
    expect(wrapper.findComponent({ name: 'ConversationPane' }).props('agents')).toStrictEqual(snapshot.agents);
  });

  it('retains structured plan progress after the turn stops', async () => {
    const snapshot = createInitialSnapshot();
    const activeAgent = snapshot.agents[0];
    const plan = {
      threadId: 'thread-plan',
      turnId: 'turn-plan',
      kind: 'execution' as const,
      status: 'inProgress' as const,
      explanation: 'Current execution plan',
      steps: [{ step: 'Implement the fix', status: 'inProgress' as const }],
      markdown: 'Current execution plan\n- [ ] Implement the fix',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    activeAgent.plan = plan;
    const messages: RendererMessage[] = [{
      id: 'assistant-plan',
      agentId: activeAgent.id,
      role: 'assistant',
      status: 'streaming',
      turnId: 'turn-plan',
      parts: [],
      createdAt: '2026-08-01T00:00:00.000Z',
    }];
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages,
        isLoading: false,
        isSending: true,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    expect(wrapper.findComponent({ name: 'ConversationPane' }).props('plan')).toStrictEqual(plan);
    expect(wrapper.findComponent({ name: 'ConversationPane' }).props()).not.toHaveProperty('turnGitDiff');

    await wrapper.setProps({ isSending: false } as Record<string, unknown>);

    expect(wrapper.findComponent({ name: 'ConversationPane' }).props('plan')).toStrictEqual(plan);
  });

  it('does not flash a persisted plan while conversation history hydrates', async () => {
    const snapshot = createInitialSnapshot();
    const activeAgent = snapshot.agents[0];
    if (!activeAgent) throw new Error('Expected seeded agent.');
    activeAgent.backendSession = { kind: 'codex', threadId: 'thread-persisted' };
    activeAgent.plan = {
      threadId: 'thread-persisted',
      turnId: 'turn-old-plan',
      kind: 'execution',
      status: 'completed',
      explanation: 'Old execution plan',
      steps: [{ step: 'Old completed work', status: 'completed' }],
      markdown: 'Old execution plan\n- [x] Old completed work',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: [],
        isLoading: false,
        isConversationLoading: true,
        isSending: false,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    expect(wrapper.findComponent({ name: 'ConversationPane' }).props('plan')).toBeNull();
    expect(wrapper.find('.conversation-plan').exists()).toBe(false);

    await wrapper.setProps({
      isConversationLoading: false,
      messages: [{
        id: 'assistant-newer-turn',
        agentId: activeAgent.id,
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-newer',
        parts: [{ type: 'text', text: 'Newer work completed.' }],
        createdAt: '2026-08-02T00:00:00.000Z',
      }],
    } as Record<string, unknown>);

    expect(wrapper.findComponent({ name: 'ConversationPane' }).props('plan')).toBeNull();
    expect(wrapper.find('.conversation-plan').exists()).toBe(false);
  });

  it('disables only an empty failed conversation and forwards retry', async () => {
    const retryAgentHistory = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      isConversationLoadFailed: true,
      retryAgentHistory,
    });

    expect(conversationControllerState(wrapper).identity.disabled).toBe(true);
    expect(wrapper.getComponent({ name: 'ConversationPane' }).props('historyLoadFailed')).toBe(true);

    wrapper.getComponent({ name: 'ConversationPane' }).vm.$emit('retry-history');
    await flushPromises();
    expect(retryAgentHistory).toHaveBeenCalledOnce();

    const snapshot = createInitialSnapshot();
    snapshot.messages.push({
      id: 'message-existing',
      agentId: snapshot.agents[0]!.id,
      role: 'assistant',
      status: 'complete',
      parts: [{ type: 'text', text: 'Keep me visible.' }],
      createdAt: '2026-09-05T00:00:00.000Z',
    });
    const withMessages = mountShell({
      snapshot,
      isConversationLoadFailed: true,
      codexConversationSnapshot: codexConversationSnapshot([
        codexTextMessage('message-existing', 'assistant', 'Keep me visible.'),
      ]),
    });
    expect(conversationControllerState(withMessages).identity.disabled).toBe(false);
    expect(withMessages.getComponent({ name: 'ConversationPane' }).props('hasVisibleMessages')).toBe(true);
  });

  it('forwards prompts from the composer', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    const editor = wrapper.get('[role="textbox"][contenteditable]');
    editor.element.textContent = 'hello';
    await editor.trigger('input');
    await nextTick();
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['hello']]);
  });

  it('owns the SDK conversation controller state and actions at the shell boundary', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    setElectronTestClient({
      browserOpenVisualization: vi.fn().mockResolvedValue({
        url: '', title: 'Backlog icon candidates', canGoBack: false, canGoForward: false,
      }),
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible: vi.fn().mockResolvedValue(undefined),
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    });
    const snapshot = createInitialSnapshot();
    const activeAgent = snapshot.agents[0];
    if (!activeAgent) throw new Error('Expected seeded agent.');
    activeAgent.backendSession = { kind: 'codex', threadId: 'thread-dina' };
    const providerSnapshot = codexConversationSnapshot([], {
      activeConversationId: 'thread-dina',
      plugins: [{
        id: 'app-69b31dc2110c8191b8b47dc98fe5a052',
        name: 'dropbox',
        displayName: 'Dropbox',
        enabled: true,
      }],
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: snapshot.messages,
        isLoading: false,
        isSending: false,
        codexConversationSnapshot: providerSnapshot,
        selectedModelId: 'gpt-5',
        selectedReasoningEffort: 'high',
        selectedServiceTier: 'fast',
        backendPlugins: [{
          id: 'app-69b31dc2110c8191b8b47dc98fe5a052',
          name: 'dropbox',
          displayName: 'Dropbox',
          enabled: true,
        }],
        composerState: { text: 'saved draft', selectionStart: 5, selectionEnd: 5 },
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    const state = conversationControllerState(wrapper);
    expect(state.identity).toMatchObject({
      conversationKey: 'codex:thread-dina',
      messages: snapshot.messages,
      busy: false,
      disabled: false,
      activeTurnId: null,
    });
    expect(state.composer).toMatchObject({
      selectedModelId: 'gpt-5',
      selectedReasoningEffort: 'high',
      selectedServiceTier: 'fast',
      state: { text: 'saved draft', selectionStart: 5, selectionEnd: 5 },
    });
    expect(state.catalogs?.plugins).toStrictEqual([{
      id: 'app-69b31dc2110c8191b8b47dc98fe5a052',
      name: 'dropbox',
      displayName: 'Dropbox',
      enabled: true,
    }]);
    expect(state.catalogs?.mentionGroups).toStrictEqual([{
      id: 'agents',
      label: 'Agents',
      placement: 'before',
      items: snapshot.teams[0]!.agentIds.map((agentId) => {
        const teamAgent = snapshot.agents.find((candidate) => candidate.id === agentId)!;
        const workspace = teamAgent.workspace;
        const repository = workspace?.kind === 'git' ? workspace.repositoryName : 'Quick chats';
        const branch = workspace?.kind === 'git' ? workspace.branch : null;
        return {
          id: teamAgent.id,
          value: `agent:${teamAgent.id}`,
          label: `${teamAgent.name} · ${branch ? `${repository}/${branch}` : repository}`,
          payload: { agentId: teamAgent.id },
        };
      }),
    }]);
    expect(state.policy?.canForkTurn).toBe(true);

    const updatedMessages = [codexTextMessage(
      'controller-reactive-message', 'assistant', 'Updated through the stable controller.', 'turn-controller',
    )];
    await wrapper.setProps({
      messages: [{
        id: 'stale-claw-row', agentId: activeAgent.id, role: 'assistant', status: 'complete',
        createdAt: '2026-08-04T00:00:00.000Z', parts: [{ type: 'text', text: 'Must not render.' }],
      }],
      isSending: true,
      codexConversationSnapshot: codexConversationSnapshot(updatedMessages, {
        activeConversationId: 'thread-dina',
        activeTurnId: 'turn-controller',
        turnIds: ['turn-controller'],
        turns: [{
          id: 'turn-controller', status: 'inProgress', error: null, willRetry: false,
          startedAt: '2026-08-04T00:00:00.000Z', completedAt: null, durationMs: null,
        }],
        busy: true,
      }),
    } as Record<string, unknown>);
    expect(conversationControllerState(wrapper).identity.messages).toStrictEqual(updatedMessages);
    expect(conversationControllerState(wrapper).identity.activeTurnId).toBe('turn-controller');
    expect(wrapper.text()).toContain('Updated through the stable controller.');

    const actions = conversationControllerActions(wrapper);
    await actions.forkTurn?.('turn-3');
    expect(wrapper.emitted('fork-turn')).toStrictEqual([['turn-3']]);
    await actions.updateQueuedPrompt?.('queued-1', 'Edited queued prompt');
    await actions.steerQueuedPrompt?.('queued-1', 'Edited steer');
    expect(wrapper.emitted('update-queued-prompt')).toStrictEqual([['queued-1', 'Edited queued prompt']]);
    expect(wrapper.emitted('steer-queued-prompt')).toStrictEqual([['queued-1', 'Edited steer']]);
    const openExternal = vi.spyOn(window, 'open').mockImplementation(() => null);
    await actions.updateComposerState?.({ text: 'updated', selectionStart: 7, selectionEnd: 7 });
    await actions.updateAttachments?.([{
      id: 'attachment-1',
      type: 'file',
      reference: 'electron-attachment:context',
      name: 'context.txt',
      mimeType: 'text/plain',
      size: 12,
    }]);
    await actions.updateSettings?.({ modelId: 'gpt-5.1', serviceTier: null });
    await actions.submit?.('review context', {
      attachments: [{ type: 'file', reference: 'electron-attachment:context' }],
      model: 'sdk-selection-does-not-cross-host-boundary',
    });
    await actions.openLink?.({ kind: 'external', href: 'https://example.com/docs' });
    const conversationImage = {
      alt: 'Architecture diagram',
      kind: 'attachment',
      mimeType: 'image/png',
      name: 'diagram.png',
      path: '/repo/diagram.png',
      src: 'data:image/png;base64,aW1hZ2U=',
    } as const;
    const fullscreenHandled = await actions.openImage?.(conversationImage, {
      intent: 'fullscreen',
      index: 2,
      message: { id: 'message-with-image', role: 'assistant', content: '' },
    });
    const imageWorkspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });
    expect(fullscreenHandled).toBe(false);
    expect((imageWorkspace.props('tabs') as string[]).some((tab) => tab.startsWith('image:'))).toBe(false);

    const imageHandled = await actions.openImage?.(conversationImage, {
      intent: 'open',
      index: 2,
      message: { id: 'message-with-image', role: 'assistant', content: '' },
    });

    expect(wrapper.emitted('update:composerState')).toStrictEqual([[{
      agentId: activeAgent.id,
      state: { text: 'updated', selectionStart: 7, selectionEnd: 7 },
    }]]);
    expect(wrapper.emitted('update:composerAttachments')).toStrictEqual([[{
      agentId: activeAgent.id,
      attachments: [expect.objectContaining({ reference: 'electron-attachment:context' })],
    }]]);
    expect(wrapper.emitted('select-model')).toStrictEqual([['gpt-5.1']]);
    expect(wrapper.emitted('select-service-tier')).toStrictEqual([[null]]);
    expect(wrapper.emitted('sendPrompt')).toStrictEqual([[
      'review context',
      { attachments: [{ type: 'file', reference: 'electron-attachment:context' }] },
    ]]);
    expect(openExternal).toHaveBeenCalledWith(
      'https://example.com/docs',
      '_blank',
      'noopener,noreferrer',
    );
    expect(imageHandled).toBe(true);
    const imageTab = (imageWorkspace.props('tabs') as string[]).find((tab) => tab.startsWith('image:'));
    expect(imageTab).toBeDefined();
    expect(imageWorkspace.props('activeTab')).toBe(imageTab);
    expect((imageWorkspace.props('imagePanels') as Record<string, unknown>)[imageTab!]).toStrictEqual({
      kind: 'image',
      title: 'diagram.png',
      subtitle: '/repo/diagram.png',
      path: '/repo/diagram.png',
      mimeType: 'image/png',
      alt: 'Architecture diagram',
      src: 'data:image/png;base64,aW1hZ2U=',
      state: 'idle',
      error: null,
    });
    await actions.openImage?.(conversationImage, {
      intent: 'open',
      index: 2,
      message: { id: 'message-with-image', role: 'assistant', content: '' },
    });
    expect((imageWorkspace.props('tabs') as string[]).filter((tab) => tab === imageTab)).toHaveLength(1);

    imageWorkspace.vm.$emit('closeTab', imageTab);
    await nextTick();
    expect(imageWorkspace.props('tabs')).not.toContain(imageTab);
    expect(imageWorkspace.props('imagePanels')).toStrictEqual({});

    await actions.openVisualization?.({
      path: '/tmp/backlog-icon-candidates.html',
      title: 'Backlog icon candidates',
    });
    await nextTick();
    expect(imageWorkspace.props('tabs')).toContain('browser');
    expect(imageWorkspace.props('activeTab')).toBe('browser');
    expect(imageWorkspace.props('browserInitialUrl')).toBe('');
    expect(imageWorkspace.props('browserVisualization')).toStrictEqual({
      path: '/tmp/backlog-icon-candidates.html',
      title: 'Backlog icon candidates',
    });
  });

  it('exposes Claude permission modes as a distinct composer submenu', async () => {
    const snapshot = createInitialSnapshot();
    const activeAgent = snapshot.agents[0];
    if (!activeAgent) throw new Error('Expected seeded agent.');
    activeAgent.backend = 'claude';
    activeAgent.backendSession = undefined;
    activeAgent.backendDefaults = { kind: 'claude', permissionMode: 'acceptEdits' };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: [],
        isLoading: false,
        isSending: false,
        backendCapabilities: claudeBackendCapabilities,
        permissionMode: 'acceptEdits',
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    expect(conversationControllerState(wrapper).capabilities?.approvalPresets).toStrictEqual([]);
    expect(conversationControllerState(wrapper).composer?.leadingMenuItems).toEqual([
      expect.objectContaining({
        id: 'backend-permissions',
        type: 'submenu',
        label: 'Permissions',
        items: [
          expect.objectContaining({ id: 'permission-mode:default', label: 'Default', checked: false }),
          expect.objectContaining({ id: 'permission-mode:acceptEdits', label: 'Accept edits', checked: true }),
          expect.objectContaining({ id: 'permission-mode:dontAsk', label: "Don't ask", checked: false }),
          expect.objectContaining({ id: 'permission-mode:auto', label: 'Auto (experimental)', checked: false }),
          expect.objectContaining({
            id: 'permission-mode:bypassPermissions',
            label: 'Dangerously skip permissions',
            checked: false,
          }),
        ],
      }),
    ]);

    await conversationControllerActions(wrapper).menuSelect?.({
      id: 'permission-mode:bypassPermissions',
      type: 'radio',
      label: 'Dangerously skip permissions',
      checked: false,
      payload: { kind: 'permission-mode', mode: 'bypassPermissions' },
    });
    expect(wrapper.emitted('select-permission-mode')).toStrictEqual([['bypassPermissions']]);
  });

  it('saves, reopens, and submits annotations for multiple composer images', async () => {
    const firstImage: CodexNativeAttachment = {
      id: 'first-image',
      type: 'image',
      reference: 'electron-attachment:first',
      name: 'first.png',
      mimeType: 'image/png',
      size: 128,
      previewUrl: 'data:image/png;base64,Zmlyc3Q=',
    };
    const secondImage: CodexNativeAttachment = {
      ...firstImage,
      id: 'second-image',
      reference: 'electron-attachment:second',
      name: 'second.png',
      previewUrl: 'data:image/png;base64,c2Vjb25k',
    };
    const contextFile: CodexNativeAttachment = {
      id: 'context-file',
      type: 'file',
      reference: 'electron-attachment:context',
      name: 'context.md',
      mimeType: 'text/markdown',
      size: 64,
    };
    const unannotatedImage: CodexNativeAttachment = {
      ...firstImage,
      id: 'unannotated-image',
      reference: 'electron-attachment:unannotated',
      name: 'reference.png',
    };
    const firstAnnotatedAttachment: CodexNativeAttachment = {
      id: 'first-annotated',
      type: 'image',
      reference: 'electron-attachment:first-annotated',
      name: 'first-annotated.png',
      mimeType: 'image/png',
      size: 256,
    };
    const secondAnnotatedAttachment: CodexNativeAttachment = {
      ...firstAnnotatedAttachment,
      id: 'second-annotated',
      reference: 'electron-attachment:second-annotated',
      name: 'second-annotated.png',
    };
    const ingestAttachments = vi.fn().mockResolvedValue([firstAnnotatedAttachment, secondAnnotatedAttachment]);
    (window as Window & { codexAppSdkNative?: Partial<CodexNativeRendererApi> }).codexAppSdkNative = {
      capabilities: {
        attachments: true,
        clipboard: true,
        externalLinks: true,
        transcription: false,
      },
      ingestAttachments,
    };
    const wrapper = mountShell({
      composerAttachments: [firstImage, secondImage, unannotatedImage, contextFile],
      realConversationPane: true,
    });

    await wrapper.get('[aria-label="Annotate first.png"]').trigger('click');
    const dialog = wrapper.getComponent({ name: 'ImageAnnotationDialog' });
    expect(dialog.props('visible')).toBe(true);
    expect(dialog.props('imageSrc')).toBe(firstImage.previewUrl);
    expect(dialog.props('fileName')).toBe('first-annotated.png');

    const firstAnnotations = [
      {
        id: 'annotation-1',
        number: 1,
        tool: 'arrow' as const,
        start: { x: 1, y: 2 },
        end: { x: 3, y: 4 },
        comment: 'Move the button.',
      },
      {
        id: 'annotation-2',
        number: 2,
        tool: 'rectangle' as const,
        start: { x: 5, y: 6 },
        end: { x: 7, y: 8 },
        comment: 'Increase this margin.',
      },
    ];
    dialog.vm.$emit('save', {
      annotations: firstAnnotations,
      dataUrl: 'data:image/png;base64,Zmlyc3QtYW5ub3RhdGVk',
      fileName: 'first-annotated.png',
      height: 80,
      pixelRatio: 1,
      width: 120,
    });
    await nextTick();

    expect(ingestAttachments).not.toHaveBeenCalled();
    expect(wrapper.emitted('sendPrompt')).toBeUndefined();
    expect(wrapper.getComponent({ name: 'ConversationPane' }).props('attachmentAnnotationCounts')).toStrictEqual({
      [firstImage.reference]: 2,
    });
    await wrapper.get('[aria-label="Edit annotations for first.png (2)"]').trigger('click');
    expect(dialog.props('initialAnnotations')).toStrictEqual(firstAnnotations);
    dialog.vm.$emit('close');
    await nextTick();

    await wrapper.get('[aria-label="Annotate second.png"]').trigger('click');
    dialog.vm.$emit('save', {
      annotations: [
        {
          id: 'annotation-second',
          number: 1,
          tool: 'oval',
          start: { x: 9, y: 10 },
          end: { x: 11, y: 12 },
          comment: 'Rename this section.',
        },
      ],
      dataUrl: 'data:image/png;base64,c2Vjb25kLWFubm90YXRlZA==',
      fileName: 'second-annotated.png',
      height: 80,
      pixelRatio: 2,
      width: 120,
    });
    await nextTick();

    await conversationControllerActions(wrapper).submit?.('Please update these screens.', {
      attachments: [
        { type: 'image', reference: firstImage.reference },
        { type: 'image', reference: secondImage.reference },
        { type: 'image', reference: unannotatedImage.reference },
        { type: 'file', reference: contextFile.reference },
      ],
    });
    await flushPromises();

    expect(ingestAttachments).toHaveBeenCalledOnce();
    expect(ingestAttachments.mock.calls[0]?.[0]).toStrictEqual([
      { name: 'first-annotated.png', mimeType: 'image/png', data: expect.any(ArrayBuffer) },
      { name: 'second-annotated.png', mimeType: 'image/png', data: expect.any(ArrayBuffer) },
    ]);
    expect(wrapper.emitted('sendPrompt')).toStrictEqual([[
      [
        'Please update these screens.',
        '',
        'Image annotations:',
        '',
        'Image 1 — first.png',
        '1. Move the button.',
        '2. Increase this margin.',
        '',
        'Image 2 — second.png',
        '1. Rename this section.',
      ].join('\n'),
      {
        attachments: [
          { type: 'image', reference: firstAnnotatedAttachment.reference },
          { type: 'image', reference: secondAnnotatedAttachment.reference },
          { type: 'image', reference: unannotatedImage.reference },
          { type: 'file', reference: contextFile.reference },
        ],
      },
    ]]);
    expect(dialog.props('visible')).toBe(false);

    await conversationControllerActions(wrapper).updateAttachments?.([]);
    expect(wrapper.getComponent({ name: 'ConversationPane' }).props('attachmentAnnotationCounts')).toStrictEqual({});
  });

  it('hides the native browser while the image annotation dialog is open', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const browserSetVisible = vi.fn().mockResolvedValue(undefined);
    setElectronTestClient({
      browserOpen: vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false }),
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible,
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    });
    const wrapper = mountShell({
      composerAttachments: [{
        id: 'image-to-annotate',
        type: 'image',
        reference: 'electron-attachment:image-to-annotate',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 128,
        previewUrl: 'data:image/png;base64,c2NyZWVu',
      }],
      realConversationPane: true,
    });

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button')
      .find((button) => button.text().includes('Browser'))
      ?.trigger('click');
    await flushPromises();

    const workspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });
    expect(workspace.props('visible')).toBe(true);
    browserSetVisible.mockClear();

    await wrapper.get('[aria-label="Annotate screen.png"]').trigger('click');
    await flushPromises();

    const dialog = wrapper.getComponent({ name: 'ImageAnnotationDialog' });
    expect(dialog.props('visible')).toBe(true);
    expect(workspace.props('visible')).toBe(false);
    expect(browserSetVisible).toHaveBeenCalledWith('agent-dina', 'primary', false);

    dialog.vm.$emit('close');
    await flushPromises();

    expect(workspace.props('visible')).toBe(true);
    expect(browserSetVisible).toHaveBeenLastCalledWith('agent-dina', 'primary', true);
  });
});
