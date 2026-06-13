import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import AgentContextMenu from '../AgentContextMenu.vue';
import type { Team } from '@codex-claw/shared/contracts';

let mountedWrappers: ReturnType<typeof mount>[] = [];

afterEach(() => {
  for (const wrapper of mountedWrappers) {
    wrapper.unmount();
  }
  mountedWrappers = [];
});

describe('AgentContextMenu', () => {
  it('renders grouped agent actions at the requested position', () => {
    const wrapper = mountMenu();

    expect(wrapper.attributes('style')).toContain('left: 120px');
    expect(wrapper.attributes('style')).toContain('top: 80px');
    expect(wrapper.findAll('[role="menuitem"]').map((item) => item.text())).toStrictEqual([
      'Edit Agent',
      'Duplicate Agent',
      'Move to Other Team',
      'Save to Bench',
      'Restart Agent',
      'Close Agent',
    ]);
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(2);
  });

  it('emits the selected action', async () => {
    const wrapper = mountMenu();

    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Save to Bench')?.trigger('click');

    expect(wrapper.emitted('action')).toStrictEqual([['save-agent-to-bench']]);
  });

  it('disables move targets when no other teams are available', () => {
    const wrapper = mountMenu();

    const moveItem = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Move to Other Team');
    expect(moveItem?.attributes()).toHaveProperty('disabled');
  });

  it('renders a submenu chevron for move targets', () => {
    const wrapper = mountMenu({
      moveTargets: [
        {
          id: 'team-skwad',
          name: 'Skwad',
          avatar: 'SK',
          color: '#46A857',
          agentIds: [],
        },
      ],
    });

    const moveItem = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Move to Other Team');
    expect(moveItem?.find('.app-menu__chevron').exists()).toBe(true);
  });

  it('emits the selected move target from the submenu', async () => {
    const wrapper = mountMenu({
      moveTargets: [
        {
          id: 'team-skwad',
          name: 'Skwad',
          avatar: 'SK',
          color: '#46A857',
          agentIds: [],
        },
      ],
    });

    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Skwad')?.trigger('click');

    expect(wrapper.emitted('move-agent-to-team')).toStrictEqual([['team-skwad']]);
  });

  it('requests close when the user clicks elsewhere or presses escape', async () => {
    const wrapper = mountMenu();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(wrapper.emitted('close')).toStrictEqual([[], []]);
  });

  it('does not close when the user clicks inside the menu', async () => {
    const wrapper = mountMenu();

    await wrapper.get('.agent-context-menu').trigger('click');

    expect(wrapper.emitted('close')).toBeUndefined();
  });
});

function mountMenu(props: { moveTargets?: Team[] } = {}) {
  const wrapper = mount(AgentContextMenu, {
    props: {
      x: 120,
      y: 80,
      ...props,
    },
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}
