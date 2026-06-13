import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkbenchLayout from '../WorkbenchLayout.vue';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];

  disconnect = vi.fn();
  observe = vi.fn();

  constructor(public callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
}

describe('WorkbenchLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
  });

  it('measures header and footer offsets for child scrolling layouts', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const wrapper = mount(WorkbenchLayout, {
      props: {
        scrollMode: 'child',
      },
      slots: {
        default: '<div class="body-child">Messages</div>',
        footer: '<div class="footer-child">Composer</div>',
        header: '<div class="header-child">Header</div>',
      },
    });

    Object.defineProperty(wrapper.get('.workbench-layout__header').element, 'offsetHeight', { configurable: true, value: 40 });
    Object.defineProperty(wrapper.get('.workbench-layout__footer').element, 'offsetHeight', { configurable: true, value: 72 });
    FakeResizeObserver.instances[0].callback([], FakeResizeObserver.instances[0] as unknown as ResizeObserver);
    await wrapper.vm.$nextTick();

    expect(wrapper.attributes('style')).toContain('--workbench-layout-header-offset: 40px');
    expect(wrapper.attributes('style')).toContain('--workbench-layout-footer-offset: 72px');
    wrapper.unmount();
    expect(FakeResizeObserver.instances[0].disconnect).toHaveBeenCalled();
  });

  it('renders body scrolling mode without resize observers when chrome is absent', () => {
    const wrapper = mount(WorkbenchLayout, {
      props: {
        scrollMode: 'body',
      },
      slots: {
        default: '<div>Scrollable body</div>',
      },
    });

    expect(wrapper.find('.workbench-layout__body--scroll').exists()).toBe(true);
    expect(wrapper.text()).toContain('Scrollable body');
  });

  it('skips observing when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    const wrapper = mount(WorkbenchLayout, {
      slots: {
        default: '<div>Body</div>',
        footer: '<div>Footer</div>',
      },
    });

    expect(wrapper.text()).toContain('Footer');
    expect(FakeResizeObserver.instances).toHaveLength(0);
  });
});
