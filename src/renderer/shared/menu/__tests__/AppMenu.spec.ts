import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import { PencilIcon, SwitchHorizontalIcon } from '../../icons/app-icons';
import AppMenu from '../AppMenu.vue';
import type { AppMenuItem } from '../app-menu';

describe('AppMenu', () => {
  it('renders actions, separators, selected radio state, and submenu chevrons consistently', () => {
    const wrapper = mountMenu([
      {
        id: 'edit',
        type: 'action',
        label: 'Edit',
        icon: PencilIcon,
      },
      { id: 'separator', type: 'separator' },
      {
        id: 'move',
        type: 'submenu',
        label: 'Move',
        icon: SwitchHorizontalIcon,
        items: [
          {
            id: 'team-a',
            type: 'radio',
            label: 'Team A',
            description: 'Current team',
            checked: true,
          },
        ],
      },
    ]);

    expect(wrapper.findAll('[role="menuitem"]').map((item) => item.text())).toStrictEqual([
      'Edit',
      'Move',
    ]);
    expect(wrapper.find('[role="separator"]').exists()).toBe(true);
    expect(wrapper.find('.app-menu__chevron').exists()).toBe(true);
    expect(wrapper.get('[role="menuitemradio"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.text()).toContain('Team A • Current team');
  });

  it('emits selected item ids for root and nested items', async () => {
    const wrapper = mountMenu([
      {
        id: 'edit',
        type: 'action',
        label: 'Edit',
      },
      {
        id: 'move',
        type: 'submenu',
        label: 'Move',
        items: [
          {
            id: 'team-a',
            type: 'action',
            label: 'Team A',
          },
        ],
      },
    ]);

    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Edit')?.trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Team A')?.trigger('click');

    expect(wrapper.emitted('select')).toStrictEqual([['edit'], ['team-a']]);
  });

  it('emits checkbox switch selections through the same select event', async () => {
    const wrapper = mountMenu([
      {
        id: 'plan-mode',
        type: 'checkbox',
        label: 'Plan mode',
        accessory: 'switch',
        checked: false,
      },
    ]);

    await wrapper.get('[role="menuitemcheckbox"]').trigger('click');

    expect(wrapper.emitted('select')).toStrictEqual([['plan-mode']]);
  });
});

function mountMenu(items: AppMenuItem[]) {
  return mount(AppMenu, {
    props: {
      ariaLabel: 'Test menu',
      items,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}
