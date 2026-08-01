import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RightWorkspacePanel from '../RightWorkspacePanel.vue';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.codexClaw;
});

function mountPanel(tabs: Array<'review' | 'browser'> = ['review', 'browser'], activeTab: 'review' | 'browser' | null = 'review') {
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
      tabs,
      visible: true,
    },
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
});
