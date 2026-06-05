import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TeamRail from '../TeamRail.vue';
import type { Agent, Team } from '../../../shared/contracts';

const activeAgent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  folder: '~/src/id8',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

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
  it('renders active agent initials and teams', () => {
    const wrapper = mount(TeamRail, {
      props: {
        teams,
        activeAgent,
      },
    });

    expect(wrapper.get('[aria-label="Current agent Dina"]').text()).toBe('DI');
    expect(wrapper.get('[aria-label="Skwad"]').text()).toBe('SK');
    expect(wrapper.get('[aria-label="Codex Claw"]').text()).toBe('CO');
  });

  it('uses the app fallback initials with no active agent', () => {
    const wrapper = mount(TeamRail, {
      props: {
        teams: [],
        activeAgent: null,
      },
    });

    expect(wrapper.get('[aria-label="Current agent"]').text()).toBe('CC');
  });
});
