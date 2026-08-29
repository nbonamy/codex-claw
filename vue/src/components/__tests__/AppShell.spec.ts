import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import type {
  CodexConversationPaneActions,
  CodexConversationPaneController,
  CodexConversationPaneState,
  CodexNativeAttachment,
  CodexNativeRendererApi,
} from '@codex-app-sdk/vue';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/core/snapshot';
import { claudeBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { Agent, AgentFilePreviewResult, AgentFileSearchItem, AppCommand, AppSnapshot, BackendConversationRef, BenchLocation, BenchTemplate, CodexClawApi, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateTeamInput, DeployBenchTemplateInput, LoopLocation, RendererMessage, SidePanelRequest, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, Team, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { workItemAssignmentPrompt, workItemComposerPrompt } from '@codex-claw/core/work-item-prompts';
import { i18n } from '../../i18n';
import { setElectronTestClient } from '../../test/client';

vi.mock('../image-annotation', async (importOriginal) => ({
  ...await importOriginal<typeof import('../image-annotation')>(),
  centeredImageCropDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,centered-fallback'),
}));

function pointerEvent(type: string, clientX: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event as PointerEvent;
}

async function clickPortaledMenuItem(label: string): Promise<void> {
  const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(item).toBeDefined();
  item!.click();
  await nextTick();
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem('cockpitGlobalScope:github');
  document.body.innerHTML = '';
  delete window.codexClaw;
  delete (window as Window & { codexAppSdkNative?: CodexNativeRendererApi }).codexAppSdkNative;
});

describe('AppShell', () => {
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
    expect(wrapper.get('[aria-label="Sign in to Codex Claw"]').text()).toContain('Continue with ChatGPT');
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
    expect(wrapper.get('.codex-login__cancel').classes()).toContain('codex-login__cancel--hidden');

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
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: snapshot.messages,
        isLoading: false,
        isSending: false,
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
        return {
          id: teamAgent.id,
          value: `agent:${teamAgent.id}`,
          label: teamAgent.name,
          payload: { agentId: teamAgent.id },
        };
      }),
    }]);
    expect(state.policy?.canForkMessage).toBe(true);

    const updatedMessages: RendererMessage[] = [{
      id: 'controller-reactive-message',
      agentId: activeAgent.id,
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-08-04T00:00:00.000Z',
      parts: [{ type: 'text', text: 'Updated through the stable controller.' }],
    }];
    await wrapper.setProps({ messages: updatedMessages } as Record<string, unknown>);
    expect(conversationControllerState(wrapper).identity.messages).toStrictEqual(updatedMessages);
    expect(wrapper.text()).toContain('Updated through the stable controller.');

    const actions = conversationControllerActions(wrapper);
    await actions.forkMessage?.(3);
    expect(wrapper.emitted('fork-message')).toStrictEqual([[3]]);
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
    const imageHandled = await actions.openImage?.({
      alt: 'Architecture diagram',
      kind: 'attachment',
      mimeType: 'image/png',
      name: 'diagram.png',
      path: '/repo/diagram.png',
      src: 'data:image/png;base64,aW1hZ2U=',
    }, {
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
    const imageWorkspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });
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

  it('opens the empty workspace launcher before preserving a selected Browser tab', async () => {
    const snapshot = createInitialSnapshot();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const browserOpen = vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false });
    const browserSetVisible = vi.fn().mockResolvedValue(undefined);
    setElectronTestClient({
      browserOpen,
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible,
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: snapshot.messages,
        isLoading: false,
        isSending: false,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Chat with Dina');
    expect(wrapper.find('.app-shell__right-workspace').exists()).toBe(true);
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Review');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Browser');
    expect(browserOpen).not.toHaveBeenCalled();

    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.text().includes('Browser'))?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="tab"]').text()).toBe('Browser');

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await flushPromises();

    expect(browserSetVisible).toHaveBeenCalledWith('agent-dina', 'primary', false);
    expect(browserOpen).toHaveBeenCalledTimes(1);

    await wrapper.get('[aria-label="Close Browser tab"]').trigger('click');
    await nextTick();

    expect(wrapper.find('.app-shell__right-workspace').isVisible()).toBe(false);
  });

  it('opens Files as a right-side explorer pane and keeps it open beside previews', async () => {
    const previewAgentFile = vi.fn().mockImplementation(async (_agentId: string, path: string) => ({
      path, size: 8, kind: 'text' as const, content: path === 'README.md' ? '# Claw\n' : 'export {};\n',
    }));
    const wrapper = mountShell({
      agentFiles: [
        { name: 'README.md', path: 'README.md' },
        { name: 'main.ts', path: 'main.ts' },
      ],
      previewAgentFile,
    });

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button')
      .find((button) => button.text().includes('Files'))
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="tab"]').text()).toBe('Open file');
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(true);
    await wrapper.get('button[title="Preview README.md"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['README.md']);
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(true);
    await wrapper.get('button[title="Preview main.ts"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['README.md', 'main.ts']);
    await wrapper.get('[aria-label="Collapse file explorer"]').trigger('click');
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(false);
  });

  it('opens each selected header subagent in an independent right-workspace tab', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-root' };
    snapshot.subagentTrees[snapshot.agents[0].id] = {
      rootConversationId: 'thread-root',
      nodes: {
        'thread-scout': {
          conversationId: 'thread-scout',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-05T00:00:00.000Z',
          status: 'running',
          agentPath: '/root/scout',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
        'thread-reviewer': {
          conversationId: 'thread-reviewer',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-05T00:00:01.000Z',
          status: 'completed',
          agentPath: '/root/reviewer',
          updatedAt: '2026-06-05T00:00:01.000Z',
        },
      },
      operations: {},
      activities: {},
    };
    const readConversationMessages = vi.fn().mockResolvedValue([]);
    const wrapper = mountShell({ snapshot, readConversationMessages });

    await wrapper.get('[aria-label="Subagents (1 active)"]').trigger('click');
    await wrapper.findAll('.subagent-control__row')[0]?.trigger('click');
    await wrapper.get('[aria-label="Subagents (1 active)"]').trigger('click');
    await wrapper.findAll('.subagent-control__row')[1]?.trigger('click');
    await flushPromises();

    expect(wrapper.getComponent({ name: 'RightWorkspacePanel' }).props('tabs')).toStrictEqual([
      'subagent:thread-scout',
      'subagent:thread-reviewer',
    ]);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['scout', 'reviewer']);
    expect(readConversationMessages).toHaveBeenCalledWith(
      { backend: 'codex', threadId: 'thread-scout' },
      snapshot.agents[0].id,
    );
    expect(readConversationMessages).toHaveBeenCalledWith(
      { backend: 'codex', threadId: 'thread-reviewer' },
      snapshot.agents[0].id,
    );
  });

  it('keeps each agent workspace and browser mounted while switching agents', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const snapshot = createInitialSnapshot();
    const browserOpen = vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false });
    const browserClose = vi.fn().mockResolvedValue(undefined);
    const browserSetVisible = vi.fn().mockResolvedValue(undefined);
    window.codexClaw = {
      browserOpen,
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible,
      browserClose,
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.text().includes('Browser'))?.trigger('click');
    await flushPromises();
    expect(browserOpen).toHaveBeenCalledWith('agent-dina', 'primary', '');

    await wrapper.setProps({ activeAgent: snapshot.agents.find((agent) => agent.id === 'agent-jesse') } as Record<string, unknown>);
    await flushPromises();

    expect(browserClose).not.toHaveBeenCalled();
    expect(wrapper.findAllComponents({ name: 'BrowserPanel' })).toHaveLength(1);
    await wrapper.get('[aria-label="Toggle right workspace"]').trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.isVisible() && button.text().includes('Browser'))?.trigger('click');
    await flushPromises();

    expect(browserOpen).toHaveBeenCalledWith('agent-jesse', 'primary', '');
    expect(wrapper.findAllComponents({ name: 'BrowserPanel' })).toHaveLength(2);
    await wrapper.setProps({ activeAgent: snapshot.agents.find((agent) => agent.id === 'agent-dina') } as Record<string, unknown>);
    await flushPromises();

    const workspaces = wrapper.findAllComponents({ name: 'RightWorkspacePanel' });
    expect(workspaces.find((panel) => panel.props('agent').id === 'agent-dina')?.props('tabs')).toStrictEqual(['browser']);
    expect(workspaces.find((panel) => panel.props('agent').id === 'agent-jesse')?.props('tabs')).toStrictEqual(['browser']);
    expect(browserClose).not.toHaveBeenCalled();
    expect(browserSetVisible).toHaveBeenCalledWith('agent-dina', 'primary', true);
  });

  it('opens a background agent browser without changing the selected agent', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    let listener: (command: AppCommand) => void = () => undefined;
    const browserOpen = vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', canGoBack: false, canGoForward: false });
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      browserOpen,
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible: vi.fn().mockResolvedValue(undefined),
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell();

    listener({ type: 'open-browser', agentId: 'agent-jesse', browserId: 'primary', url: 'https://example.com' });
    await flushPromises();

    expect(browserOpen).toHaveBeenCalledWith('agent-jesse', 'primary', 'https://example.com');
    expect(wrapper.emitted('select-agent')).toBeUndefined();
    expect(wrapper.text()).toContain('Chat with Dina');
  });

  it('opens the active agent git diff from header diff stats', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agentGitStatuses['agent-dina'] = {
      folder: '/Users/nbonamy/src/id8',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 1,
      addedLines: 45,
      removedLines: 23,
      hasUntracked: false,
      state: 'dirty',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    const openAgentGitDiff = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        openAgentGitDiff,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('[aria-label="Open repository diff"]').trigger('click');

    expect(openAgentGitDiff).toHaveBeenCalledWith('agent-dina');
    expect(wrapper.get('[aria-label="Right workspace"]').text()).toContain('Review');
    expect(wrapper.get('.git-diff-preview-panel').attributes('aria-busy')).toBe('true');

    const setShellProps = wrapper.setProps.bind(wrapper) as unknown as (props: {
      sidePanelRequest: SidePanelRequest;
    }) => Promise<void>;
    await setShellProps({
      sidePanelRequest: {
        kind: 'gitDiff',
        scope: 'workingTree',
        title: 'Git Diff',
        subtitle: '/Users/nbonamy/src/id8',
        diff: [
          'diff --git a/src/main.ts b/src/main.ts',
          '--- a/src/main.ts',
          '+++ b/src/main.ts',
          '@@ -1 +1 @@',
          '-const oldValue = 1;',
          '+const newValue = 2;',
        ].join('\n'),
      },
    });
    await nextTick();

    expect(wrapper.text()).toContain('src/main.ts');
    expect(wrapper.text()).toContain('newValue');
  });

  it('opens the linked repository backlog and starts isolated work for the current agent', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agentGitStatuses['agent-dina'] = {
      folder: '/Users/nbonamy/src/codex-claw',
      repository: 'codex-claw',
      githubRepository: 'nbonamy/codex-claw',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 0,
      addedLines: 0,
      removedLines: 0,
      hasUntracked: false,
      state: 'clean',
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    const item = workItem();
    const loadWorkItems = vi.fn().mockResolvedValue([item]);
    const createdItem = workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Created issue' });
    const createWorkItem = vi.fn().mockResolvedValue(createdItem);
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, loadWorkItems, createWorkItem, createAgentGitBranch, assignWorkItemAction });

    await wrapper.get('[aria-label="Open repository backlog"]').trigger('click');
    await flushPromises();

    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw', undefined, { kind: 'all', state: 'all' });
    expect(wrapper.get('[role="tab"]').text()).toBe('Backlog');
    const backlog = wrapper.getComponent({ name: 'RepositoryBacklogPanel' });
    expect(backlog.props('items')).toStrictEqual([item]);

    await backlog.props('createIssueAction')('Create a keyboard navigation issue.');
    await nextTick();
    expect(createWorkItem).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      description: 'Create a keyboard navigation issue.',
    });
    expect(backlog.props('items')).toStrictEqual([createdItem, item]);

    await backlog.props('startWorkAction')({
      action: 'fix',
      item,
      target: 'current',
      workspace: { branchName: 'fix/12-backlog', kind: 'worktree' },
    });

    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-dina', {
      name: 'fix/12-backlog',
      createWorktree: true,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'fix' }),
    });

    backlog.props('prefillAction')(item);
    await nextTick();
    expect(wrapper.emitted('update:composerState')).toContainEqual([{
      agentId: 'agent-dina',
      state: {
        text: workItemComposerPrompt(item),
        selectionStart: workItemComposerPrompt(item).length,
        selectionEnd: workItemComposerPrompt(item).length,
      },
    }]);

    createAgentGitBranch.mockClear();
    assignWorkItemAction.mockClear();
    await backlog.props('startWorkAction')({
      action: 'investigate',
      item,
      target: 'current',
      workspace: { kind: 'current' },
    });
    expect(createAgentGitBranch).not.toHaveBeenCalled();
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'investigate' }),
    });
  });

  it('duplicates an agent into a pull-request review worktree before assigning it', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem({ branchName: 'feature/pull-request-42', kind: 'pullRequest', number: 42, id: 'nbonamy/codex-claw#42' });
    const duplicate = { ...snapshot.agents[0]!, id: 'agent-reviewer', name: 'Dina copy' };
    const duplicateAgentAction = vi.fn().mockResolvedValue(duplicate);
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, duplicateAgentAction, createAgentGitBranch, assignWorkItemAction });
    const workspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });

    await workspace.props('startRepositoryWork')({
      action: 'review',
      item,
      target: 'duplicate',
      workspace: { branchName: 'feature/pull-request-42', kind: 'worktree' },
    });

    expect(duplicateAgentAction).toHaveBeenCalledWith('agent-dina', {
      name: 'Dina gh-42',
      select: false,
    });
    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-reviewer', {
      name: 'feature/pull-request-42',
      createWorktree: true,
      pullRequestNumber: 42,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-reviewer',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'review' }),
    });
  });

  it('names a duplicated issue agent after its source and work item', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.name = 'codex-claw';
    const item = workItem({ id: 'nbonamy/codex-claw#24', number: 24 });
    const duplicate = { ...snapshot.agents[0]!, id: 'agent-gh-24', name: 'codex-claw gh-24' };
    const duplicateAgentAction = vi.fn().mockResolvedValue(duplicate);
    const wrapper = mountShell({
      snapshot,
      duplicateAgentAction,
      createAgentGitBranch: vi.fn().mockResolvedValue({}),
      assignWorkItemAction: vi.fn().mockResolvedValue(undefined),
    });

    await wrapper.getComponent({ name: 'RightWorkspacePanel' }).props('startRepositoryWork')({
      action: 'fix',
      item,
      target: 'duplicate',
      workspace: { branchName: 'fix/gh-24', kind: 'worktree' },
    });

    expect(duplicateAgentAction).toHaveBeenCalledWith('agent-dina', {
      name: 'codex-claw gh-24',
      select: false,
    });
  });

  it('checks out a pull request branch in the current agent workspace before dispatching work', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem({ branchName: 'feature/pull-request-43', kind: 'pullRequest', number: 43, id: 'nbonamy/codex-claw#43' });
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, createAgentGitBranch, assignWorkItemAction });
    const workspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });

    await workspace.props('startRepositoryWork')({
      action: 'addressFeedback',
      item,
      target: 'current',
      workspace: { kind: 'current' },
    });

    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-dina', {
      name: 'feature/pull-request-43',
      createWorktree: false,
      pullRequestNumber: 43,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      item,
      prompt: workItemAssignmentPrompt(item, { action: 'addressFeedback' }),
    });
  });

  it('resolves missing pull request branch metadata when work starts', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem({ kind: 'pullRequest', number: 44, id: 'nbonamy/codex-claw#44' });
    const refreshedItem = { ...item, branchName: 'feature/resolved-pr-44' };
    const loadWorkItems = vi.fn().mockResolvedValue([refreshedItem]);
    const createAgentGitBranch = vi.fn().mockResolvedValue({});
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, loadWorkItems, createAgentGitBranch, assignWorkItemAction });
    const workspace = wrapper.getComponent({ name: 'RightWorkspacePanel' });

    await workspace.props('startRepositoryWork')({
      action: 'review',
      item,
      target: 'current',
      workspace: { kind: 'current' },
    });

    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw', undefined, {
      kind: 'pullRequest',
      state: 'all',
    });
    expect(createAgentGitBranch).toHaveBeenCalledWith('agent-dina', {
      name: 'feature/resolved-pr-44',
      createWorktree: false,
      pullRequestNumber: 44,
      confirmed: true,
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith(expect.objectContaining({ item: refreshedItem }));
  });

  it('does not auto-open repository review for a turn-scoped diff event', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        sidePanelRequest: {
          kind: 'gitDiff',
          scope: 'turn',
          title: 'Git Diff',
          subtitle: 'Current turn',
          diff: 'diff --git a/src/main.ts b/src/main.ts\n',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    expect(wrapper.get('[aria-label="Right workspace"]').isVisible()).toBe(false);
  });

  it('opens markdown links in additive right-workspace tabs through the agent file bridge', async () => {
    const snapshot = createInitialSnapshot();
    let resolveReadAgentFile: (result: { content: string; path: string }) => void = () => undefined;
    const previewAgentFile = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveReadAgentFile = resolve;
    }));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [architecture](docs/architecture.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="docs/architecture.md"]').trigger('click');

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'docs/architecture.md');
    expect(wrapper.text()).toContain('Loading markdown...');

    resolveReadAgentFile({
      path: 'docs/architecture.md',
      content: '# Architecture\n\nThis is the side panel.',
    });
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('architecture.md');
    expect(wrapper.text()).toContain('This is the side panel.');

    await wrapper.get('[aria-label="Close architecture.md tab"]').trigger('click');
    expect(wrapper.find('.markdown-panel').exists()).toBe(false);
  });

  it('opens source file links as read-only source previews', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/workspace/dina';
    const previewAgentFile = vi.fn()
      .mockResolvedValueOnce({
        path: 'src/main.ts',
        content: 'const answer: number = 42;\n',
      })
      .mockResolvedValueOnce({
        path: 'src/main.ts',
        content: 'const answer: number = 43;\n',
      });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-source-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [main](src/main.ts).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.findAll('.right-workspace-panel__launcher button').find((button) => button.text().includes('Review'))?.trigger('click');
    await flushPromises();
    await wrapper.get('a[href="src/main.ts"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'src/main.ts');
    expect(wrapper.find('.source-preview-panel').exists()).toBe(true);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'main.ts']);
    expect(wrapper.html()).toContain('shiki');
    expect(wrapper.text()).toContain('answer');

    await wrapper.setProps({
      fileActivity: {
        agentId: 'agent-dina', turnId: 'turn-edit', messageId: 'message-edit', itemId: 'item-edit',
        path: '/workspace/dina/src/main.ts', action: 'edit', status: 'completed',
        occurredAt: '2026-08-02T00:00:00.000Z',
      },
    } as Record<string, unknown>);
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'main.ts']);
    expect(wrapper.text()).toContain('43');
  });

  it('opens edit links in a turn-scoped diff tab', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/workspace/dina';
    snapshot.turnGitDiffs['turn-edit'] = {
      turnId: 'turn-edit',
      addedLines: 1,
      removedLines: 0,
      diff: [
        'diff --git a/src/main.ts b/src/main.ts',
        '--- a/src/main.ts',
        '+++ b/src/main.ts',
        '@@ -1,1 +1,2 @@',
        ' const answer: number = 42;',
        '+export const done = true;',
      ].join('\n'),
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    await conversationControllerActions(wrapper).openLink?.({
      kind: 'file',
      href: '/workspace/dina/src/main.ts',
      path: '/workspace/dina/src/main.ts',
      action: 'edit',
      turnId: 'turn-edit',
    });
    await nextTick();

    expect(wrapper.find('.git-diff-preview-panel').exists()).toBe(true);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['main.ts']);
    expect(wrapper.text()).toContain('done = true');
  });

  it('falls back to the current git review for edit links without turn context', async () => {
    const snapshot = createInitialSnapshot();
    const openAgentGitDiff = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        openAgentGitDiff,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    await conversationControllerActions(wrapper).openLink?.({
      kind: 'file',
      href: 'src/main.ts',
      path: 'src/main.ts',
      action: 'edit',
    });
    await flushPromises();

    expect(openAgentGitDiff).toHaveBeenCalledWith('agent-dina');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('Review');
  });

  it('does not open agent workspaces from background file activity', async () => {
    const snapshot = createInitialSnapshot();
    const [dina, jesse] = snapshot.agents;
    if (!dina || !jesse) throw new Error('Expected seeded agents.');
    dina.folder = '/workspace/dina';
    jesse.folder = '/workspace/jesse';
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'src/main.ts',
      content: 'export const updated = true;\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: dina,
        messages: [],
        isLoading: false,
        isSending: false,
        previewAgentFile,
        fileActivity: null,
      },
      global: { plugins: [ElementPlus, i18n] },
    });

    await wrapper.setProps({
      fileActivity: {
        agentId: jesse.id, turnId: 'turn-1', messageId: 'message-1', itemId: 'item-1',
        path: '/workspace/jesse/src/main.ts', action: 'edit', status: 'running',
        occurredAt: '2026-08-02T00:00:00.000Z',
      },
    } as Record<string, unknown>);

    expect(previewAgentFile).not.toHaveBeenCalled();
    expect(wrapper.find('[aria-label="Right workspace"]:not([style*="display: none"])').exists()).toBe(false);

    await wrapper.setProps({
      fileActivity: {
        agentId: jesse.id, turnId: 'turn-1', messageId: 'message-1', itemId: 'item-1',
        path: '/workspace/jesse/src/main.ts', action: 'edit', status: 'completed',
        occurredAt: '2026-08-02T00:00:01.000Z',
      },
    } as Record<string, unknown>);
    await flushPromises();

    expect(previewAgentFile).not.toHaveBeenCalled();

    await wrapper.setProps({ activeAgent: jesse } as Record<string, unknown>);
    await nextTick();

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(0);

    await wrapper.setProps({
      fileActivity: {
        agentId: jesse.id, turnId: 'turn-2', messageId: 'message-2', itemId: 'item-2',
        path: '/workspace/jesse/src/main.ts', action: 'read', status: 'running',
        occurredAt: '2026-08-02T00:00:02.000Z',
      },
    } as Record<string, unknown>);

    expect(previewAgentFile).not.toHaveBeenCalled();
  });

  it('strips editor-style line suffixes before reading file previews', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'README.md',
      content: '# Codex Claw\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-line-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [readme](README.md:40).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="README.md:40"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'README.md');
    expect(wrapper.text()).toContain('Codex Claw');
  });

  it('strips line and column suffixes from file URLs before reading previews', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/Users/nbonamy/src/id8';
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'README.md',
      content: '# id8\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-file-url-line-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [readme](file:///Users/nbonamy/src/id8/README.md:40:2).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="file:///Users/nbonamy/src/id8/README.md:40:2"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'README.md');
    expect(wrapper.text()).toContain('id8');
  });

  it('normalizes file URLs before opening source previews', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].folder = '/Users/nbonamy/src/id8';
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'src/file name.ts',
      content: 'export const value = true;\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-file-url',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [file](file:///Users/nbonamy/src/id8/src/file%20name.ts).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="file:///Users/nbonamy/src/id8/src/file%20name.ts"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'src/file name.ts');
    expect(wrapper.find('.source-preview-panel').exists()).toBe(true);
  });

  it('opens absolute file preview paths outside the active agent folder', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: '/Users/nbonamy/src/codex-claw/README.md',
      content: '# Codex Claw\n',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-outside-file-url',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [file](file:///Users/nbonamy/src/codex-claw/README.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="file:///Users/nbonamy/src/codex-claw/README.md"]').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', '/Users/nbonamy/src/codex-claw/README.md');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('README.md');
    expect(wrapper.text()).toContain('Codex Claw');
  });

  it('ignores stale markdown reads after the file tab closes', async () => {
    const snapshot = createInitialSnapshot();
    let resolveReadAgentFile: (result: { content: string; path: string }) => void = () => undefined;
    const previewAgentFile = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveReadAgentFile = resolve;
    }));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [architecture](docs/architecture.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="docs/architecture.md"]').trigger('click');
    await wrapper.get('[aria-label="Close architecture.md tab"]').trigger('click');

    resolveReadAgentFile({
      path: 'docs/architecture.md',
      content: '# Architecture\n\nThis result is stale.',
    });
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('This result is stale.');
  });

  it('keeps file read state scoped to the originating agent when switching agents', async () => {
    const snapshot = createInitialSnapshot();
    let rejectReadAgentFile: (error: Error) => void = () => undefined;
    const previewAgentFile = vi.fn().mockReturnValue(new Promise((_resolve, reject) => {
      rejectReadAgentFile = reject;
    }));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [architecture](docs/architecture.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    await wrapper.get('a[href="docs/architecture.md"]').trigger('click');
    await wrapper.setProps({ activeAgent: snapshot.agents[1] } as Record<string, unknown>);

    rejectReadAgentFile(new Error('This error is stale.'));
    await flushPromises();

    expect(wrapper.findAll('.right-workspace-panel').every((panel) => !panel.isVisible())).toBe(true);

    await wrapper.setProps({ activeAgent: snapshot.agents[0] } as Record<string, unknown>);
    expect(wrapper.findAll('.right-workspace-panel')[0]?.text()).toContain('This error is stale.');
  });

  it('shows markdown file-tab read errors', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockRejectedValue(new Error('File is outside the agent folder.'));
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [
          {
            id: 'message-doc-link',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:00.000Z',
            parts: [{ type: 'text', text: 'Open [secret](../secret.md).' }],
          },
        ],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('a[href="../secret.md"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('secret.md');
    expect(wrapper.text()).toContain('File is outside the agent folder.');
  });

  it('ignores blank markdown file preview requests', async () => {
    const snapshot = createInitialSnapshot();
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'docs/architecture.md',
      content: '# Architecture',
    });
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        previewAgentFile,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await conversationControllerActions(wrapper).openLink?.({
      kind: 'file',
      href: '   ',
      path: '   ',
    });
    await flushPromises();

    expect(previewAgentFile).not.toHaveBeenCalled();
    expect(wrapper.find('.side-panel').exists()).toBe(false);
  });

  it('opens MCP markdown requests as right-workspace tabs', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        sidePanelRequest: {
          kind: 'markdown',
          title: 'Generated Plan',
          content: '# Plan\n\nShip it.',
        },
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.find('.right-workspace-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('Generated Plan');
    expect(wrapper.text()).toContain('Ship it.');

    await wrapper.setProps({
      sidePanelRequest: {
        kind: 'markdown',
        path: 'docs/mcp.md',
        content: '# MCP',
      },
    } as Record<string, unknown>);

    expect(wrapper.text()).toContain('mcp.md');
    expect(wrapper.text()).toContain('MCP');
  });

  it('opens generated markdown requests with fallback title and no subtitle', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        sidePanelRequest: {
          kind: 'markdown',
          content: '# Generated',
        },
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.find('.side-panel').exists()).toBe(false);
    expect(wrapper.text()).toContain('Markdown');
    expect(wrapper.text()).toContain('Generated');
  });

  it('confirms a plan by exiting plan mode and sending the implementation prompt', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        planMode: true,
        sidePanelRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan\n\n- [ ] Build it',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('Plan');
    await wrapper.get('button.plan-review-footer__button--primary').trigger('click');

    expect(wrapper.emitted('update:planMode')).toStrictEqual([[false]]);
    expect(wrapper.emitted('sendPrompt')).toStrictEqual([['implement the plan']]);
  });

  it('cancels a plan by exiting plan mode and closing the preview', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        planMode: true,
        sidePanelRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    const cancel = wrapper.findAll('.plan-review-footer__button').find((button) => button.text() === 'Cancel');
    await cancel?.trigger('click');

    expect(wrapper.emitted('update:planMode')).toStrictEqual([[false]]);
    expect(wrapper.emitted('sendPrompt')).toBeUndefined();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).not.toContain('Plan');
  });

  it('sends saved plan comments as a refinement prompt', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
        planMode: true,
        sidePanelRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Plan',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    wrapper.findComponent({ name: 'PlanReviewPanel' }).vm.$emit('commentPlan', [
      {
        id: 'comment-1',
        quote: 'Build it',
        body: 'Split this into smaller steps.',
      },
    ]);

    expect(wrapper.emitted('sendPrompt')).toStrictEqual([[
      'Refine the plan using these comments:\n\n1. On: "Build it"\n   Comment: Split this into smaller steps.',
    ]]);
    expect(wrapper.emitted('update:planMode')).toBeUndefined();
  });

  it('shows the plan preview updating overlay while a plan progress tool is running', () => {
    const snapshot = createInitialSnapshot();
    const planProgressMessage: RendererMessage = {
      id: 'assistant-turn-plan',
      agentId: snapshot.agents[0].id,
      role: 'assistant',
      status: 'streaming',
      turnId: 'turn-plan',
      createdAt: '2026-06-05T00:00:00.000Z',
      parts: [{
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'running',
        metadata: {
          planProgress: true,
        },
      }],
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [planProgressMessage],
        isLoading: false,
        isSending: true,
        planMode: true,
        sidePanelRequest: {
          kind: 'markdown',
          purpose: 'plan',
          title: 'Plan',
          content: '# Previous Plan',
        },
      },
      global: {
        plugins: [ElementPlus, i18n],
      },
    });

    expect(wrapper.get('.plan-review-panel__overlay').text()).toBe('Updating plan...');
  });

  it('forwards interrupts from the composer stop button', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: true,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('.chat-composer__send').trigger('click');

    expect(wrapper.emitted('interrupt-agent')).toStrictEqual([[]]);
  });

  it('forwards agent selection from the sidebar', async () => {
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
        plugins: [ElementPlus],
      },
    });

    await wrapper.findAll('.agent-sidebar__agent')[1]?.trigger('click');

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
  });

  it('collapses the agent sidebar while keeping the team rail', async () => {
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
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('.team-rail').classes()).toContain('team-rail--agent-sidebar-expanded');
    await wrapper.get('[aria-label="Hide agent sidebar"]').trigger('click');

    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.team-rail').exists()).toBe(true);
    expect(wrapper.get('.team-rail').classes()).not.toContain('team-rail--agent-sidebar-expanded');
    expect(wrapper.get('[aria-label="Show agent sidebar"]').attributes('aria-label')).toBe('Show agent sidebar');
  });

  it('keeps agent sidebar resize state in the shell', async () => {
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
        plugins: [ElementPlus],
      },
    });

    const sidebar = () => wrapper.get('.agent-sidebar');
    expect(sidebar().attributes('style')).toContain('--agent-sidebar-width: 260px');

    const resizeHandle = wrapper.get('[aria-label="Resize agent sidebar"]');
    resizeHandle.element.dispatchEvent(pointerEvent('pointerdown', 260));
    resizeHandle.element.dispatchEvent(pointerEvent('pointermove', 320));
    await nextTick();

    expect(sidebar().attributes('style')).toContain('--agent-sidebar-width: 320px');
  });

  it('resolves the active team from legacy agent membership when teamId is missing', () => {
    const snapshot = createInitialSnapshot();
    snapshot.activeTeamId = null;
    const activeAgent: Agent = {
      ...snapshot.agents[0],
      teamId: undefined,
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.getComponent({ name: 'AgentSidebar' }).props('teamName')).toBe('Codex Claw');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
  });

  it('resolves the active team from the active agent team id when no team is selected', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: ['agent-dina'],
      activeAgentId: 'agent-dina',
    });
    snapshot.activeTeamId = null;
    const activeAgent: Agent = {
      ...snapshot.agents[0],
      teamId: 'team-skwad',
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.getComponent({ name: 'AgentSidebar' }).props('teamName')).toBe('Skwad');
  });

  it('falls back to the first team when active agent team references are stale', () => {
    const snapshot = createInitialSnapshot();
    snapshot.activeTeamId = null;
    const activeAgent: Agent = {
      ...snapshot.agents[0],
      id: 'agent-stale',
      teamId: 'team-missing',
    };
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
  });

  it('falls back to the first team when no active agent is selected', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: null,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.getComponent({ name: 'AgentSidebar' }).props('teamName')).toBe('Codex Claw');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
  });

  it('uses product fallback title when no teams exist', () => {
    const snapshot = createEmptySnapshot();
    snapshot.teams = [];
    snapshot.activeTeamId = null;
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: null,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Welcome to Codex Claw!');
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
  });

  it('falls back when backend runtime status is missing', () => {
    const snapshot = createInitialSnapshot();
    snapshot.backendRuntimes = [];
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: snapshot.agents[0],
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.find('.agent-header').exists()).toBe(true);
  });

  it('forwards team selection and filters the sidebar to the active team', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-empty',
      name: 'Empty Team',
      avatar: 'ET',
      color: '#46A857',
      agentIds: [],
    });
    snapshot.activeTeamId = 'team-empty';
    snapshot.activeAgentId = null;
    const wrapper = mountShell({ snapshot });

    expect(wrapper.get('[aria-label="Empty Team"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.findAll('.agent-sidebar__agent')).toHaveLength(0);
    expect(wrapper.text()).toContain('Welcome to Codex Claw!');

    await wrapper.get('[aria-label="Codex Claw"]').trigger('click');

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-codex-claw']]);
  });

  it('derives unread teams from their unread agents', () => {
    const snapshot = createInitialSnapshot();
    const otherAgent = {
      ...snapshot.agents[0]!,
      id: 'agent-other',
      teamId: 'team-other',
      name: 'Other Agent',
    };
    snapshot.agents.push(otherAgent);
    snapshot.teams.push({
      id: 'team-other',
      name: 'Other Team',
      avatar: 'OT',
      color: '#46A857',
      agentIds: [otherAgent.id],
    });
    const wrapper = mountShell({
      snapshot,
      unreadAgentIds: ['agent-jesse', otherAgent.id],
    });

    expect(wrapper.getComponent({ name: 'TeamRail' }).props('unreadTeamIds'))
      .toStrictEqual(['team-other']);
  });

  it('shows unread activity for the previously selected team while cockpit is open', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({
      snapshot,
      unreadAgentIds: ['agent-jesse'],
    });

    expect(wrapper.getComponent({ name: 'TeamRail' }).props('unreadTeamIds')).toStrictEqual([]);

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await flushPromises();

    expect(wrapper.getComponent({ name: 'TeamRail' }).props('unreadTeamIds'))
      .toStrictEqual(['team-codex-claw']);
    expect(wrapper.get('[aria-label="Codex Claw, unread activity"]').classes())
      .toContain('team-rail__team--unread');
  });

  it('opens cockpit from the first rail item and navigates back to an agent', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');

    expect(wrapper.find('.cockpit-view').exists()).toBe(true);
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.conversation-pane').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Cockpit"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('false');

    await wrapper.get('[aria-label="Codex Claw"]').trigger('click');

    expect(wrapper.find('.cockpit-view').exists()).toBe(false);
    expect(wrapper.emitted('select-team')).toStrictEqual([['team-codex-claw']]);
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('opens loops from the rail without keeping a team active', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Loops"]').trigger('click');

    expect(wrapper.find('.loops-view').exists()).toBe(true);
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.conversation-pane').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Loops"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.text()).toContain('A loop is an automation that just works for you.');
  });

  it('opens a loop execution conversation from the logs view', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.loops = [{
      id: 'loop-bugs',
      name: 'GitHub bugs',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
      instructions: {},
      executionLog: [{
        id: 'loop-exec-1',
        loopId: 'loop-bugs',
        startedAt: '2026-06-09T10:00:00.000Z',
        completedAt: '2026-06-09T10:01:00.000Z',
        status: 'completed',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-jesse',
          agentName: 'Jesse',
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
          conversationRef: { backend: 'codex', threadId: 'thread-jesse' },
        }],
      }],
      createdAt: '2026-06-09T09:59:00.000Z',
      updatedAt: '2026-06-09T10:01:00.000Z',
    }];
    snapshot.messages = [{
      id: 'message-jesse-user',
      agentId: 'agent-jesse',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-09T10:00:02.000Z',
      parts: [{ type: 'text', text: 'Please fix cockpit from the loop.' }],
    }, {
      id: 'message-jesse-assistant',
      agentId: 'agent-jesse',
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-06-09T10:00:45.000Z',
      parts: [{ type: 'text', text: 'Loop work is ready.' }],
    }];
    const readConversationMessages = vi.fn().mockResolvedValue(snapshot.messages);
    const wrapper = mountShell({ snapshot, readConversationMessages });

    await wrapper.get('[aria-label="Loops"]').trigger('click');
    await wrapper.get('[aria-label="View logs for GitHub bugs"]').trigger('click');
    await wrapper.get('[aria-label="View conversation for github:nbonamy/codex-claw#12"]').trigger('click');
    await flushPromises();

    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-jesse' }, 'agent-jesse');
    expect(wrapper.emitted('select-agent')).toBeUndefined();
    expect(wrapper.find('.loops-view').exists()).toBe(true);
    expect(wrapper.find('.loop-execution-conversation-overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('Please fix cockpit from the loop.');
    expect(wrapper.text()).toContain('Loop work is ready.');
  });

  it('forwards cockpit work item assignments', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    snapshot.workBacklog.providerConfigurations.github = {
      repositoryId: 'nbonamy/codex-claw',
    };
    const item = workItem();
    const wrapper = mountShell({
      snapshot,
      workRepositoriesByProvider: {
        github: [{
          provider: 'github',
          id: 'nbonamy/codex-claw',
          owner: 'nbonamy',
          name: 'codex-claw',
          fullName: 'nbonamy/codex-claw',
          url: 'https://github.com/nbonamy/codex-claw',
          isPrivate: true,
        }],
      },
      workItemsByRepository: {
        'github:nbonamy/codex-claw': [item],
      },
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item', {
      agentId: 'agent-dina',
      item,
    });
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('remove-work-item-assignment', item);
    await flushPromises();

    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina',
      item,
    }]]);
    expect(wrapper.emitted('remove-work-item-assignment')).toStrictEqual([[item]]);
  });

  it('loads one assigned-to-me page by default without fanning out by repository', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    const repositories: WorkRepository[] = ['codex-claw', 'multi-llm-ts'].map((name) => ({
      provider: 'github',
      id: `nbonamy/${name}`,
      owner: 'nbonamy',
      name,
      fullName: `nbonamy/${name}`,
      url: `https://github.com/nbonamy/${name}`,
      isPrivate: true,
    }));
    const loadWorkRepositories = vi.fn().mockResolvedValue(repositories);
    const loadWorkItems = vi.fn().mockResolvedValue([]);
    const loadGlobalWorkItems = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 25, totalItems: 0 });
    const wrapper = mountShell({ snapshot, loadWorkRepositories, loadWorkItems, loadGlobalWorkItems });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await flushPromises();

    expect(loadWorkRepositories).toHaveBeenCalledWith('github');
    expect(loadWorkItems).not.toHaveBeenCalled();
    expect(loadGlobalWorkItems).toHaveBeenCalledWith('github', undefined, {
      assignment: 'viewer', state: 'open', page: 1, pageSize: 25,
    });
    expect(wrapper.findComponent({ name: 'CockpitWorkInbox' }).props('selectedAssigneeLogin')).toBe('nbonamy');
  });

  it('automatically loads one global page after the user remembers that scope', async () => {
    window.localStorage.setItem('cockpitGlobalScope:github', 'all');
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{ provider: 'github', status: 'connected', accountLabel: 'nbonamy' }];
    const repositories: WorkRepository[] = ['codex-claw', 'multi-llm-ts'].map((name) => ({
      provider: 'github', id: `nbonamy/${name}`, owner: 'nbonamy', name,
      fullName: `nbonamy/${name}`, url: `https://github.com/nbonamy/${name}`, isPrivate: true,
    }));
    const loadWorkRepositories = vi.fn().mockResolvedValue(repositories);
    const loadGlobalWorkItems = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 25, totalItems: 12 });
    const confirm = vi.spyOn(ElMessageBox, 'confirm');
    const wrapper = mountShell({ snapshot, loadWorkRepositories, loadGlobalWorkItems });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await flushPromises();

    expect(confirm).not.toHaveBeenCalled();
    expect(loadGlobalWorkItems).toHaveBeenCalledTimes(1);
    expect(loadGlobalWorkItems).toHaveBeenCalledWith('github', undefined, {
      assignment: 'all', state: 'open', page: 1, pageSize: 25,
    });
    expect(wrapper.findComponent({ name: 'CockpitWorkInbox' }).props('globalScope')).toBe('all');
    expect(wrapper.findComponent({ name: 'CockpitWorkInbox' }).props()).toMatchObject({ page: 1, pageSize: 25, totalItems: 12 });
  });

  it('remembers the explicit load-everything confirmation', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{ provider: 'github', status: 'connected', accountLabel: 'nbonamy' }];
    const repository: WorkRepository = {
      provider: 'github', id: 'nbonamy/codex-claw', owner: 'nbonamy', name: 'codex-claw',
      fullName: 'nbonamy/codex-claw', url: 'https://github.com/nbonamy/codex-claw', isPrivate: true,
    };
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const loadGlobalWorkItems = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 25, totalItems: 0 });
    const wrapper = mountShell({
      snapshot,
      loadGlobalWorkItems,
      workRepositoriesByProvider: { github: [repository] },
    });
    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await flushPromises();

    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('select-global-scope', 'all');
    await flushPromises();

    expect(window.localStorage.getItem('cockpitGlobalScope:github')).toBe('all');
    expect(loadGlobalWorkItems).toHaveBeenLastCalledWith('github', undefined, {
      assignment: 'all', state: 'open', page: 1, pageSize: 25,
    });
  });

  it('navigates global pages and reuses cached pages when going back', async () => {
    window.localStorage.setItem('cockpitGlobalScope:github', 'all');
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{ provider: 'github', status: 'connected', accountLabel: 'nbonamy' }];
    const first = workItem({ id: 'nbonamy/one#1', repositoryId: 'nbonamy/one', repositoryFullName: 'nbonamy/one', number: 1 });
    const second = workItem({ id: 'nbonamy/two#2', repositoryId: 'nbonamy/two', repositoryFullName: 'nbonamy/two', number: 2 });
    const loadGlobalWorkItems = vi.fn()
      .mockResolvedValueOnce({ items: [first], page: 1, pageSize: 25, totalItems: 26 })
      .mockResolvedValueOnce({ items: [second], page: 2, pageSize: 25, totalItems: 26 });
    const wrapper = mountShell({
      snapshot,
      loadGlobalWorkItems,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    await flushPromises();
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('change-work-items-page', 2);
    await flushPromises();

    expect(loadGlobalWorkItems).toHaveBeenNthCalledWith(2, 'github', undefined, {
      assignment: 'all', state: 'open', page: 2, pageSize: 25,
    });
    expect(wrapper.findComponent({ name: 'CockpitWorkInbox' }).props()).toMatchObject({ items: [second], page: 2, totalItems: 26 });

    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('change-work-items-page', 1);
    await flushPromises();
    expect(loadGlobalWorkItems).toHaveBeenCalledTimes(2);
    expect(wrapper.findComponent({ name: 'CockpitWorkInbox' }).props()).toMatchObject({ items: [first], page: 1, totalItems: 26 });
  });

  it('opens agent creation with the repository selected from the Cockpit sidebar', async () => {
    const snapshot = createInitialSnapshot();
    const repository: WorkRepository = {
      provider: 'github',
      id: 'nbonamy/mediastation',
      owner: 'nbonamy',
      name: 'mediastation',
      fullName: 'nbonamy/mediastation',
      url: 'https://github.com/nbonamy/mediastation',
      isPrivate: true,
    };
    const wrapper = mountShell({
      snapshot,
      sourceRepositories: [{
        name: 'mediastation',
        path: '/Users/nbonamy/src/mediastation',
        worktrees: [{ name: 'main', path: '/Users/nbonamy/src/mediastation' }],
      }],
      workRepositoriesByProvider: { github: [repository] },
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('add-agent-for-repository', repository);
    await flushPromises();

    const dialog = wrapper.findComponent({ name: 'AgentDialog' });
    expect(dialog.props('initialSourceRepositoryName')).toBe('mediastation');
    expect(dialog.findAllComponents({ name: 'ElSelect' })[0]?.props('modelValue')).toBe('/Users/nbonamy/src/mediastation');
  });

  it('wires repository session actions to agent creation and source selection', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents = snapshot.agents.map((agent) => ({
      ...agent,
      workspace: {
        kind: 'git' as const,
        folder: '/Users/nbonamy/src/codex-claw',
        repositoryName: 'codex-claw',
        repositoryRoot: '/Users/nbonamy/src/codex-claw',
        branch: 'main',
        isLinkedWorktree: false,
        primaryWorktreeRoot: '/Users/nbonamy/src/codex-claw',
        updatedAt: '2026-08-28T00:00:00.000Z',
      },
    }));
    const sourceRepository: SourceRepository = {
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
    };
    const githubRepository: WorkRepository = {
      provider: 'github',
      id: 'nbonamy/codex-claw',
      owner: 'nbonamy',
      name: 'codex-claw',
      fullName: 'nbonamy/codex-claw',
      url: 'https://github.com/nbonamy/codex-claw',
      isPrivate: true,
    };
    const issue = workItem({
      id: 'github:nbonamy/codex-claw#24',
      repositoryId: githubRepository.id,
      repositoryFullName: githubRepository.fullName,
      number: 24,
      title: 'Repository-first sessions',
    });
    const listSourceBranches = vi.fn().mockResolvedValue([
      { name: 'main', isDefault: true, worktreePath: '/Users/nbonamy/src/codex-claw' },
      { name: 'feat/work-routing', isDefault: false },
    ]);
    const loadWorkItems = vi.fn().mockResolvedValue([issue]);
    const createSourceWorktree = vi.fn().mockResolvedValue({
      name: 'work-routing',
      path: '/Users/nbonamy/src/codex-claw-work-routing',
    });
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      sourceRepositories: [sourceRepository],
      listSourceBranches,
      loadWorkItems,
      createSourceWorktree,
      createAgent,
      workRepositoriesByProvider: { github: [githubRepository] },
    });
    const sidebar = wrapper.getComponent({ name: 'AgentSidebar' });

    sidebar.vm.$emit('create-agent-on-branch', {
      agentId: 'agent-dina',
      repositoryName: 'codex-claw',
      repositoryRoot: '/Users/nbonamy/src/codex-claw',
      branch: { name: 'main', isDefault: true, worktreePath: '/Users/nbonamy/src/codex-claw' },
    });
    await flushPromises();
    expect(listSourceBranches).not.toHaveBeenCalled();
    expect(createSourceWorktree).not.toHaveBeenCalled();
    expect(createAgent).toHaveBeenCalledWith({
      name: null,
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      sourceRepositoryName: 'codex-claw',
      teamId: 'team-codex-claw',
    });
    listSourceBranches.mockClear();
    createAgent.mockClear();

    sidebar.vm.$emit('create-agent-from-repository', {
      agentId: 'agent-dina',
      repositoryName: 'codex-claw',
      repositoryRoot: '/Users/nbonamy/src/codex-claw',
    });
    await flushPromises();

    const sourceDialog = wrapper.getComponent({ name: 'RepositorySessionSourceDialog' });
    expect(listSourceBranches).toHaveBeenCalledWith('/Users/nbonamy/src/codex-claw', undefined);
    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw', undefined, {
      kind: 'all',
      state: 'open',
    });
    expect(sourceDialog.props('branches')).toHaveLength(2);
    expect(sourceDialog.props('workItems')).toStrictEqual([issue]);

    sourceDialog.vm.$emit('select-branch', { name: 'feat/work-routing', isDefault: false });
    await flushPromises();
    expect(createSourceWorktree).toHaveBeenCalledWith({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feat/work-routing',
    });
    expect(createAgent).toHaveBeenCalledWith({
      name: null,
      folder: '/Users/nbonamy/src/codex-claw-work-routing',
      backend: 'codex',
      sourceRepositoryName: 'codex-claw',
      teamId: 'team-codex-claw',
    });
    expect(wrapper.getComponent({ name: 'RepositorySessionSourceDialog' }).props('visible')).toBe(false);

    createAgent.mockClear();
    sidebar.vm.$emit('create-agent-worktree-in-repository', {
      agentId: 'agent-dina',
      repositoryName: 'codex-claw',
      repositoryRoot: '/Users/nbonamy/src/codex-claw',
    });
    await flushPromises();
    const worktreeDialog = wrapper.getComponent({ name: 'NewSourceWorktreeDialog' });
    expect(worktreeDialog.props('visible')).toBe(true);
    await worktreeDialog.vm.$emit('created', {
      name: 'feature-session',
      path: '/Users/nbonamy/src/codex-claw-feature-session',
    });
    await flushPromises();
    expect(createAgent).toHaveBeenCalledWith({
      name: null,
      folder: '/Users/nbonamy/src/codex-claw-feature-session',
      backend: 'codex',
      sourceRepositoryName: 'codex-claw',
      teamId: 'team-codex-claw',
    });
  });

  it('clones a GitHub repository before opening its contextual session picker', async () => {
    const snapshot = createInitialSnapshot();
    const githubRepository: WorkRepository = {
      provider: 'github',
      id: 'nbonamy/new-project',
      owner: 'nbonamy',
      name: 'new-project',
      fullName: 'nbonamy/new-project',
      url: 'https://github.com/nbonamy/new-project',
      isPrivate: true,
    };
    const cloneSourceRepository = vi.fn().mockResolvedValue({
      name: 'new-project',
      path: '/Users/nbonamy/src/new-project',
      worktrees: [{ name: 'main', path: '/Users/nbonamy/src/new-project' }],
    });
    const listSourceBranches = vi.fn().mockResolvedValue([
      { name: 'main', isDefault: true, worktreePath: '/Users/nbonamy/src/new-project' },
    ]);
    const wrapper = mountShell({
      snapshot,
      cloneSourceRepository,
      listSourceBranches,
      loadWorkRepositories: vi.fn().mockResolvedValue([githubRepository]),
    });

    wrapper.getComponent({ name: 'AgentSidebar' }).vm.$emit('start-work', 'github');
    await flushPromises();
    const acquire = wrapper.getComponent({ name: 'RepositoryAcquireDialog' });
    expect(acquire.props('repositories')).toStrictEqual([githubRepository]);

    acquire.vm.$emit('select-repository', githubRepository);
    await flushPromises();

    expect(cloneSourceRepository).toHaveBeenCalledWith({ url: githubRepository.url });
    expect(listSourceBranches).toHaveBeenCalledWith('/Users/nbonamy/src/new-project', undefined);
    expect(wrapper.getComponent({ name: 'RepositorySessionSourceDialog' }).props('repositoryName')).toBe('new-project');
  });

  it('persists cockpit backlog repository and tag configuration', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    const configureWorkBacklog = vi.fn().mockResolvedValue(undefined);
    const loadWorkItems = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      configureWorkBacklog,
      loadWorkItems,
      workRepositoriesByProvider: {
        github: [{
          provider: 'github',
          id: 'nbonamy/codex-claw',
          owner: 'nbonamy',
          name: 'codex-claw',
          fullName: 'nbonamy/codex-claw',
          url: 'https://github.com/nbonamy/codex-claw',
          isPrivate: true,
        }],
      },
      workItemsByRepository: {
        'github:nbonamy/codex-claw': [workItem()],
      },
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    const cockpit = wrapper.findComponent({ name: 'CockpitView' });
    cockpit.vm.$emit('select-work-repository', 'nbonamy/codex-claw');
    cockpit.vm.$emit('select-work-assignee', 'nbonamy');
    cockpit.vm.$emit('select-work-tag', 'bug');
    await flushPromises();

    expect(configureWorkBacklog).toHaveBeenNthCalledWith(1, {
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: null,
        tagName: null,
      },
    });
    expect(configureWorkBacklog).toHaveBeenNthCalledWith(2, {
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: 'nbonamy',
        tagName: null,
      },
    });
    expect(configureWorkBacklog).toHaveBeenNthCalledWith(3, {
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: 'nbonamy',
        tagName: 'bug',
      },
    });
    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw');
  });

  it('confirms before assigning an already assigned cockpit work item to another agent', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createInitialSnapshot();
    const item = workItem();
    snapshot.workBacklog.assignments = {
      [workItemAssignmentKey(item)]: workItemAssignment(item, 'agent-jesse'),
    };
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item', {
      agentId: 'agent-dina',
      item,
    });
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      "GitHub #12 is already assigned to Jesse. We don't know if Jesse is still working on it. Assign it to Dina anyway?",
      'Assign anyway?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Assign Anyway',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina',
      item,
    }]]);
  });

  it('keeps an assigned cockpit work item on the current agent when overriding is canceled', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));
    const snapshot = createInitialSnapshot();
    const item = workItem();
    snapshot.workBacklog.assignments = {
      [workItemAssignmentKey(item)]: workItemAssignment(item, 'agent-jesse'),
    };
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item', {
      agentId: 'agent-dina',
      item,
    });
    await flushPromises();

    expect(wrapper.emitted('assign-work-item')).toBeUndefined();
  });

  it('shows the empty agent page when the active team has no agents', async () => {
    const snapshot = createEmptySnapshot();
    const wrapper = mount(AppShell, {
      props: {
        snapshot,
        activeAgent: null,
        messages: [],
        isLoading: false,
        isSending: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Welcome to Codex Claw!');
    expect(wrapper.text()).toContain('Add an agent to your team');
    expect(wrapper.find('.agent-header').exists()).toBe(false);
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.find('.conversation-pane').exists()).toBe(false);

    await wrapper.get('.agent-sidebar__new').trigger('click');
    expect(wrapper.text()).toContain('New agent');
  });

  it('forwards Bench deploy and remove intents from the empty team screen', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createEmptySnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Dina'))?.trigger('click');
    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Remove Dina from Bench"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
    expect(wrapper.emitted('remove-bench-template')).toStrictEqual([[{
      templateId: 'bench-dina',
      teamId: 'team-codex-claw',
    }]]);
  });

  it('assigns a ticket to a new agent and can create a ticket-named team', async () => {
    const snapshot = createInitialSnapshot();
    const item = workItem();
    const createdTeam: Team = {
      id: 'team-github-12',
      name: 'GitHub #12',
      color: '#1B4FB2',
      agentIds: [],
    };
    const createdAgent: Agent = {
      id: 'agent-issue',
      teamId: 'team-github-12',
      name: 'issue-agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/issue-agent',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    };
    const createTeam = vi.fn().mockResolvedValue(createdTeam);
    const createAgent = vi.fn().mockResolvedValue(createdAgent);
    const createSourceWorktree = vi.fn().mockResolvedValue({
      name: 'fix-gh-12',
      path: '/Users/nbonamy/src/codex-claw-fix-gh-12',
    });
    const wrapper = mountShell({
      snapshot,
      createAgent,
      createSourceWorktree,
      createTeam,
      listSourceWorktrees: vi.fn().mockResolvedValue([{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }]),
      sourceRepositories: [{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
      }],
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item-to-new-agent', { item });
    await flushPromises();

    const agentDialog = wrapper.findComponent({ name: 'AgentDialog' });
    expect(agentDialog.find('#agent-dialog-team').exists()).toBe(true);
    expect(agentDialog.props()).toMatchObject({
      initialAgentName: '',
      initialNewWorktreeBranchName: 'fix/gh-12',
      initialSourceRepositoryName: 'codex-claw',
    });

    const teamSelect = agentDialog.findAllComponents({ name: 'ElSelect' }).find((select) => (
      select.find('#agent-dialog-team').exists()
    ));
    await teamSelect?.vm.$emit('update:modelValue', '__new_team__');
    await nextTick();
    expect(agentDialog.get<HTMLInputElement>('[aria-label="New team name"]').element.value).toBe('GitHub #12');
    expect(agentDialog.getComponent({ name: 'NewSourceWorktreeDialog' }).props('visible')).toBe(false);
    await agentDialog.find('.claw-dialog__footer .claw-button--primary').trigger('click');
    await flushPromises();

    expect(createSourceWorktree).toHaveBeenCalledWith({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'fix/gh-12',
    });
    expect(createTeam).toHaveBeenCalledWith({
      name: 'GitHub #12',
      color: '#1B4FB2',
    });
    expect(createAgent).toHaveBeenCalledWith({
      name: null,
      folder: '/Users/nbonamy/src/codex-claw-fix-gh-12',
      backend: 'codex',
      sourceRepositoryName: 'codex-claw',
      teamId: 'team-github-12',
    });
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-issue',
      item,
    }]]);
  });

  it('launches selected Cockpit work in automatic named worktrees and the selected team', async () => {
    const snapshot = createInitialSnapshot();
    const first = workItem();
    const second = { ...workItem(), id: 'nbonamy/codex-claw#13', number: 13, title: 'Second issue' };
    const createSourceWorktree = vi.fn().mockImplementation(async ({ branchName }: { branchName: string }) => ({
      name: branchName.replace('/', '-'),
      path: `/Users/nbonamy/src/codex-claw-${branchName.replace('/', '-')}`,
    }));
    const createAgent = vi.fn().mockImplementation(async (input: CreateAgentInput) => ({
      id: `agent-${input.name}`,
      teamId: input.teamId,
      name: input.name,
      avatar: input.avatar,
      folder: input.folder,
      backend: input.backend,
      backendDefaults: { kind: 'codex' as const },
      status: { type: 'idle' as const },
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    }));
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      assignWorkItemAction,
      createAgent,
      createSourceWorktree,
      sourceRepositories: [{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
      }],
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    const startWorkItemsAction = wrapper.findComponent({ name: 'CockpitView' }).props('startWorkItemsAction') as (input: {
      action: 'investigate' | 'fix'; items: WorkItem[]; teamId: string;
    }) => Promise<void>;
    await startWorkItemsAction({ action: 'fix', items: [first, second], teamId: 'team-codex-claw' });

    expect(createSourceWorktree).toHaveBeenNthCalledWith(1, {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'fix/gh-12',
    });
    expect(createSourceWorktree).toHaveBeenNthCalledWith(2, {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'fix/gh-13',
    });
    expect(createAgent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      name: null,
      folder: '/Users/nbonamy/src/codex-claw-fix-gh-12',
      sourceRepositoryName: 'codex-claw',
      teamId: 'team-codex-claw',
    }));
    expect(createAgent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      name: null,
      folder: '/Users/nbonamy/src/codex-claw-fix-gh-13',
      sourceRepositoryName: 'codex-claw',
      teamId: 'team-codex-claw',
    }));
    expect(assignWorkItemAction).toHaveBeenCalledTimes(2);
    expect(assignWorkItemAction.mock.calls[0]?.[0].prompt).toContain('Fix this GitHub issue');
  });

  it('resolves globally listed pull request branches only when selected work starts', async () => {
    const snapshot = createInitialSnapshot();
    const listedItem = workItem({
      id: 'nbonamy/codex-claw#38',
      kind: 'pullRequest',
      number: 38,
      title: 'Paginate the Cockpit backlog',
    });
    const resolvedItem = { ...listedItem, branchName: 'feature/paginated-cockpit' };
    const loadWorkItems = vi.fn().mockResolvedValue([resolvedItem]);
    const createSourceWorktree = vi.fn().mockResolvedValue({
      name: 'feature-paginated-cockpit',
      path: '/Users/nbonamy/src/codex-claw-feature-paginated-cockpit',
    });
    const createAgent = vi.fn().mockResolvedValue({
      id: 'agent-pr-38',
      teamId: 'team-codex-claw',
      name: 'codex-claw - gh-38',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/codex-claw-feature-paginated-cockpit',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    });
    const assignWorkItemAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      assignWorkItemAction,
      createAgent,
      createSourceWorktree,
      loadWorkItems,
      sourceRepositories: [{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [{ name: 'main', path: '/Users/nbonamy/src/codex-claw' }],
      }],
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    const startWorkItemsAction = wrapper.findComponent({ name: 'CockpitView' }).props('startWorkItemsAction') as (input: {
      action: 'investigate' | 'fix'; items: WorkItem[]; teamId: string;
    }) => Promise<void>;
    await startWorkItemsAction({ action: 'fix', items: [listedItem], teamId: 'team-codex-claw' });

    expect(loadWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw', undefined, {
      kind: 'pullRequest',
      state: 'all',
    });
    expect(createSourceWorktree).toHaveBeenCalledWith({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/paginated-cockpit',
    });
    expect(assignWorkItemAction).toHaveBeenCalledWith(expect.objectContaining({ item: resolvedItem }));
  });

  it('assigns a ticket to a Bench agent with a selected or new team', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const item = workItem();
    const createdTeam: Team = {
      id: 'team-github-12',
      name: 'GitHub #12',
      color: '#1B4FB2',
      agentIds: [],
    };
    const deployedAgent: Agent = {
      id: 'agent-dina-copy',
      teamId: 'team-github-12',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    };
    const createTeam = vi.fn().mockResolvedValue(createdTeam);
    const deployBenchTemplateAction = vi.fn().mockResolvedValue(deployedAgent);
    const wrapper = mountShell({
      snapshot,
      createTeam,
      deployBenchTemplateAction,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item-to-bench-agent', { item });
    await flushPromises();

    const benchAgentAssignmentDialog = wrapper.findComponent({ name: 'BenchAgentAssignmentDialog' });
    expect(benchAgentAssignmentDialog.text()).toContain('Dina');
    expect(benchAgentAssignmentDialog.text()).toContain('id8');

    await benchAgentAssignmentDialog.findAllComponents({ name: 'ElSelect' })[1]?.vm.$emit('update:modelValue', '__new_team__');
    await nextTick();
    expect(benchAgentAssignmentDialog.get<HTMLInputElement>('[aria-label="New team name"]').element.value).toBe('GitHub #12');
    await wrapper.findAll('button').find((button) => button.text() === 'Assign')?.trigger('click');
    await flushPromises();

    expect(createTeam).toHaveBeenCalledWith({
      name: 'GitHub #12',
      color: '#1B4FB2',
    });
    expect(deployBenchTemplateAction).toHaveBeenCalledWith({
      templateId: 'bench-dina',
      teamId: 'team-github-12',
    });
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina-copy',
      item,
    }]]);
  });

  it('uses dragged team context when assigning a ticket to a Bench agent', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      color: '#46A857',
      agentIds: [],
    });
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    const item = workItem();
    const deployedAgent: Agent = {
      id: 'agent-dina-copy',
      teamId: 'team-skwad',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    };
    const deployBenchTemplateAction = vi.fn().mockResolvedValue(deployedAgent);
    const wrapper = mountShell({
      snapshot,
      deployBenchTemplateAction,
    });

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    wrapper.findComponent({ name: 'CockpitView' }).vm.$emit('assign-work-item-to-bench-agent', {
      item,
      teamId: 'team-skwad',
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === 'Assign')?.trigger('click');
    await flushPromises();

    expect(deployBenchTemplateAction).toHaveBeenCalledWith({
      templateId: 'bench-dina',
      teamId: 'team-skwad',
    });
    expect(wrapper.emitted('assign-work-item')).toStrictEqual([[{
      agentId: 'agent-dina-copy',
      item,
    }]]);
  });

  it('opens the new team dialog from the team rail and forwards create requests', async () => {
    const snapshot = createInitialSnapshot();
    const createTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      createTeam,
    });

    await wrapper.get('[aria-label="Create team"]').trigger('click');

    expect(wrapper.text()).toContain('Create Team');
    await wrapper.get('.team-dialog__text-input').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Create Team')?.trigger('click');

    expect(createTeam).toHaveBeenCalledWith({
      name: 'Skwad Core',
      color: '#46A857',
    });
  });

  it('opens settings on General, remembers the last settings pane, updates appearance, and quits', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.accountRateLimits = {
      limitId: 'codex',
      limitName: 'Codex',
      primary: {
        usedPercent: 41,
        windowDurationMins: 300,
        resetsAt: null,
      },
      secondary: null,
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const quit = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, updateSettings, quit });

    expect(wrapper.text()).toContain('59%');
    await wrapper.findAll('button').find((button) => {
      const label = button.find('.app-menu__label');
      return label.exists() && label.text() === 'Settings';
    })?.trigger('click');
    expect(wrapper.find('.settings-view').exists()).toBe(true);
    expect(wrapper.find('.agent-sidebar').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Account menu"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Account menu"]').classes()).toContain('settings-menu__trigger--active');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Codex Claw"]').classes()).not.toContain('team-rail__team--active');
    expect(wrapper.text()).toContain('Accessibility');
    expect(wrapper.text()).not.toContain('Launch ChatGPT');
    expect(wrapper.text()).not.toContain('Theme');

    await wrapper.findAll('.el-menu-item').find((item) => item.text() === 'Appearance')?.trigger('click');
    expect(wrapper.text()).toContain('Theme');
    expect(wrapper.text()).toContain('Codex Claw Light');

    await wrapper.get('[aria-label="Cockpit"]').trigger('click');
    expect(wrapper.find('.settings-view').exists()).toBe(false);

    await wrapper.findAll('button').find((button) => {
      const label = button.find('.app-menu__label');
      return label.exists() && label.text() === 'Settings';
    })?.trigger('click');
    expect(wrapper.text()).toContain('Theme');
    expect(wrapper.text()).toContain('Codex Claw Light');

    await wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'github-dark');
    await wrapper.findAll('button').find((button) => button.text() === 'Quit')?.trigger('click');

    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark' } });
    expect(quit).toHaveBeenCalledOnce();
  });

  it('opens the edit team dialog from the team menu and forwards updates', async () => {
    const snapshot = createInitialSnapshot();
    const updateTeam = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      updateTeam,
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Edit Team')?.trigger('click');

    expect(wrapper.text()).toContain('Edit Team');
    await wrapper.get('.team-dialog__text-input').setValue('Skwad Core');
    await wrapper.findAll('.team-dialog__color')[10]?.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Save')?.trigger('click');

    expect(updateTeam).toHaveBeenCalledWith({
      id: 'team-codex-claw',
      name: 'Skwad Core',
      color: '#46A857',
    });
  });

  it('confirms before forwarding close team requests', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Skwad"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team')?.trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'Agents and messages in Skwad will be removed from Codex Claw.',
      'Close Skwad?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('close-team')).toStrictEqual([['team-skwad']]);
  });

  it('does not close a team when confirmation is canceled', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.get('[aria-label="Skwad"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team')?.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('close-team')).toBeUndefined();
  });

  it('opens the edit agent dialog from the sidebar context menu and forwards updates', async () => {
    const snapshot = createInitialSnapshot();
    const updateAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({
      snapshot,
      updateAgent,
    });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await clickPortaledMenuItem('Edit Agent');

    expect(wrapper.text()).toContain('Edit agent');
    await wrapper.get('.agent-dialog__text-input').setValue('Dina Prime');
    await wrapper.findAll('button').find((button) => button.text() === 'Save')?.trigger('click');

    expect(updateAgent).toHaveBeenCalledWith({
      id: 'agent-dina',
      name: 'Dina Prime',
    });
  });

  it('forwards agent context menu action intents', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    const wrapper = mountShell({ snapshot });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await clickPortaledMenuItem('Duplicate Agent');

    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu');
    await clickPortaledMenuItem('Fork Agent');

    expect(wrapper.emitted('fork-agent')).toStrictEqual([['agent-dina']]);

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await clickPortaledMenuItem('Restart Agent');

    expect(wrapper.emitted('restart-agent')).toStrictEqual([['agent-dina']]);
  });

  it('loads existing remote teams for the Team dialog from the selected connection backend', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.remoteConnections.connections = [{
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      status: 'ready',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.teams = [{
      id: 'team-remote',
      name: 'Remote Core',
      color: '#277da1',
      agentIds: [],
    }];
    const getLoopSnapshot = vi.fn().mockResolvedValue(remoteSnapshot);
    const wrapper = mountShell({ snapshot, getLoopSnapshot });

    const loadRemoteTeams = wrapper.findComponent({ name: 'TeamDialog' }).props('loadRemoteTeams') as (connectionId: string) => Promise<Team[]>;
    await expect(loadRemoteTeams('connection-devbox')).resolves.toStrictEqual(remoteSnapshot.teams);

    expect(getLoopSnapshot).toHaveBeenCalledWith({
      kind: 'remote',
      remoteConnectionId: 'connection-devbox',
    });
  });

  it('forwards agent move targets from the context menu', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const wrapper = mountShell({ snapshot });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await clickPortaledMenuItem('Skwad');

    expect(wrapper.emitted('move-agent-to-team')).toStrictEqual([[{
      agentId: 'agent-dina',
      teamId: 'team-skwad',
    }]]);
  });

  it('emits keyboard shortcut actions for active teams and agents', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    window.codexClaw = {
      browserOpen: vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false }),
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible: vi.fn().mockResolvedValue(undefined),
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const openAgentGitDiff = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, openAgentGitDiff });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, cancelable: true }));
    await flushPromises();
    expect(openAgentGitDiff).toHaveBeenCalledWith('agent-dina');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'Browser']);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', code: 'Backquote', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true }));
    await wrapper.setProps({ activeAgent: snapshot.agents[1] } as Record<string, unknown>);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, shiftKey: true, cancelable: true }));

    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('restart-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('close-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('select-team')).toStrictEqual([['team-skwad']]);
    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse'], ['agent-dina']]);
  });

  it('opens active-agent quick file search with Command-P and previews the keyboard selection', async () => {
    const previewAgentFile = vi.fn().mockResolvedValue({
      path: 'src/main.ts', size: 12, kind: 'text', content: 'export {}',
    });
    const wrapper = mountShell({
      agentFiles: [{ name: 'main.ts', path: 'src/main.ts' }],
      previewAgentFile,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true, cancelable: true }));
    await flushPromises();
    const quickOpen = wrapper.getComponent({ name: 'FileQuickOpen' });
    await quickOpen.get('.file-quick-open__results button').trigger('click');
    await flushPromises();

    expect(previewAgentFile).toHaveBeenCalledWith('agent-dina', 'src/main.ts');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toContain('main.ts');
  });

  it('reveals delayed Command-number hints and switches to the numbered agent', async () => {
    vi.useFakeTimers();
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell();
    try {
      expect(wrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }));
      await nextTick();
      expect(wrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);

      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
      vi.advanceTimersByTime(350);
      await nextTick();
      expect(wrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }));
      vi.advanceTimersByTime(350);
      await nextTick();
      expect(wrapper.findAll('.agent-sidebar__quick-switch-shortcut').map((shortcut) => shortcut.text()))
        .toStrictEqual(['⌘1', '⌘2']);

      listener({ type: 'open-agent-composer', prompt: '/compact', submit: true });
      await nextTick();
      expect(wrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);
      expect(wrapper.emitted('send-agent-prompt')).toStrictEqual([[
        { agentId: 'agent-dina', prompt: '/compact' },
      ]]);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }));
      vi.advanceTimersByTime(350);
      await nextTick();

      const switchEvent = new KeyboardEvent('keydown', {
        key: '2',
        metaKey: true,
        cancelable: true,
      });
      window.dispatchEvent(switchEvent);
      await nextTick();
      expect(switchEvent.defaultPrevented).toBe(true);
      expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-dina'], ['agent-jesse']]);
      expect(wrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);

      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
      await nextTick();
      expect(wrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);
      expect(wrapper.findAll('.agent-sidebar__status')).toHaveLength(2);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('handles active app commands from the main-process menu channel', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    let listener: (command: AppCommand) => void = () => undefined;
    const unsubscribe = vi.fn();
    const onAppCommand = vi.fn((nextListener: (command: AppCommand) => void) => {
      listener = nextListener;
      return unsubscribe;
    });
    window.codexClaw = {
      onAppCommand,
      browserOpen: vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false }),
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible: vi.fn().mockResolvedValue(undefined),
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const snapshot = createInitialSnapshot();
    snapshot.general.agentListCompact = true;
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const quit = vi.fn().mockResolvedValue(undefined);
    const openAgentGitDiff = vi.fn().mockResolvedValue(undefined);
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, quit, openAgentGitDiff, updateSettings });

    expect(onAppCommand).toHaveBeenCalledOnce();
    expect(wrapper.getComponent({ name: 'AgentSidebar' }).props('compact')).toBe(true);
    listener({ type: 'open-whats-new' });
    await nextTick();
    expect(wrapper.getComponent({ name: 'WhatsNewDialog' }).props('visible')).toBe(true);
    wrapper.getComponent({ name: 'WhatsNewDialog' }).vm.$emit('close');
    await nextTick();
    expect(wrapper.getComponent({ name: 'WhatsNewDialog' }).props('visible')).toBe(false);
    listener({ type: 'set-agent-list-compact', compact: false });
    await nextTick();
    expect(updateSettings).toHaveBeenCalledWith({ general: { agentListCompact: false } });
    listener({ type: 'new-team' });
    await nextTick();
    expect(wrapper.text()).toContain('Create Team');
    await wrapper.findAll('button').find((button) => button.text() === 'Cancel')?.trigger('click');
    await nextTick();
    listener({ type: 'new-agent' });
    await nextTick();
    expect(wrapper.text()).toContain('New agent');
    await wrapper.findAll('button').find((button) => button.text() === 'Cancel')?.trigger('click');
    await nextTick();
    listener({ type: 'close-active-agent' });
    listener({ type: 'close-active-team' });
    listener({ type: 'quit' });
    listener({ type: 'cycle-teams' });
    listener({ type: 'cycle-agents', direction: 1 });
    listener({ type: 'duplicate-active-agent' });
    listener({ type: 'restart-active-agent' });
    listener({ type: 'open-review' });
    listener({ type: 'open-browser' });
    listener({ type: 'edit-active-agent' });
    await nextTick();
    await flushPromises();

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-skwad']]);
    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
    expect(wrapper.emitted('close-agent')).toStrictEqual([['agent-dina']]);
    expect(confirm).toHaveBeenCalledWith(
      'Agents and messages in Codex Claw will be removed from Codex Claw.',
      'Close Codex Claw?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('close-team')).toStrictEqual([['team-codex-claw']]);
    expect(quit).toHaveBeenCalledOnce();
    expect(wrapper.emitted('duplicate-agent')).toStrictEqual([['agent-dina']]);
    expect(wrapper.emitted('restart-agent')).toStrictEqual([['agent-dina']]);
    expect(openAgentGitDiff).toHaveBeenCalledWith('agent-dina');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'Browser']);
    expect(wrapper.text()).toContain('Edit agent');

    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('persists repository icons selected from the session sidebar', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.general.repositoryIcons = {
      '/src/existing': '🦞',
      '/src/codex-claw': '🧪',
    };
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, updateSettings });
    const sidebar = wrapper.getComponent({ name: 'AgentSidebar' });

    expect(sidebar.props('repositoryIcons')).toStrictEqual({
      '/src/existing': '🦞',
      '/src/codex-claw': '🧪',
    });
    sidebar.vm.$emit('update-repository-icon', {
      repositoryKey: 'git@github.com:nbonamy/codex-claw.git',
      repositoryRoot: '/src/codex-claw',
      icon: '🚀',
    });
    await flushPromises();

    expect(updateSettings).toHaveBeenCalledWith({
      general: {
        repositoryIcons: {
          '/src/existing': '🦞',
          'git@github.com:nbonamy/codex-claw.git': '🚀',
        },
      },
    });
  });

  it('opens deterministic Markdown and approval fixtures from Debug commands', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell();

    listener({
      type: 'debug-image-annotation',
      imageDataUrl: 'data:image/png;base64,debug-image',
      pixelRatio: 2,
    });
    await flushPromises();

    expect(wrapper.getComponent({ name: 'ImageAnnotationDialog' }).props('visible')).toBe(true);
    expect(wrapper.getComponent({ name: 'ImageAnnotationDialog' }).props('imageSrc'))
      .toBe('data:image/png;base64,debug-image');
    expect(wrapper.getComponent({ name: 'ImageAnnotationDialog' }).props('initialPixelRatio')).toBe(2);
    wrapper.getComponent({ name: 'ImageAnnotationDialog' }).vm.$emit('image-error');
    await flushPromises();
    expect(wrapper.getComponent({ name: 'ImageAnnotationDialog' }).props('imageSrc'))
      .toBe('data:image/png;base64,centered-fallback');
    expect(wrapper.getComponent({ name: 'ImageAnnotationDialog' }).props('initialPixelRatio')).toBe(1);
    wrapper.getComponent({ name: 'ImageAnnotationDialog' }).vm.$emit('close');
    await nextTick();
    expect(wrapper.getComponent({ name: 'ImageAnnotationDialog' }).props('visible')).toBe(false);

    listener({ type: 'debug-open-markdown' });
    await nextTick();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Debug Markdown']);
    expect(wrapper.get('.markdown-panel').text()).toContain('Opened from the Codex Claw Debug menu.');

    listener({ type: 'debug-approval-request' });
    await nextTick();
    expect(conversationControllerState(wrapper).thread?.approvals).toStrictEqual([expect.objectContaining({
      id: 'debug-approval-request',
      title: 'Allow debug command',
      command: 'npm test -- --run debug-fixture',
    })]);

    await conversationControllerActions(wrapper).resolveApproval?.(
      'debug-approval-request',
      'approve',
      'once',
    );
    await nextTick();

    expect(conversationControllerState(wrapper).thread?.approvals).toStrictEqual([]);
    expect(wrapper.emitted('resolve-approval')).toBeUndefined();

    listener({ type: 'debug-mark-unread' });
    await nextTick();
    expect(wrapper.emitted('debug-mark-unread')).toStrictEqual([[]]);
  });

  it('attaches an Appshot command to the active agent composer', async () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const attachment: CodexNativeAttachment = {
      id: 'appshot-image',
      type: 'image',
      reference: 'electron-attachment:appshot',
      name: 'electron-appshot.png',
      mimeType: 'image/png',
      size: 3,
      previewUrl: 'data:image/png;base64,YXBw',
    };
    const ingestAttachments = vi.fn().mockResolvedValue([attachment]);
    (window as Window & { codexAppSdkNative?: Partial<CodexNativeRendererApi> }).codexAppSdkNative = {
      capabilities: {
        attachments: true,
        clipboard: true,
        externalLinks: true,
        transcription: false,
      },
      ingestAttachments,
    };
    const wrapper = mountShell();

    listener({
      type: 'attach-appshot',
      imageDataUrl: 'data:image/png;base64,YXBw',
      appName: 'Electron',
      windowTitle: 'Codex Claw',
      accessibilityText: 'Visible and offscreen text',
    });
    await flushPromises();

    expect(ingestAttachments).toHaveBeenCalledWith([{
      name: expect.stringMatching(/^electron-appshot-\d+\.png$/u),
      mimeType: 'image/png',
      data: expect.any(ArrayBuffer),
    }]);
    expect(wrapper.emitted('update:composerAttachments')).toContainEqual([{
      agentId: 'agent-dina',
      attachments: [attachment],
    }]);
  });

  it('selects a deep-linked agent and submits its prompt by default', async () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    listener({
      type: 'open-agent-composer',
      agentId: 'agent-jesse',
      prompt: 'Measure five active conversations',
      submit: true,
    });
    await nextTick();

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
    expect(wrapper.emitted('send-agent-prompt')).toStrictEqual([[
      {
        agentId: 'agent-jesse',
        prompt: 'Measure five active conversations',
      },
    ]]);
    expect(wrapper.emitted('update:composerState')).toBeUndefined();
    expect(wrapper.emitted('sendPrompt')).toBeUndefined();
  });

  it('opens Settings from the native app command', async () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const wrapper = mountShell();

    listener({ type: 'open-settings' });
    await nextTick();

    expect(wrapper.find('.settings-view').exists()).toBe(true);
  });

  it('prefills a deep-linked agent composer when submission is disabled', async () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    listener({
      type: 'open-agent-composer',
      agentId: 'agent-jesse',
      prompt: 'Measure five active conversations',
      submit: false,
    });
    await nextTick();

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
    expect(wrapper.emitted('update:composerState')).toStrictEqual([[
      {
        agentId: 'agent-jesse',
        state: {
          text: 'Measure five active conversations',
          selectionStart: 33,
          selectionEnd: 33,
        },
      },
    ]]);
    expect(wrapper.emitted('sendPrompt')).toBeUndefined();
    expect(wrapper.emitted('send-agent-prompt')).toBeUndefined();
  });

  it('opens a model-requested URL in the active agent browser workspace', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    let listener: (command: AppCommand) => void = () => undefined;
    const browserOpen = vi.fn().mockResolvedValue({
      url: 'https://example.com/',
      title: 'Example',
      canGoBack: false,
      canGoForward: false,
    });
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
      browserOpen,
      browserSetBounds: vi.fn().mockResolvedValue(undefined),
      browserSetVisible: vi.fn().mockResolvedValue(undefined),
      browserClose: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => vi.fn()),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    listener({
      type: 'open-browser',
      agentId: 'agent-dina',
      url: 'https://example.com',
    });
    await nextTick();
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Browser']);
    expect(browserOpen).toHaveBeenCalledWith('agent-dina', 'primary', 'https://example.com');
  });

  it('ignores active-agent shortcuts when no agent is selected', () => {
    const snapshot = createEmptySnapshot();
    const wrapper = mountShell({
      snapshot,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', code: 'Backquote', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true }));

    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();
    expect(wrapper.emitted('close-agent')).toBeUndefined();
    expect(wrapper.emitted('select-team')).toBeUndefined();
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('ignores active-agent app commands when no agent or team can handle them', () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createEmptySnapshot();
    snapshot.teams = [];
    snapshot.activeTeamId = null;
    const wrapper = mountShell({ snapshot });

    listener({ type: 'close-active-agent' });
    listener({ type: 'duplicate-active-agent' });
    listener({ type: 'restart-active-agent' });
    listener({ type: 'edit-active-agent' });
    listener({ type: 'close-active-team' });

    expect(wrapper.emitted('close-agent')).toBeUndefined();
    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();
    expect(wrapper.emitted('restart-agent')).toBeUndefined();
    expect(wrapper.text()).not.toContain('Edit Agent');
    expect(wrapper.emitted('close-team')).toBeUndefined();
  });

  it('does not fire keyboard shortcuts while a dialog is open', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    await wrapper.findAll('.agent-sidebar__agent')[0]!.trigger('contextmenu');
    await clickPortaledMenuItem('Edit Agent');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, cancelable: true }));

    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('does not fire app commands while a dialog is open', async () => {
    let listener: (command: AppCommand) => void = () => undefined;
    window.codexClaw = {
      onAppCommand: vi.fn((nextListener: (command: AppCommand) => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    } as Partial<CodexClawApi> as CodexClawApi;
    const snapshot = createInitialSnapshot();
    const wrapper = mountShell({ snapshot });

    listener({ type: 'edit-active-agent' });
    await nextTick();
    listener({ type: 'duplicate-active-agent' });
    listener({ type: 'cycle-agents', direction: 1 });

    expect(wrapper.emitted('duplicate-agent')).toBeUndefined();
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });
});

function mountShell(overrides: Partial<{
  snapshot: AppSnapshot;
  agentFiles: AgentFileSearchItem[];
  previewAgentFile: (agentId: string, path: string) => Promise<AgentFilePreviewResult>;
  unreadAgentIds: string[];
  composerAttachments: readonly CodexNativeAttachment[];
  composerState: { text: string; selectionStart: number; selectionEnd: number };
  chooseAgentFolder: () => Promise<string | null>;
  cloneSourceRepository: (input: import('@codex-claw/core/contracts').CloneSourceRepositoryInput) => Promise<SourceRepository>;
  createAgent: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createSourceWorktree: (input: import('@codex-claw/core/contracts').CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  createTeam: (input: CreateTeamInput) => Promise<Team | null | void>;
  listSourceFolders: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSourceRepositories: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  listSourceBranches: (repoPath: string, remoteConnectionId?: string) => Promise<import('@codex-claw/core/contracts').SourceBranch[]>;
  sourceRepositories: SourceRepository[];
  listSourceWorktrees: (repoPath: string, remoteConnectionId?: string) => Promise<SourceWorktree[]>;
  deployBenchTemplateAction: (input: string | DeployBenchTemplateInput) => Promise<Agent | null | void>;
  updateTeam: (input: UpdateTeamInput) => Promise<void>;
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
  updateSettings: (input: UpdateSettingsInput) => Promise<void>;
  createLoop: (input: CreateLoopInput) => Promise<void>;
  updateLoop: (input: UpdateLoopInput) => Promise<void>;
  clearLoopHistory: (loopId: string) => Promise<void>;
  deleteLoopExecution: (loopId: string, executionId: string) => Promise<void>;
  deleteLoop: (loopId: string) => Promise<void>;
  listAgentConversations: (agentId: string) => Promise<ConversationSummary[]>;
  resumeAgentConversation: (agentId: string, ref: BackendConversationRef) => Promise<void>;
  readConversationMessages: (ref: BackendConversationRef, agentId: string) => Promise<RendererMessage[]>;
  openAgentGitDiff: (agentId: string) => Promise<void>;
  configureWorkBacklog: (input: WorkBacklogConfigurationInput) => Promise<void>;
  loadWorkRepositories: (provider: WorkProviderKind) => Promise<WorkRepository[] | void>;
  loadAssignedWorkItems: (provider: WorkProviderKind, location?: LoopLocation) => Promise<WorkItem[] | void>;
  loadGlobalWorkItems: (provider: WorkProviderKind, location?: LoopLocation, query?: import('@codex-claw/core/contracts').GlobalWorkItemQuery) => Promise<import('@codex-claw/core/contracts').WorkItemPage>;
  loadWorkItems: (provider: WorkProviderKind, repositoryId: string, location?: LoopLocation, query?: import('@codex-claw/core/contracts').WorkItemQuery) => Promise<WorkItem[] | void>;
  createWorkItem: (input: import('@codex-claw/core/contracts').CreateWorkItemInput) => Promise<WorkItem>;
  createAgentGitBranch: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitBranchInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  duplicateAgentAction: (agentId: string, options?: { name?: string; select?: boolean }) => Promise<Agent | null>;
  assignWorkItemAction: (payload: { agentId: string; item: WorkItem; prompt?: string }) => Promise<void>;
  loadBench: (location?: BenchLocation) => Promise<void>;
  getLoopSnapshot: (location?: LoopLocation) => Promise<AppSnapshot>;
  remoteBenchByConnectionId: Record<string, BenchTemplate[]>;
  remoteBenchStatusByConnectionId: Record<string, 'notLoaded' | 'loading' | 'loaded' | 'error'>;
  quit: () => Promise<void>;
  workRepositoriesByProvider: Partial<Record<WorkProviderKind, WorkRepository[]>>;
  workItemsByRepository: Record<string, WorkItem[]>;
}> = {}) {
  const snapshot = overrides.snapshot ?? createInitialSnapshot();
  return mount(AppShell, {
    props: {
      snapshot,
      activeAgent: snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId) ?? null,
      unreadAgentIds: overrides.unreadAgentIds ?? [],
      agentFiles: overrides.agentFiles ?? [],
      messages: snapshot.messages,
      isLoading: false,
      isSending: false,
      composerAttachments: overrides.composerAttachments ?? [],
      composerState: overrides.composerState ?? { text: '', selectionStart: 0, selectionEnd: 0 },
      chooseAgentFolder: overrides.chooseAgentFolder ?? vi.fn().mockResolvedValue(null),
      cloneSourceRepository: overrides.cloneSourceRepository ?? vi.fn().mockRejectedValue(new Error('Unavailable')),
      createSourceWorktree: overrides.createSourceWorktree ?? vi.fn().mockResolvedValue({ name: '', path: '' }),
      listSourceFolders: overrides.listSourceFolders ?? vi.fn().mockResolvedValue({ path: '', parentPath: null, entries: [] }),
      listSourceRepositories: overrides.listSourceRepositories ?? vi.fn().mockResolvedValue([]),
      listSourceBranches: overrides.listSourceBranches ?? vi.fn().mockResolvedValue([]),
      sourceRepositories: overrides.sourceRepositories ?? [],
      listSourceWorktrees: overrides.listSourceWorktrees ?? vi.fn().mockResolvedValue([]),
      createAgent: overrides.createAgent ?? vi.fn().mockResolvedValue(undefined),
      createTeam: overrides.createTeam ?? vi.fn().mockResolvedValue(undefined),
      deployBenchTemplateAction: overrides.deployBenchTemplateAction ?? vi.fn().mockResolvedValue(undefined),
      updateTeam: overrides.updateTeam ?? vi.fn().mockResolvedValue(undefined),
      updateAgent: overrides.updateAgent ?? vi.fn().mockResolvedValue(undefined),
      updateSettings: overrides.updateSettings ?? vi.fn().mockResolvedValue(undefined),
      createLoop: overrides.createLoop ?? vi.fn().mockResolvedValue(undefined),
      updateLoop: overrides.updateLoop ?? vi.fn().mockResolvedValue(undefined),
      clearLoopHistory: overrides.clearLoopHistory ?? vi.fn().mockResolvedValue(undefined),
      deleteLoopExecution: overrides.deleteLoopExecution ?? vi.fn().mockResolvedValue(undefined),
      deleteLoop: overrides.deleteLoop ?? vi.fn().mockResolvedValue(undefined),
      listAgentConversations: overrides.listAgentConversations ?? vi.fn().mockResolvedValue([]),
      resumeAgentConversation: overrides.resumeAgentConversation ?? vi.fn().mockResolvedValue(undefined),
      readConversationMessages: overrides.readConversationMessages ?? vi.fn().mockResolvedValue([]),
      openAgentGitDiff: overrides.openAgentGitDiff ?? vi.fn().mockResolvedValue(undefined),
      previewAgentFile: overrides.previewAgentFile ?? vi.fn().mockRejectedValue(new Error('Unavailable')),
      configureWorkBacklog: overrides.configureWorkBacklog ?? vi.fn().mockResolvedValue(undefined),
      loadWorkRepositories: overrides.loadWorkRepositories ?? vi.fn().mockResolvedValue(undefined),
      loadAssignedWorkItems: overrides.loadAssignedWorkItems ?? vi.fn().mockResolvedValue(undefined),
      loadGlobalWorkItems: overrides.loadGlobalWorkItems ?? vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 25, totalItems: 0 }),
      loadWorkItems: overrides.loadWorkItems ?? vi.fn().mockResolvedValue(undefined),
      createWorkItem: overrides.createWorkItem ?? vi.fn().mockRejectedValue(new Error('Unavailable')),
      createAgentGitBranch: overrides.createAgentGitBranch ?? vi.fn().mockResolvedValue({}),
      duplicateAgentAction: overrides.duplicateAgentAction ?? vi.fn().mockResolvedValue(null),
      assignWorkItemAction: overrides.assignWorkItemAction ?? vi.fn().mockResolvedValue(undefined),
      loadBench: overrides.loadBench ?? vi.fn().mockResolvedValue(undefined),
      getLoopSnapshot: overrides.getLoopSnapshot ?? vi.fn().mockResolvedValue(createEmptySnapshot()),
      remoteBenchByConnectionId: overrides.remoteBenchByConnectionId ?? {},
      remoteBenchStatusByConnectionId: overrides.remoteBenchStatusByConnectionId ?? {},
      workRepositoriesByProvider: overrides.workRepositoriesByProvider ?? {},
      workItemsByRepository: overrides.workItemsByRepository ?? {},
      quit: overrides.quit ?? vi.fn().mockResolvedValue(undefined),
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: `
            <section v-if="modelValue" class="agent-dialog-test-shell">
              <slot name="header" />
              <slot />
              <slot name="footer" />
            </section>
          `,
        },
        ElPopover: {
          template: '<div><slot name="reference" /><slot /></div>',
        },
      },
    },
  });
}

