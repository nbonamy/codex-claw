import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { MissionTicket } from '@codex-claw/core/missions';
import MissionTicketBoard from '../MissionTicketBoard.vue';

const tickets: MissionTicket[] = [
  {
    id: 'mission-ticket-foundation',
    title: 'Create the billing account',
    body: 'Introduce the account model and cover its persistence behavior.',
    repositoryPath: '/Users/nicolas/src/billing-service',
    done: false,
  },
  {
    id: 'mission-ticket-checkout',
    title: 'Add owner checkout',
    body: '## What to build\n\nLet a team owner purchase seats.\n\n## Acceptance criteria\n\n- Payment succeeds',
    repositoryPath: '/Users/nicolas/src/checkout-app',
    done: false,
    dependsOn: [0],
    reference: 'https://example.com/tickets/BILL-2',
  },
];

describe('MissionTicketBoard', () => {
  it('keeps a streaming backlog scannable and opens the full selected ticket', async () => {
    const wrapper = mount(MissionTicketBoard, { props: { tickets }, attachTo: document.body });
    const cards = wrapper.findAll('.mission-ticket-board__card');

    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain('01');
    expect(cards[0]!.text()).toContain('Create the billing account');
    expect(cards[0]!.text()).toContain('billing-service');
    expect(cards[1]!.text()).toContain('After 01');
    expect(wrapper.find('[aria-label="Ticket details"]').exists()).toBe(false);

    await cards[1]!.trigger('click');

    expect(cards[1]!.attributes('aria-expanded')).toBe('true');
    const details = wrapper.get('[aria-label="Ticket details"]');
    expect(details.text()).toContain('Add owner checkout');
    expect(details.text()).toContain('What to build');
    expect(details.text()).toContain('Payment succeeds');
    expect(details.text()).toContain('Blocked by tickets: 01');
    expect(details.text()).toContain('Repository: /Users/nicolas/src/checkout-app');
    expect(details.get('a').attributes('href')).toBe('https://example.com/tickets/BILL-2');

    await details.get('[aria-label="Close ticket details"]').trigger('click');

    expect(wrapper.find('[aria-label="Ticket details"]').exists()).toBe(false);
    expect(document.activeElement).toBe(cards[1]!.element);
    wrapper.unmount();
  });

  it('adds newly created tickets without replacing cards already on the board', async () => {
    const wrapper = mount(MissionTicketBoard, { props: { tickets: tickets.slice(0, 1) } });
    const firstCard = wrapper.get('.mission-ticket-board__card').element;

    await wrapper.setProps({ tickets });

    const cards = wrapper.findAll('.mission-ticket-board__card');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.element).toBe(firstCard);
    expect(cards[1]!.text()).toContain('Add owner checkout');
  });
});
