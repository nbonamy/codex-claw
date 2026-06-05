import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TeamRail from '../TeamRail.vue';
import type { Team } from '../../../shared/contracts';

const teams: Team[] = [
  {
    id: 'team-sk',
    name: 'Skwad',
    avatar: 'SK',
    agentIds: ['agent-dina'],
  },
  {
    id: 'team-claw',
    name: 'Codex Claw',
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
    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CO');
    expect(wrapper.get('[aria-label="Codex Claw"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Skwad"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('.team-rail__window-controls').exists()).toBe(false);
  });

  it('falls back to team initials when no avatar is set', () => {
    const wrapper = mount(TeamRail, {
      props: {
        teams: [teams[1]],
        activeTeamId: null,
      },
    });

    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CO');
  });
});
