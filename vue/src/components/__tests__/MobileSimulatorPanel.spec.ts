import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobileSimulatorPanel from '../MobileSimulatorPanel.vue';
import { setElectronTestClient } from '../../test/client';
import type { MobileRequest } from '@workspace/core/mobile-simulator';
const attachment = {
  id: 'session',
  device: { id: 'phone', name: 'iPhone', platform: 'ios' as const, state: 'booted' as const },
};
const frame = {
  attachmentId: 'session',
  data: 'cG5n',
  mimeType: 'image/png' as const,
  width: 1200,
  height: 2400,
  scale: 3,
};
afterEach(() => {
  vi.useRealTimers();
});

function setup(attached = true) {
  vi.useFakeTimers();
  const mobileSimulator = vi.fn(async (_agent: string, input: MobileRequest) => {
    if (input.action === 'attach') attached = true;
    if (input.action === 'detach') attached = false;
    return {
      attachment: attached ? attachment : null,
      ...(input.action === 'list' ? { catalog: { devices: [attachment.device], setup: [] } } : {}),
      ...(input.action === 'screenshot' ? { frame } : {}),
    };
  });
  setElectronTestClient({ mobileSimulator });
  return { mobileSimulator, wrapper: mount(MobileSimulatorPanel, { props: { agentId: 'a', visible: true } }) };
}

describe('MobileSimulatorPanel', () => {
  it('renders the attached native image and maps taps through the displayed image bounds', async () => {
    const { wrapper, mobileSimulator } = setup();
    await flushPromises();
    const image = wrapper.get('img');
    expect(image.attributes('src')).toBe('data:image/png;base64,cG5n');
    vi.spyOn(image.element, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 40,
      left: 20,
      top: 40,
      width: 300,
      height: 600,
      bottom: 640,
      right: 320,
      toJSON: () => ({}),
    });
    image.element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 95, clientY: 190, bubbles: true }));
    image.element.dispatchEvent(new MouseEvent('pointerup', { clientX: 95, clientY: 190, bubbles: true }));
    await flushPromises();
    expect(mobileSimulator).toHaveBeenCalledWith('a', {
      action: 'tap',
      attachmentId: 'session',
      x: 300,
      y: 600,
      width: 1200,
      height: 2400,
    });
    expect(wrapper.text()).not.toContain('Back');
    await image.trigger('keydown', { key: 'h' });
    expect((wrapper.get('[aria-label="Text to type on device"]').element as HTMLInputElement).value).toBe('h');
    expect(mobileSimulator.mock.calls.some(([, input]) => input.action === 'text')).toBe(false);
    await wrapper.get('[aria-label="Text to type on device"]').setValue('hello');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(mobileSimulator).toHaveBeenCalledWith('a', { action: 'text', attachmentId: 'session', text: 'hello' });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Detach')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('Attach');
    wrapper.unmount();
  });

  it('stops capture while hidden and discards a late image when switching agents', async () => {
    const { wrapper, mobileSimulator } = setup();
    await flushPromises();
    await wrapper.get('[aria-label="Text to type on device"]').setValue('private draft');
    await wrapper.setProps({ visible: false });
    mobileSimulator.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mobileSimulator).not.toHaveBeenCalled();
    let finish!: (value: unknown) => void;
    mobileSimulator.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as typeof finish;
        }),
    );
    await wrapper.setProps({ visible: true });
    await wrapper.setProps({ agentId: 'b', visible: false });
    finish({ attachment, frame });
    await flushPromises();
    expect(wrapper.find('img').exists()).toBe(false);
    await wrapper.setProps({ visible: true });
    await flushPromises();
    expect((wrapper.get('[aria-label="Text to type on device"]').element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });

  it('shows recoverable errors and removes stale screen content after native failure', async () => {
    const { wrapper, mobileSimulator } = setup();
    await flushPromises();
    mobileSimulator.mockRejectedValueOnce(new Error('Device disconnected'));
    await vi.advanceTimersByTimeAsync(800);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Device disconnected');
    expect(wrapper.find('img').exists()).toBe(false);
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
