import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentAvatarPicker from '../AgentAvatarPicker.vue';

describe('AgentAvatarPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a compact popover and emits preset selections', async () => {
    const wrapper = mountPicker();

    await wrapper.get('.agent-avatar-picker__trigger').trigger('click');

    expect(wrapper.find('.agent-avatar-picker__popover').exists()).toBe(true);
    expect(wrapper.findAll('.agent-avatar-picker__preset').map((button) => button.text())).toContain('🤖');

    await wrapper.findAll('.agent-avatar-picker__preset').find((button) => button.text() === '🤖')?.trigger('click');

    expect(wrapper.emitted('update:modelValue')).toStrictEqual([['🤖']]);
    expect(wrapper.find('.agent-avatar-picker__popover').exists()).toBe(false);
  });

  it('emits undefined when initials are selected', async () => {
    const wrapper = mountPicker({ modelValue: '🤖', name: 'Dina Bot' });

    await wrapper.get('.agent-avatar-picker__trigger').trigger('click');
    expect(wrapper.findAll('.agent-avatar-picker__preset')[0].text()).toBe('DB');
    await wrapper.findAll('.agent-avatar-picker__preset')[0].trigger('click');

    expect(wrapper.emitted('update:modelValue')).toStrictEqual([[undefined]]);
  });

  it('opens the image picker from the popover action', async () => {
    const wrapper = mountPicker();
    await wrapper.get('.agent-avatar-picker__hint').trigger('click');
    const input = wrapper.get('input[type="file"]');
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => undefined);

    await wrapper.get('.agent-avatar-picker__choose-image').trigger('click');

    expect(click).toHaveBeenCalledOnce();
    expect(wrapper.find('.agent-avatar-picker__popover').exists()).toBe(true);
  });

  it('opens the image crop dialog after a file is selected and emits cropped image output', async () => {
    const wrapper = mountPicker();
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    class TestFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      readAsDataURL(): void {
        this.result = 'data:image/png;base64,original';
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', TestFileReader);

    await wrapper.get('.agent-avatar-picker__trigger').trigger('click');
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    });
    await input.trigger('change');

    expect(wrapper.findComponent({ name: 'AgentAvatarCropDialog' }).props('visible')).toBe(true);
    await wrapper.findComponent({ name: 'AgentAvatarCropDialog' }).vm.$emit('apply', 'data:image/png;base64,cropped');

    expect(wrapper.emitted('update:modelValue')).toStrictEqual([['data:image/png;base64,cropped']]);
    expect(wrapper.findComponent({ name: 'AgentAvatarCropDialog' }).props('visible')).toBe(false);
  });

  it('ignores empty file selections and non-string reader results', async () => {
    const wrapper = mountPicker();
    class TestFileReader {
      result: string | ArrayBuffer | null = new ArrayBuffer(1);
      onload: (() => void) | null = null;
      readAsDataURL(): void {
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', TestFileReader);

    await wrapper.get('.agent-avatar-picker__trigger').trigger('click');
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [],
    });
    await input.trigger('change');

    expect(wrapper.findComponent({ name: 'AgentAvatarCropDialog' }).props('visible')).toBe(false);

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
    });
    await input.trigger('change');

    expect(wrapper.findComponent({ name: 'AgentAvatarCropDialog' }).props('visible')).toBe(false);
  });

  it('cancels pending image crops without changing the avatar', async () => {
    const wrapper = mountPicker();
    class TestFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      readAsDataURL(): void {
        this.result = 'data:image/png;base64,original';
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', TestFileReader);

    await wrapper.get('.agent-avatar-picker__trigger').trigger('click');
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
    });
    await input.trigger('change');
    await wrapper.findComponent({ name: 'AgentAvatarCropDialog' }).vm.$emit('cancel');

    expect(wrapper.findComponent({ name: 'AgentAvatarCropDialog' }).props('visible')).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('keeps the picker compact and right-aligned inside dialog rows', () => {
    const source = readFileSync(join(import.meta.dirname, '../AgentAvatarPicker.vue'), 'utf8');

    expect(source).toContain('justify-self: end;');
    expect(source).toContain('width: 276px;');
    expect(source).toContain('grid-template-columns: repeat(6, var(--space-12));');
  });
});

function mountPicker(props: Partial<{
  modelValue?: string;
  name: string;
}> = {}) {
  return mount(AgentAvatarPicker, {
    props: {
      name: 'Dina',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        AgentAvatarCropDialog: {
          name: 'AgentAvatarCropDialog',
          props: ['visible', 'image'],
          template: '<section v-if="visible" class="crop-dialog"><slot /></section>',
        },
      },
    },
  });
}
