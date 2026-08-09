import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import WhatsNewDialog from '../WhatsNewDialog.vue';

describe('WhatsNewDialog', () => {
  it('defaults to the current release, navigates release history, and closes from the header', async () => {
    const wrapper = mount(WhatsNewDialog, {
      props: { visible: true },
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElDialog: {
            name: 'ElDialog',
            props: ['modelValue'],
            template: `
              <section v-if="modelValue" class="whats-new-dialog-test-shell">
                <slot name="header" />
                <slot />
              </section>
            `,
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Version 0.8.0');
    expect(wrapper.text()).toContain('What’s new in Codex Claw');
    expect(wrapper.get('h3').text()).toBe('New features');
    expect(wrapper.text()).toContain('Subagents are now visible');

    await wrapper.getComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '0.7.0');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Every composer image');
    expect(wrapper.text()).not.toContain('Subagents are now visible');

    await wrapper.get('[aria-label="Close What’s New"]').trigger('click');
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });
});
