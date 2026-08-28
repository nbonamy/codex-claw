import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import StartWorkMenu from '../StartWorkMenu.vue';

describe('StartWorkMenu', () => {
  it('offers repository context and project acquisition from the global trigger', async () => {
    const wrapper = mount(StartWorkMenu, {
      props: { repository: { name: 'codex-claw' } },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('[aria-label="Start work"]').trigger('click');

    expect(wrapper.text()).toContain('Start session in');
    expect(wrapper.text()).toContain('codex-claw');
    expect(wrapper.text()).toContain('Local folder or repository…');
    expect(wrapper.text()).toContain('GitHub repository…');
    expect(wrapper.text()).toContain('Repository URL…');

    const github = wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('GitHub repository'));
    await github!.trigger('click');

    expect(wrapper.emitted('select')).toStrictEqual([['github']]);
  });

  it('omits repository context when no session is active', async () => {
    const wrapper = mount(StartWorkMenu, {
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('[aria-label="Start work"]').trigger('click');

    expect(wrapper.text()).not.toContain('Start session in');
    expect(wrapper.findAll('[role="menuitem"]')).toHaveLength(3);
  });
});
