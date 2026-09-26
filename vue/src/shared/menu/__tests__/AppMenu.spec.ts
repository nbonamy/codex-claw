import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { PencilIcon, SwitchHorizontalIcon } from '../../icons/app-icons';
import AppMenu from '../AppMenu.vue';
import type { AppMenuItem } from '../app-menu';
import '../../../styles/base.css';

describe('AppMenu', () => {
  it('reserves a leading check column without shifting labels or trailing values', async () => {
    const items: AppMenuItem[] = [
      { id: 'branch', type: 'radio', label: 'Branch', value: '+12 -4', checked: false, icon: PencilIcon },
      { id: 'working', type: 'radio', label: 'Uncommitted', value: '+2 -1', checked: true, icon: PencilIcon },
    ];
    const wrapper = mount(AppMenu, { props: { ariaLabel: 'Diff scope', items, checkPosition: 'start' } });
    const rows = wrapper.findAll('[role="menuitemradio"]');
    for (const row of rows) {
      expect(row.element.firstElementChild?.classList.contains('app-menu__check-slot')).toBe(true);
      expect(row.element.lastElementChild?.classList.contains('app-menu__value')).toBe(true);
    }
    expect(rows[0]!.find('.app-menu__check-slot .app-menu__check').exists()).toBe(false);
    expect(rows[1]!.find('.app-menu__check-slot .app-menu__check').exists()).toBe(true);
    await rows[0]!.trigger('click');
    expect(wrapper.emitted('select')).toStrictEqual([['branch']]);
  });

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
    expect(getComputedStyle(wrapper.get('[role="menuitem"]').element).userSelect).toBe('none');
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
      },
  });
}
