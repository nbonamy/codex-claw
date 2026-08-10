import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentSubagentTree, OpenInApplicationCatalog, RendererMessage } from '@codex-claw/core/contracts';
import RightWorkspacePanel from '../RightWorkspacePanel.vue';
import type { RightWorkspaceFilePanel, RightWorkspaceFileTab, RightWorkspaceImagePanel, RightWorkspaceImageTab, RightWorkspaceTab } from '../right-workspace';
import type { SidePanelMarkdownState } from '../side-panel';
import { i18n } from '../../i18n';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.codexClaw;
});

function mountPanel(
  tabs: RightWorkspaceTab[] = ['review', 'browser'],
  activeTab: RightWorkspaceTab | null = 'review',
  filePanels: Partial<Record<RightWorkspaceFileTab, RightWorkspaceFilePanel>> = {},
  planPanel: SidePanelMarkdownState | null = null,
  imagePanels: Partial<Record<RightWorkspaceImageTab, RightWorkspaceImagePanel>> = {},
  openInCatalog?: OpenInApplicationCatalog,
  browserAvailable = true,
  subagent?: {
    tree: AgentSubagentTree;
    loadMessages: (conversationId: string) => Promise<RendererMessage[]>;
  },
) {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  window.codexClaw = {
    browserOpen: vi.fn().mockResolvedValue({ url: '', title: '', canGoBack: false, canGoForward: false }),
    browserSetBounds: vi.fn().mockResolvedValue(undefined),
    browserSetVisible: vi.fn().mockResolvedValue(undefined),
    browserClose: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(() => vi.fn()),
  } as never;
  return mount(RightWorkspacePanel, {
    props: {
      activeTab,
      agent: {
        id: 'agent-1', teamId: 'team-1', name: 'Dina', avatar: 'D', folder: '/repo', backend: 'codex', status: { type: 'idle' }, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      },
      gitPanel: { kind: 'gitDiff', title: 'Review', diff: '', state: 'idle' },
      browserAvailable,
      filePanels,
      imagePanels,
      openInAvailable: Boolean(openInCatalog),
      openInCatalog,
      planPanel,
      tabs,
      visible: true,
      subagentTree: subagent?.tree,
      loadSubagentMessages: subagent?.loadMessages,
    },
    global: { plugins: [i18n] },
  });
}

