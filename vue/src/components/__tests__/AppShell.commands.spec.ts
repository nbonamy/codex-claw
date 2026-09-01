import { flushPromises } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import type {
  CodexNativeAttachment,
  CodexNativeRendererApi,
} from '@codex-app-sdk/vue';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AppCommand, CodexClawApi, Team } from '@codex-claw/core/contracts';
import { useConfetti } from '../../shared/confetti/use-confetti';

import {
  clickPortaledMenuItem,
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

describe('AppShell dialogs and commands', () => {
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
    const getAutomationSnapshot = vi.fn().mockResolvedValue(remoteSnapshot);
    const wrapper = mountShell({ snapshot, getAutomationSnapshot });

    const loadRemoteTeams = wrapper.findComponent({ name: 'TeamDialog' }).props('loadRemoteTeams') as (connectionId: string) => Promise<Team[]>;
    await expect(loadRemoteTeams('connection-devbox')).resolves.toStrictEqual(remoteSnapshot.teams);

    expect(getAutomationSnapshot).toHaveBeenCalledWith({
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
    const wrapper = mountShell({ snapshot, realAgentSidebar: true });

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
    const wrapper = mountShell({ realAgentSidebar: true });
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
    const wrapper = mountShell({ snapshot, quit, openAgentGitDiff });

    expect(onAppCommand).toHaveBeenCalledOnce();
    expect(wrapper.getComponent({ name: 'AgentSidebar' }).props('compact')).toBe(true);
    listener({ type: 'open-whats-new' });
    await nextTick();
    expect(wrapper.getComponent({ name: 'WhatsNewDialog' }).props('visible')).toBe(true);
    wrapper.getComponent({ name: 'WhatsNewDialog' }).vm.$emit('close');
    await nextTick();
    expect(wrapper.getComponent({ name: 'WhatsNewDialog' }).props('visible')).toBe(false);
    listener({ type: 'new-team' });
    await nextTick();
    expect(wrapper.text()).toContain('Create Team');
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
      repositoryKey: 'remote:github.com/nbonamy/codex-claw',
      repositoryRoot: '/src/codex-claw',
      icon: '🚀',
    });
    await flushPromises();

    expect(updateSettings).toHaveBeenCalledWith({
      general: {
        repositoryIcons: {
          '/src/existing': '🦞',
          'remote:github.com/nbonamy/codex-claw': '🚀',
        },
      },
    });
  });

  it('persists repository group collapse state selected from the session sidebar', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.general.collapsedRepositoryKeys = ['remote:github.com/nbonamy/existing'];
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountShell({ snapshot, updateSettings });

    wrapper.getComponent({ name: 'AgentSidebar' }).vm.$emit('update-collapsed-repositories', [
      'remote:github.com/nbonamy/codex-claw',
    ]);
    await flushPromises();

    expect(updateSettings).toHaveBeenCalledWith({
      general: { collapsedRepositoryKeys: ['remote:github.com/nbonamy/codex-claw'] },
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

    useConfetti().clear();
    listener({ type: 'debug-celebrate', kind: 'stars' });
    await nextTick();
    expect(useConfetti().bursts.value).toEqual([
      expect.objectContaining({ kind: 'stars' }),
    ]);

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
    const wrapper = mountShell({ snapshot, realAgentSidebar: true });

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
