import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentSidebar from '../AgentSidebar.vue';
import type { Agent } from '../../../shared/contracts';

const agents: Agent[] = [
  {
    id: 'agent-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '~/src/id8',
    status: { type: 'idle' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'agent-jesse',
    name: 'Jesse',
    folder: '~/src/multi-llm-ts',
    status: { type: 'working', detail: 'Testing' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
];

describe('AgentSidebar', () => {
  it('renders agents, folders, bench count, and active selection', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        benchCount: 2,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Codex Claw');
    expect(wrapper.text()).toContain('Bench 2');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('~/src/id8');
    expect(wrapper.text()).toContain('Jesse');
    expect(wrapper.text()).toContain('~/src/multi-llm-ts');
    expect(wrapper.find('.agent-sidebar__agent--active').text()).toContain('Dina');
    expect(wrapper.find('[aria-label="Working"]').exists()).toBe(true);
  });

  it('falls back to name initials when an avatar is not set', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-jesse',
        benchCount: 0,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.find('.agent-sidebar__agent--active .agent-sidebar__avatar').text()).toBe('JE');
  });

  it('labels non-idle statuses for assistive tech', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [
          { ...agents[0], id: 'starting', status: { type: 'starting' } },
          { ...agents[0], id: 'awaiting', status: { type: 'awaitingInput' } },
          { ...agents[0], id: 'error', status: { type: 'error', message: 'failed' } },
        ],
        activeAgentId: 'starting',
        benchCount: 0,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.find('[aria-label="Starting"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Awaiting input"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Error"]').exists()).toBe(true);
  });
});
