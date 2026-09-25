import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrowserPanel from '../BrowserPanel.vue';
import { setElectronTestClient } from '../../test/client';
import type { MainToRendererEvent } from '@codex-claw/core/contracts';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import GitDiffControl from '../GitDiffControl.vue';

class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getWebContentsId', { configurable: true, value: () => 42 });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'getWebContentsId');
});

function mountPanel(
  props: { initialUrl?: string; openRequestId?: number; visualization?: { path: string; title: string } } = {},
  options: { deferDomReady?: boolean } = {},
) {
  let listener: ((event: MainToRendererEvent) => void) | null = null;
  const browserOpen = vi.fn().mockResolvedValue({
    url: '',
    title: '',
    canGoBack: true,
    canGoForward: true,
  });
  const api = {
    browserOpen,
    browserOpenVisualization: vi.fn().mockResolvedValue({
      url: '',
      title: 'Backlog icon candidates',
      canGoBack: false,
      canGoForward: false,
    }),
    browserNavigate: vi.fn().mockResolvedValue({
      url: 'https://example.com/',
      title: 'Example',
      canGoBack: false,
      canGoForward: false,
    }),
    browserGoBack: vi.fn().mockResolvedValue({ url: 'https://back.example/', title: 'Back', canGoBack: false, canGoForward: true }),
    browserGoForward: vi.fn().mockResolvedValue({ url: 'https://forward.example/', title: 'Forward', canGoBack: true, canGoForward: false }),
    browserReload: vi.fn().mockResolvedValue({ url: 'https://reload.example/', title: 'Reload', canGoBack: true, canGoForward: true }),
    browserSetBounds: vi.fn().mockResolvedValue(undefined),
    browserSetVisible: vi.fn().mockResolvedValue(undefined),
    browserSetAnnotationMode: vi.fn().mockResolvedValue(undefined),
    browserClearAnnotations: vi.fn().mockResolvedValue(undefined),
    browserClose: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn((nextListener) => {
      listener = nextListener;
      return vi.fn();
    }),
  };
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  setElectronTestClient(api);
  const wrapper = mount(BrowserPanel, { props: { agentId: 'agent-1', visible: true, ...props } });
  const emitDomReady = () => wrapper.get('webview').element.dispatchEvent(new Event('dom-ready'));
  if (!options.deferDomReady) queueMicrotask(emitDomReady);
  return { api, browserOpen, emitDomReady, emitEvent: (event: MainToRendererEvent) => listener?.(event), wrapper };
}

