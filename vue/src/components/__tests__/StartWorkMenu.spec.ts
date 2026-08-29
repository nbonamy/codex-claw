import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it } from 'vitest';
import StartWorkMenu from '../StartWorkMenu.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('StartWorkMenu', () => {
  it('offers project acquisition from a prominent new-session trigger', async () => {
    const wrapper = mount(StartWorkMenu, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.get('[aria-label="New session"]').text()).toBe('New session');
    await wrapper.get('[aria-label="New session"]').trigger('click');

    expect(document.body.textContent).toContain('Add project from');
    expect(document.body.textContent).toContain('Local folder or repository…');
    expect(document.body.textContent).toContain('GitHub repository…');
    expect(document.body.textContent).toContain('Repository URL…');

    const github = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes('GitHub repository'));
    github!.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('select')).toStrictEqual([['github']]);
  });

});
