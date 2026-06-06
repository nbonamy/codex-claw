import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TeamRail from '../TeamRail.vue';
import type { Team } from '../../../shared/contracts';

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
    const wrapper = mount(TeamRail, {
      props: {
        teams,
        activeTeamId: 'team-claw',
      },
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
    const wrapper = mount(TeamRail, {
      props: {
        teams: [teams[1]],
        activeTeamId: null,
      },
    });

    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CC');
  });

  it('emits team selection and new team intents', async () => {
    const wrapper = mount(TeamRail, {
      props: {
        teams,
        activeTeamId: 'team-sk',
      },
    });

    await wrapper.get('[aria-label="Codex Claw"]').trigger('click');
    await wrapper.get('[aria-label="Create team"]').trigger('click');

    expect(wrapper.emitted('select-team')).toStrictEqual([['team-claw']]);
    expect(wrapper.emitted('new-team')).toStrictEqual([[]]);
  });
});
