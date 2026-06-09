import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import ChatComposerActionMenu from '../ChatComposerActionMenu.vue';

describe('ChatComposerActionMenu', () => {
  it('closes when clicking outside the menu', async () => {
    const wrapper = mountMenu();

    await wrapper.get('.chat-composer-action-menu__button').trigger('click');
    expect(wrapper.find('.chat-composer-action-menu').exists()).toBe(true);

    document.body.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.chat-composer-action-menu').exists()).toBe(false);
  });

  it('does not open when disabled', async () => {
    const wrapper = mountMenu({ disabled: true });

    await wrapper.get('.chat-composer-action-menu__button').trigger('click');

    expect(wrapper.find('.chat-composer-action-menu').exists()).toBe(false);
  });

  it('shows Codex approval presets and emits selected mode', async () => {
    const wrapper = mountMenu({
      codexApprovalPreset: 'full-access',
      showCodexApprovalMenu: true,
    });

    await wrapper.get('.chat-composer-action-menu__button').trigger('click');

    expect(wrapper.text()).toContain('Approval');
    expect(wrapper.text()).toContain('Ask for approval');
    expect(wrapper.text()).toContain('Approve for me');
    expect(wrapper.text()).toContain('Full access');
    expect(wrapper.find('.app-menu__chevron').exists()).toBe(true);
    await wrapper.findAll('[role="menuitemradio"]')[1]?.trigger('click');

    expect(wrapper.emitted('selectCodexApprovalPreset')).toStrictEqual([['approve-for-me']]);
    expect(wrapper.find('.chat-composer-action-menu').exists()).toBe(false);
  });
});

function mountMenu(props: Partial<{
  codexApprovalPreset: 'ask-for-approval' | 'approve-for-me' | 'full-access' | null;
  disabled: boolean;
  planMode: boolean;
  showCodexApprovalMenu: boolean;
}> = {}) {
  return mount(ChatComposerActionMenu, {
    props: {
      disabled: false,
      codexApprovalPreset: null,
      planMode: false,
      showCodexApprovalMenu: false,
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [ElementPlus],
    },
  });
}