function conversationController(wrapper: VueWrapper): CodexConversationPaneController {
  return wrapper.getComponent({ name: 'ConversationPane' }).props('controller') as CodexConversationPaneController;
}

function conversationControllerState(wrapper: VueWrapper): CodexConversationPaneState {
  return resolveConversationControllerValue(conversationController(wrapper).state);
}

function conversationControllerActions(wrapper: VueWrapper): CodexConversationPaneActions {
  return resolveConversationControllerValue(conversationController(wrapper).actions);
}

function resolveConversationControllerValue<T>(source: T | { readonly value: T } | (() => T)): T {
  if (typeof source === 'function') return (source as () => T)();
  if (source && typeof source === 'object' && 'value' in source) return source.value;
  return source as T;
}

async function chooseCustomAgentFolder(wrapper: ReturnType<typeof mountShell>, repositorySelectIndex = 0) {
  wrapper.findComponent({ name: 'AgentDialog' }).findAllComponents({ name: 'ElSelect' })[repositorySelectIndex]?.vm.$emit('update:modelValue', '__custom_folder__');
  await flushPromises();
}

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit drag target',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    authorName: 'nbonamy',
    body: 'Make issue assignment feel obvious.',
    labels: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
    ...overrides,
  };
}

function workItemAssignment(item: WorkItem, agentId: string) {
  return {
    provider: item.provider,
    itemId: item.id,
    agentId,
    assignedAt: '2026-06-09T13:00:00.000Z',
    policy: 'review' as const,
    status: 'inProgress' as const,
  };
}
