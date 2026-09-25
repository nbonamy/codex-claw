import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import NewProjectDialog from '../NewProjectDialog.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('NewProjectDialog', () => {
  it('submits a trimmed project name', async () => {
    const wrapper = mount(NewProjectDialog, {
      attachTo: document.body,
      props: { visible: true },
      global: { stubs: { ElDialog: dialogStub } },
    });

    expect(wrapper.find('.claw-form-dialog__footer-left').exists()).toBe(false);
    await wrapper.get('#new-project-name').setValue('  fresh-project  ');
    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('create')).toStrictEqual([['fresh-project', 'codex']]);
  });

  it('keeps invalid nested names in the dialog', async () => {
    const wrapper = mount(NewProjectDialog, {
      attachTo: document.body,
      props: { visible: true },
      global: { stubs: { ElDialog: dialogStub } },
    });

    await wrapper.get('#new-project-name').setValue('../fresh-project');
    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('Use a single folder name without slashes.');
  });
});

const dialogStub = {
  props: ['modelValue'],
  template: `
    <section v-if="modelValue">
      <slot name="header" />
      <slot />
      <slot name="footer" />
    </section>
  `,
};
