import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentAvatarCropDialog from '../AgentAvatarCropDialog.vue';
import * as crop from '../agent-avatar-crop';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentAvatarCropDialog', () => {
  it('renders a focused adjust-avatar modal and emits cropped output', async () => {
    vi.spyOn(crop, 'cropImageDataUrl').mockResolvedValue('data:image/png;base64,cropped');
    const wrapper = mount(AgentAvatarCropDialog, {
      props: {
        image: 'data:image/png;base64,original',
        visible: true,
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElDialog: {
            props: ['modelValue'],
            template: `
              <section v-if="modelValue" class="crop-shell">
                <slot name="header" />
                <slot />
                <slot name="footer" />
              </section>
            `,
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Adjust Avatar');
    expect(wrapper.find('.agent-avatar-crop-dialog__stage img').attributes('src')).toBe('data:image/png;base64,original');
    await wrapper.get('input[type="range"]').setValue('1.5');
    await wrapper.findAll('button').find((button) => button.text() === 'Use Image')?.trigger('click');

    expect(crop.cropImageDataUrl).toHaveBeenCalledWith('data:image/png;base64,original', 1.5);
    expect(wrapper.emitted('apply')).toStrictEqual([['data:image/png;base64,cropped']]);
  });

  it('emits cancel from the close action', async () => {
    const wrapper = mount(AgentAvatarCropDialog, {
      props: {
        image: 'data:image/png;base64,original',
        visible: true,
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElDialog: {
            props: ['modelValue'],
            template: '<section v-if="modelValue"><slot name="header" /><slot /><slot name="footer" /></section>',
          },
        },
      },
    });

    await wrapper.get('[aria-label="Close avatar editor"]').trigger('click');

    expect(wrapper.emitted('cancel')).toStrictEqual([[]]);
  });

  it('does not emit apply when there is no selected image', async () => {
    const applyCrop = vi.spyOn(crop, 'cropImageDataUrl');
    const wrapper = mount(AgentAvatarCropDialog, {
      props: {
        image: null,
        visible: true,
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElDialog: {
            props: ['modelValue'],
            template: '<section v-if="modelValue"><slot name="header" /><slot /><slot name="footer" /></section>',
          },
        },
      },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Use Image')?.trigger('click');

    expect(applyCrop).not.toHaveBeenCalled();
    expect(wrapper.emitted('apply')).toBeUndefined();
  });
});
