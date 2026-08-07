import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenInApplicationCatalog } from '@codex-claw/core/contracts';
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
      filePanels,
      imagePanels,
      openInAvailable: Boolean(openInCatalog),
      openInCatalog,
      planPanel,
      tabs,
      visible: true,
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
    expect(wrapper.text()).not.toContain('Terminal');
    expect(wrapper.text()).not.toContain('Files');

    await wrapper.findAll('.right-workspace-panel__launcher button')[0]?.trigger('click');
    await wrapper.findAll('.right-workspace-panel__launcher button')[1]?.trigger('click');

    expect(wrapper.emitted('openTab')).toStrictEqual([['review'], ['browser']]);
  });

  it('switches and closes Browser and Review tabs', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toStrictEqual(['Review', 'Browser']);
    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');
    await wrapper.get('[aria-label="Close Review tab"]').trigger('click');

    expect(wrapper.emitted('selectTab')).toStrictEqual([['browser']]);
    expect(wrapper.emitted('closeTab')).toStrictEqual([['review']]);
  });

  it('opens Browser or GitHub Review from the add-tab menu', async () => {
    const wrapper = mountPanel();

    await wrapper.get('[aria-label="Open right workspace tab"]').trigger('click');
    expect(wrapper.findAll('.app-menu__item').map((item) => item.text())).toStrictEqual(['GitHub Review', 'Browser']);
    await wrapper.findAll('.app-menu__item')[0]?.trigger('click');

    expect(wrapper.emitted('openTab')).toStrictEqual([['review']]);
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
});