describe('RightWorkspacePanel', () => {
  it('shows a Claw launcher when no workspace tab has been opened', async () => {
    const wrapper = mountPanel([], null);

    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Review');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Browser');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('⌘G');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('⌘B');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Files');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('⌘P');
    expect(wrapper.text()).not.toContain('Terminal');

    await wrapper.findAll('.right-workspace-panel__launcher button')[0]?.trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button')[1]?.trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button')[2]?.trigger('click');

    expect(wrapper.emitted('openTab')).toStrictEqual([['review'], ['browser'], ['files']]);
  });

  it('switches and closes Browser and Review tabs', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'Browser']);
    expect(wrapper.find('[aria-label="Show file explorer"]').exists()).toBe(false);
    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');
    await wrapper.get('[aria-label="Close Review tab"]').trigger('click');

    expect(wrapper.emitted('selectTab')).toStrictEqual([['browser']]);
    expect(wrapper.emitted('closeTab')).toStrictEqual([['review']]);
  });

  it('renders Files with a collapsible explorer beside supported workspace tabs', async () => {
    const wrapper = mountPanel(['files'], 'files');
    await wrapper.setProps({
      filesPaneOpen: true,
      files: [{ name: 'README.md', path: 'README.md' }],
    });

    expect(wrapper.get('[role="tab"]').text()).toBe('Open file');
    expect(wrapper.get('.right-workspace-panel__files-pane').text()).toContain('README.md');
    expect(wrapper.get('[aria-label="Collapse file explorer"]').attributes('aria-pressed')).toBe('true');

    await wrapper.get('button[title="Preview README.md"]').trigger('click');
    await wrapper.get('[aria-label="Collapse file explorer"]').trigger('click');

    expect(wrapper.emitted('previewFile')).toStrictEqual([['README.md']]);
    expect(wrapper.emitted('toggleFilesPane')).toHaveLength(1);
    await wrapper.setProps({ filesPaneOpen: false });
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(false);

    await wrapper.setProps({ activeTab: 'review', tabs: ['files', 'review'] });
    expect(wrapper.find('.right-workspace-panel__files-pane').exists()).toBe(false);

    await wrapper.setProps({ activeTab: 'files', filesPaneOpen: true });
    expect(wrapper.get('.right-workspace-panel__files-pane').text()).toContain('README.md');
  });

  it('resizes the file explorer with its keyboard-accessible separator', async () => {
    const wrapper = mountPanel(['files'], 'files');
    await wrapper.setProps({ filesPaneOpen: true, filesPaneWidth: 280 });
    vi.spyOn(wrapper.get('.right-workspace-panel__body').element, 'getBoundingClientRect').mockReturnValue({
      bottom: 600, height: 560, left: 0, right: 500, top: 40, width: 500, x: 0, y: 40, toJSON: () => ({}),
    });

    await wrapper.get('[aria-label="Resize file explorer"]').trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('resizeFilesPane')).toStrictEqual([[296]]);
    expect(wrapper.get('.right-workspace-panel__files-shell').attributes('style')).toContain('width: 296px');

    await wrapper.get('[aria-label="Resize file explorer"]').trigger('pointerdown');
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 180 }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('resizeFilesPane')).toStrictEqual([[296], [320]]);
    expect(wrapper.get('.right-workspace-panel__files-shell').attributes('style')).toContain('width: 320px');
    document.dispatchEvent(new MouseEvent('pointerup'));
  });

  it('opens Browser or GitHub Review from the add-tab menu', async () => {
    const wrapper = mountPanel();

    await wrapper.get('[aria-label="Open right workspace tab"]').trigger('click');
    expect(wrapper.findAll('.app-menu__item').map((item) => item.text())).toStrictEqual(['GitHub Review', 'Browser', 'Files']);
    await wrapper.findAll('.app-menu__item')[0]?.trigger('click');

    expect(wrapper.emitted('openTab')).toStrictEqual([['review']]);
  });

  it('omits the embedded Browser when the host does not provide it', async () => {
    const wrapper = mountPanel([], null, {}, null, {}, undefined, false);

    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).toContain('Review');
    expect(wrapper.get('[aria-label="Open a workspace tab"]').text()).not.toContain('Browser');
    await wrapper.get('[aria-label="Open right workspace tab"]').trigger('click');
    expect(wrapper.findAll('.app-menu__item').map((item) => item.text())).toStrictEqual(['GitHub Review', 'Files']);
  });

  it('renders file previews as independently closable workspace tabs', async () => {
    const fileTab = 'file:src%2Fmain.ts' as const;
    const wrapper = mountPanel(['browser', fileTab], fileTab, {
      [fileTab]: {
        kind: 'source',
        title: 'main.ts',
        subtitle: 'src/main.ts',
        content: 'export const ready = true;\n',
        language: 'typescript',
        state: 'idle',
        error: null,
      },
    });
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Browser', 'main.ts']);
    expect(wrapper.get('.source-preview-panel').text()).toContain('ready');
    expect(wrapper.get('[aria-label="Show file explorer"]').attributes('aria-pressed')).toBe('false');

    await wrapper.get('[aria-label="Close main.ts tab"]').trigger('click');
    expect(wrapper.emitted('closeTab')).toStrictEqual([[fileTab]]);
  });

  it('opens project files externally but omits Open In for outside-file previews', async () => {
    const fileTab = 'file:src%2Fmain.ts' as const;
    const projectPanel = {
      kind: 'source' as const,
      title: 'main.ts',
      subtitle: 'src/main.ts',
      content: 'export const ready = true;\n',
      language: 'typescript',
      state: 'idle' as const,
      error: null,
    };
    const catalog: OpenInApplicationCatalog = {
      defaultApplication: 'vscode',
      applications: [{ id: 'vscode', label: 'VS Code' }],
    };
    const wrapper = mountPanel([fileTab], fileTab, { [fileTab]: projectPanel }, null, {}, catalog);

    expect(wrapper.get('.open-in-control').classes()).toContain('open-in-control--compact');
    await wrapper.get('[aria-label="Open in VS Code"]').trigger('click');
    expect(wrapper.emitted('openIn')).toStrictEqual([[
      { application: 'vscode', filePath: 'src/main.ts' },
    ]]);

    const outsideWrapper = mountPanel([fileTab], fileTab, {
      [fileTab]: { ...projectPanel, subtitle: '/outside/main.ts' },
    }, null, {}, catalog);
    expect(outsideWrapper.find('[aria-label="Open in VS Code"]').exists()).toBe(false);
  });

  it('renders Plan Review as a normal tab beside existing workspace tabs', async () => {
    const wrapper = mountPanel(['browser', 'plan'], 'plan', {}, {
      kind: 'markdown',
      purpose: 'plan',
      title: 'Implementation plan',
      content: '# Plan\n\nKeep Browser available.',
      state: 'idle',
      error: null,
    });

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Browser', 'Implementation plan']);
    expect(wrapper.get('.plan-review-panel').text()).toContain('Keep Browser available.');

    await wrapper.findAll('[role="tab"]')[0]?.trigger('click');
    await wrapper.get('[aria-label="Close Implementation plan tab"]').trigger('click');

    expect(wrapper.emitted('selectTab')).toStrictEqual([['browser']]);
    expect(wrapper.emitted('closeTab')).toStrictEqual([['plan']]);
  });

  it('renders conversation images as independently closable workspace tabs', async () => {
    const imageTab = 'image:preview' as const;
    const wrapper = mountPanel([imageTab], imageTab, {}, null, {
      [imageTab]: {
        kind: 'image',
        title: 'diagram.png',
        subtitle: '/repo/diagram.png',
        path: '/repo/diagram.png',
        src: 'data:image/png;base64,aW1hZ2U=',
        alt: 'Architecture diagram',
        mimeType: 'image/png',
        state: 'idle',
        error: null,
      },
    });

    expect(wrapper.get('[role="tab"]').text()).toBe('diagram.png');
    expect(wrapper.get('.image-preview-panel img').attributes()).toMatchObject({
      alt: 'Architecture diagram',
      src: 'data:image/png;base64,aW1hZ2U=',
    });

    await wrapper.get('[aria-label="Close diagram.png tab"]').trigger('click');
    expect(wrapper.emitted('closeTab')).toStrictEqual([[imageTab]]);
  });

  it('renders selected subagents as independent workspace tabs', async () => {
    const loadMessages = vi.fn().mockResolvedValue([]);
    const wrapper = mountPanel(['subagent:thread-scout', 'subagent:thread-reviewer'], 'subagent:thread-reviewer', {}, null, {}, undefined, true, {
      loadMessages,
      tree: {
        rootConversationId: 'thread-root',
        nodes: {
          'thread-scout': {
            conversationId: 'thread-scout',
            parentConversationId: 'thread-root',
            createdAt: '2026-08-01T00:00:00.000Z',
            status: 'running',
            agentPath: '/root/scout',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
          'thread-reviewer': {
            conversationId: 'thread-reviewer',
            parentConversationId: 'thread-root',
            createdAt: '2026-08-01T00:00:01.000Z',
            status: 'completed',
            agentPath: '/root/reviewer',
            agentNickname: 'Harvey',
            updatedAt: '2026-08-01T00:00:01.000Z',
          },
        },
        operations: {},
        activities: {},
      },
    });
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['scout', 'Harvey']);
    expect(wrapper.findAllComponents({ name: 'SubagentPanel' })).toHaveLength(2);
    expect(loadMessages).not.toHaveBeenCalledWith('thread-scout');
    expect(loadMessages).toHaveBeenCalledWith('thread-reviewer');
  });
});
