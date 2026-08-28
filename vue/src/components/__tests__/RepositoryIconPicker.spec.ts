import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import RepositoryIconPicker from '../RepositoryIconPicker.vue';

const pickerSource = readFileSync(resolve(process.cwd(), 'src/components/RepositoryIconPicker.vue'), 'utf8');

const popoverStub = {
  template: '<div><slot name="reference" /><slot /></div>',
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RepositoryIconPicker', () => {
  it('gives repository glyphs a larger target and visual size', () => {
    expect(pickerSource).toContain('width: 24px;\n  height: 24px;');
    expect(pickerSource).toContain('.repository-icon-picker__trigger svg {\n  width: 20px;\n  height: 20px;');
  });

  it('selects and clears a repository icon', async () => {
    const wrapper = mount(RepositoryIconPicker, {
      attachTo: document.body,
      props: { label: 'codex-claw' },
      global: { stubs: { 'el-popover': popoverStub } },
    });

    expect(wrapper.attributes('width')).toBe('256');
    expect(wrapper.attributes('popper-class')).toBe('repository-icon-picker-popper');
    await wrapper.get('[aria-label="Change icon for codex-claw"]').trigger('click');
    await flushPromises();
    const preset = wrapper.findAll('.repository-icon-picker__preset').find((button) => button.text() === '🦞')!;
    await preset.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toStrictEqual([['🦞']]);

    await wrapper.setProps({ modelValue: '🦞' });
    await wrapper.get('[aria-label="Change icon for codex-claw"]').trigger('click');
    await flushPromises();
    const reset = wrapper.findAll('button').find((button) => button.text() === 'Reset');
    await reset?.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toStrictEqual([['🦞'], [undefined]]);
  });

  it('accepts one custom grapheme and rejects multiple characters', async () => {
    const wrapper = mount(RepositoryIconPicker, {
      attachTo: document.body,
      props: { label: 'codex-claw' },
      global: { stubs: { 'el-popover': popoverStub } },
    });

    await wrapper.get('[aria-label="Change icon for codex-claw"]').trigger('click');
    await flushPromises();
    const input = wrapper.get('[aria-label="Custom repository icon"]');
    const apply = wrapper.get('[aria-label="Use custom repository icon"]');
    await input.setValue('AB');
    await apply.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    await input.setValue('🦊');
    await apply.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toStrictEqual([['🦊']]);
  });
});
