import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BrowserPanel from '../BrowserPanel.vue';
import type { MainToRendererEvent } from '@codex-claw/shared/contracts';

class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
}

function mountPanel() {
  let listener: ((event: MainToRendererEvent) => void) | null = null;
  const browserOpen = vi.fn().mockResolvedValue({
    url: '',
    title: '',
    canGoBack: false,
    canGoForward: false,
  });
  const api = {
    browserOpen,
    browserNavigate: vi.fn(),
    browserGoBack: vi.fn(),
    browserGoForward: vi.fn(),
    browserReload: vi.fn(),
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
  Object.defineProperty(window, 'codexClaw', { configurable: true, value: api });
  return { api, browserOpen, emitEvent: (event: MainToRendererEvent) => listener?.(event), wrapper: mount(BrowserPanel, { props: { agentId: 'agent-1', visible: true } }) };
}

describe('BrowserPanel', () => {
  it('opens an isolated browser for the active agent and exposes annotation mode', async () => {
    const { api, browserOpen, wrapper } = mountPanel();
    await flushPromises();

    expect(browserOpen).toHaveBeenCalledWith('agent-1', '');
    expect((wrapper.get('[aria-label="Browser address"]').element as HTMLInputElement).value).toBe('');
    expect(api.browserSetBounds).toHaveBeenCalledTimes(1);

    await wrapper.get('.browser-panel__annotate').trigger('click');

    expect(api.browserSetAnnotationMode).toHaveBeenCalledWith(true);
    expect(wrapper.get('.browser-panel__annotation-title').text()).toContain('Annotating');
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
        id: 'annotation-1', kind: 'element', url: 'http://localhost:3000/', comment: 'Translate this.', rect: { x: 8, y: 16, width: 100, height: 40 },
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.get('[aria-label="Exit annotation mode"]').trigger('click');

    expect(wrapper.find('[aria-label="Send 1 annotations"]').exists()).toBe(false);
    expect(api.browserSetAnnotationMode).toHaveBeenLastCalledWith(false);
    expect(api.browserClearAnnotations).toHaveBeenCalledTimes(1);
  });

  it('closes the native browser view before leaving the panel', async () => {
    const { api, wrapper } = mountPanel();
    await flushPromises();

    await wrapper.get('[aria-label="Browser menu"]').trigger('click');
    await wrapper.get('[role="menuitem"]').trigger('click');
    await flushPromises();

    expect(api.browserClose).toHaveBeenCalled();
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });
});