describe('BrowserPanel', () => {
  it('waits for the attached guest document before requesting its WebContents ID', async () => {
    const getWebContentsId = vi.fn(() => 42);
    Object.defineProperty(HTMLElement.prototype, 'getWebContentsId', { configurable: true, value: getWebContentsId });
    const { browserOpen, emitDomReady } = mountPanel({}, { deferDomReady: true });

    expect(getWebContentsId).not.toHaveBeenCalled();
    expect(browserOpen).not.toHaveBeenCalled();
    emitDomReady();
    await flushPromises();

    expect(getWebContentsId).toHaveBeenCalledOnce();
    expect(browserOpen).toHaveBeenCalledWith('agent-1', 'primary', '', 42);
  });

  it('keeps a clean browser surface and does not set bounds when guest startup fails', async () => {
    Object.defineProperty(HTMLElement.prototype, 'getWebContentsId', {
      configurable: true,
      value: () => { throw new Error('Guest failed to initialize'); },
    });
    const { api, emitDomReady, wrapper } = mountPanel({}, { deferDomReady: true });

    expect(wrapper.find('.browser-panel__viewport').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Opening browser');
    emitDomReady();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Guest failed to initialize');
    expect(api.browserOpen).not.toHaveBeenCalled();
    expect(api.browserSetBounds).not.toHaveBeenCalled();
  });

  it('keeps the browser page and a header menu in the same visible workspace', async () => {
    const { api, wrapper } = mountPanel();
    await flushPromises();
    const header = mount(GitDiffControl, {
      attachTo: document.body,
      props: {
        agentId: 'agent-1',
        gitStatus: {
          folder: '/src/project', branch: 'main', addedLines: 4, removedLines: 2, changedFiles: 1,
          ahead: 0, behind: 0, hasUntracked: false, state: 'dirty', updatedAt: '2026-09-25T00:00:00Z',
        },
      },
    });
    api.browserSetVisible.mockClear();
    await header.get('.git-diff-control__menu-trigger').trigger('click');
    await flushPromises();
    expect(header.find('[role="menu"]').exists()).toBe(true);
    expect(wrapper.find('.browser-panel__viewport webview').exists()).toBe(true);
    expect(api.browserSetVisible).not.toHaveBeenCalled();
  });

  it('keeps the native browser visible when a tooltip is already present', async () => {
    const tooltip = document.createElement('span');
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.opacity = '0';
    document.body.append(tooltip);
    try {
      const { api } = mountPanel();
      await flushPromises();
      expect(api.browserSetVisible).not.toHaveBeenCalledWith('agent-1', 'primary', false);
    } finally {
      tooltip.remove();
    }
  });
  it('opens an isolated browser for the active agent and exposes annotation mode', async () => {
    const { api, browserOpen, wrapper } = mountPanel();
    await flushPromises();

    expect(browserOpen).toHaveBeenCalledWith('agent-1', 'primary', '', 42);
    expect((wrapper.get('[aria-label="Browser address"]').element as HTMLInputElement).value).toBe('');
    expect(api.browserSetBounds).toHaveBeenCalledTimes(1);

    await wrapper.get('.browser-panel__annotate').trigger('click');

    expect(api.browserSetAnnotationMode).toHaveBeenCalledWith('agent-1', 'primary', true);
    expect(wrapper.get('.browser-panel__annotation-title').text()).toContain('Annotating');
  });

  it('navigates an already-open pane when the model sends another browser request', async () => {
    const { api, wrapper } = mountPanel();
    await flushPromises();

    await wrapper.setProps({ initialUrl: 'https://example.com', openRequestId: 1 } as Record<string, unknown>);
    await flushPromises();

    expect(api.browserNavigate).toHaveBeenCalledWith('agent-1', 'primary', 'https://example.com');
    expect((wrapper.get('[aria-label="Browser address"]').element as HTMLInputElement).value).toBe('https://example.com/');
  });

  it('opens visualization content through the dedicated host API without exposing it as a browser address', async () => {
    const { api, browserOpen, wrapper } = mountPanel({
      visualization: { path: '/tmp/backlog-icon-candidates.html', title: 'Backlog icon candidates' },
    });
    await flushPromises();

    expect(browserOpen).not.toHaveBeenCalled();
    expect(api.browserOpenVisualization).toHaveBeenCalledWith(
      'agent-1',
      'primary',
      '/tmp/backlog-icon-candidates.html',
      'Backlog icon candidates',
      42,
    );
    expect(wrapper.get('.browser-panel__visualization-title').text()).toBe('Backlog icon candidates');
    expect(wrapper.find('[aria-label="Browser address"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Annotate page"]').exists()).toBe(false);
  });

  it('accumulates annotations and sends one scoped prompt when the batch is ready', async () => {
    const { api, emitEvent, wrapper } = mountPanel();
    await flushPromises();
    await wrapper.get('[aria-label="Annotate page"]').trigger('click');

    emitEvent({
      seq: 1,
      type: 'browser.annotationCreated',
      occurredAt: '2026-07-29T00:00:00.000Z',
      payload: {
        id: 'annotation-1',
        agentId: 'agent-1',
        browserId: 'primary',
        kind: 'element',
        url: 'http://localhost:3000/',
        selector: '#save',
        label: 'Save changes',
        comment: 'Keep this on one line on mobile.',
        rect: { x: 8, y: 16, width: 100, height: 40 },
      },
    });
    emitEvent({
      seq: 2,
      type: 'browser.annotationCreated',
      occurredAt: '2026-07-29T00:00:01.000Z',
      payload: {
        id: 'annotation-2',
        agentId: 'agent-1',
        browserId: 'primary',
        kind: 'area',
        url: 'http://localhost:3000/',
        comment: 'Make this button blue.',
        rect: { x: 120, y: 220, width: 160, height: 40 },
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('send-prompt')).toBeUndefined();
    expect(wrapper.find('[aria-label="Browser side panel"]').exists()).toBe(false);

    await wrapper.get('[aria-label="Send 2 annotations"]').trigger('click');

    expect(wrapper.emitted('send-prompt')).toStrictEqual([[
      'Browser annotations on http://localhost:3000/\n\n1. Target: element #save\n   Feedback: Keep this on one line on mobile.\n\n2. Target: selected area at 120,220 (160×40)\n   Feedback: Make this button blue.\n\nInspect the rendered page and make the smallest changes that address every annotation.',
    ]]);
    expect(api.browserClearAnnotations).toHaveBeenCalledTimes(1);
  });

  it('clears every queued annotation when annotation mode is cancelled', async () => {
    const { api, emitEvent, wrapper } = mountPanel();
    await flushPromises();
    await wrapper.get('[aria-label="Annotate page"]').trigger('click');
    emitEvent({
      seq: 1,
      type: 'browser.annotationCreated',
      occurredAt: '2026-07-29T00:00:00.000Z',
      payload: {
        id: 'annotation-1', agentId: 'agent-1', browserId: 'primary', kind: 'element', url: 'http://localhost:3000/', comment: 'Translate this.', rect: { x: 8, y: 16, width: 100, height: 40 },
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.get('[aria-label="Exit annotation mode"]').trigger('click');

    expect(wrapper.find('[aria-label="Send 1 annotations"]').exists()).toBe(false);
    expect(api.browserSetAnnotationMode).toHaveBeenLastCalledWith('agent-1', 'primary', false);
    expect(api.browserClearAnnotations).toHaveBeenCalledTimes(1);
  });

  it('ignores annotations created in another agent browser', async () => {
    const { emitEvent, wrapper } = mountPanel();
    await flushPromises();
    emitEvent({
      seq: 1,
      type: 'browser.annotationCreated',
      occurredAt: '2026-07-29T00:00:00.000Z',
      payload: {
        id: 'annotation-other', agentId: 'agent-2', browserId: 'secondary', kind: 'element', url: 'https://example.com/', comment: 'Ignore this.', rect: { x: 8, y: 16, width: 100, height: 40 },
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[aria-label^="Send "]').exists()).toBe(false);
  });

  it('closes the native browser view before leaving the panel', async () => {
    const { api, wrapper } = mountPanel();
    await flushPromises();

    await wrapper.get('[aria-label="Browser menu"]').trigger('click');
    await wrapper.get('[role="menuitem"]').trigger('click');
    await flushPromises();

    expect(api.browserClose).toHaveBeenCalledWith('agent-1', 'primary');
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('keeps the native view visible while its own menu is open', async () => {
    const { api, wrapper } = mountPanel();
    await flushPromises();
    api.browserSetVisible.mockClear();

    await wrapper.get('[aria-label="Browser menu"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    expect(api.browserSetVisible).not.toHaveBeenCalled();
  });

  it('runs navigation controls, visibility updates, errors, resize, and cleanup', async () => {
    const { api, emitEvent, wrapper } = mountPanel();
    await flushPromises();

    await wrapper.get('[aria-label="Go back"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Go forward"]').trigger('click');
    await flushPromises();
    api.browserReload.mockRejectedValueOnce('reload failed');
    await wrapper.get('[aria-label="Reload page"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not load this page.');

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    window.dispatchEvent(new Event('resize'));
    emitEvent({ seq: 10, type: 'snapshot.updated', payload: createInitialSnapshot(), occurredAt: 'now' });
    emitEvent({
      seq: 11,
      type: 'browser.annotationCreated',
      payload: {
        id: 'annotation-resize',
        agentId: 'agent-2',
        browserId: 'primary',
        url: 'https://example.com/',
        kind: 'element',
        rect: { x: 0, y: 0, width: 1, height: 1 },
      },
      occurredAt: 'now',
    });
    await flushPromises();

    expect(api.browserGoBack).toHaveBeenCalledWith('agent-1', 'primary');
    expect(api.browserGoForward).toHaveBeenCalledWith('agent-1', 'primary');
    expect(api.browserSetVisible).toHaveBeenNthCalledWith(1, 'agent-1', 'primary', false);
    expect(api.browserSetVisible).toHaveBeenNthCalledWith(2, 'agent-1', 'primary', true);
    wrapper.unmount();
    expect(api.browserClose).toHaveBeenCalledWith('agent-1', 'primary');
  });
});
