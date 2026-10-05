import { mount, type DOMWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Team } from '@workspace/core/contracts';
import CockpitIcon from '../CockpitIcon.vue';

describe('CockpitIcon', () => {
  it('renders four squares from the first four team colors', () => {
    const wrapper = mount(CockpitIcon, {
      props: {
        teams: [
          team('team-one', '#46A857'),
          team('team-two', '#1B4FB2'),
          team('team-three', '#0093FF'),
          team('team-four', '#D86D3D'),
          team('team-five', '#8F5AFF'),
        ],
      },
    });

    const squares = wrapper.findAll('.cockpit-icon__square');

    expect(squares).toHaveLength(4);
    expect(squareBackgrounds(squares)).toStrictEqual([
      'rgb(70, 168, 87)',
      'rgb(27, 79, 178)',
      'rgb(0, 147, 255)',
      'rgb(216, 109, 61)',
    ]);
  });

  it('leaves missing team squares transparent and refreshes when props change', async () => {
    const wrapper = mount(CockpitIcon, {
      props: {
        teams: [team('team-one', '#46A857')],
      },
    });

    expect(squareBackgrounds(wrapper.findAll('.cockpit-icon__square'))).toStrictEqual([
      'rgb(70, 168, 87)',
      'transparent',
      'transparent',
      'transparent',
    ]);

    await (wrapper as unknown as { setProps: (props: { teams: Pick<Team, 'color'>[] }) => Promise<void> }).setProps({
      teams: [
        team('team-one', '#1B4FB2'),
        team('team-two', '#0093FF'),
      ],
    });

    expect(squareBackgrounds(wrapper.findAll('.cockpit-icon__square'))).toStrictEqual([
      'rgb(27, 79, 178)',
      'rgb(0, 147, 255)',
      'transparent',
      'transparent',
    ]);
  });
});

function squareBackgrounds(squares: DOMWrapper<Element>[]): string[] {
  return squares.map((square) => (square.element as HTMLElement).style.backgroundColor);
}

function team(id: string, color: string): Team {
  return {
    id,
    name: id,
    color,
    agentIds: [],
  };
}
