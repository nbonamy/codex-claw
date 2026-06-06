import { mount } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TeamRail from '../TeamRail.vue';
import type { Team } from '../../../shared/contracts';

let mountedWrappers: ReturnType<typeof mount>[] = [];

afterEach(() => {
  for (const wrapper of mountedWrappers) {
    wrapper.unmount();
  }
  mountedWrappers = [];
  vi.restoreAllMocks();
});

const teams: Team[] = [
  {
    id: 'team-sk',
    name: 'Skwad',
    avatar: 'SK',
    color: '#46A857',
    agentIds: ['agent-dina'],
  },
  {
    id: 'team-claw',
    name: 'Codex Claw',
    color: '#1B4FB2',
    agentIds: [],
  },
];

describe('TeamRail', () => {
  it('renders teams and marks the active team', () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-claw',
    });

    expect(wrapper.get('[aria-label="Skwad"]').text()).toBe('SK');
    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CC');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('false');
    expect((wrapper.get('[aria-label="Skwad"]').element as HTMLButtonElement).style.backgroundColor).toBe('rgb(70, 168, 87)');
    expect(wrapper.find('.team-rail__window-controls').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Create team"]').exists()).toBe(true);
  });

  it('falls back to team initials when no avatar is set', () => {
    const wrapper = mountRail({
      teams: [teams[1]],
      activeTeamId: null,
    });

    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CC');
  });

  it('emits team selection and new team intents', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('click');
    await wrapper.get('[aria-label="Create team"]').trigger('click');

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-claw']]);
    expect(wrapper.emitted('new-team')).toStrictEqual([[]]);
  });

  it('opens the team menu and emits edit team intents', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu', {
      clientX: 42,
      clientY: 64,
    });
    expect(wrapper.get('[aria-label="Team actions"]').attributes('style')).toContain('left: 42px');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Edit Team')?.trigger('click');

    expect(wrapper.emitted('edit-team')).toStrictEqual([['team-claw']]);
  });

  it('confirms before closing the context-clicked team', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(async () => {
      expect(wrapper.find('.team-context-menu').exists()).toBe(false);
      return 'confirm' as never;
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team')?.trigger('click');

    expect(confirm).toHaveBeenCalledWith(
      'Agents and messages in Codex Claw will be removed from Codex Claw.',
      'Close Codex Claw?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('close-team')).toStrictEqual([['team-claw']]);
  });

  it('keeps floating UI open for inside clicks and closes it for escape or outside clicks', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.get('.team-context-menu').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wrapper.find('.team-context-menu').exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(wrapper.find('.team-context-menu').exists()).toBe(false);

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('.team-context-menu').exists()).toBe(false);
  });

  it('keeps the team when close confirmation is canceled', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
    });
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));

    await wrapper.get('[aria-label="Codex Claw"]').trigger('contextmenu');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team')?.trigger('click');

    expect(wrapper.emitted('close-team')).toBeUndefined();
  });

  it('disables closing when only one team exists', async () => {
    const wrapper = mountRail({
      teams: [teams[0]],
      activeTeamId: 'team-sk',
    });

    await wrapper.get('[aria-label="Skwad"]').trigger('contextmenu');

    const closeItem = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === 'Close Team');
    expect(closeItem?.attributes()).toHaveProperty('disabled');
  });
});

function mountRail(props: { teams: Team[]; activeTeamId: string | null }) {
  const wrapper = mount(TeamRail, {
    attachTo: document.body,
    props,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}
