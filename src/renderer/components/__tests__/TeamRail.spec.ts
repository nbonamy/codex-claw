import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { ElMessageBox } from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TeamRail from '../TeamRail.vue';
import type { AccountRateLimits, Team } from '../../../shared/contracts';

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
    expect(wrapper.find('[aria-label="Settings menu"]').exists()).toBe(true);
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

  it('shows rate limits and emits settings menu actions', async () => {
    const wrapper = mountRail({
      teams,
      activeTeamId: 'team-sk',
      rateLimits: {
        limitId: 'codex',
        limitName: 'Codex',
        primary: {
          usedPercent: 32,
          windowDurationMins: 300,
          resetsAt: 1_780_756_682,
        },
        secondary: {
          usedPercent: 50,
          windowDurationMins: 10_080,
          resetsAt: 1_781_140_878,
        },
        credits: null,
        individualLimit: null,
        planType: 'pro',
        rateLimitReachedType: null,
      },
    });

    expect(wrapper.text()).toContain('5h');
    expect(wrapper.text()).toContain('68%');
    expect(wrapper.text()).toContain('Weekly');
    expect(wrapper.text()).toContain('50%');
    await wrapper.findAll('button').find((button) => button.text() === 'Settings')?.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Quit')?.trigger('click');

    expect(wrapper.emitted('open-settings')).toStrictEqual([[]]);
    expect(wrapper.emitted('quit')).toStrictEqual([[]]);
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
    expect(wrapper.get('.team-context-menu').attributes('style')).toContain('left: 42px');
    expect(wrapper.find('[aria-label="Team actions"]').exists()).toBe(true);
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
    await flushPromises();

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

function mountRail(props: { teams: Team[]; activeTeamId: string | null; rateLimits?: AccountRateLimits }) {
  const wrapper = mount(TeamRail, {
    attachTo: document.body,
    props,
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElPopover: {
          template: '<div><slot name="reference" /><slot /></div>',
        },
      },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}
