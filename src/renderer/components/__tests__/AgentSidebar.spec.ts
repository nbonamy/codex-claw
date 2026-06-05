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
  it('renders the team header, agents, folders, and active selection without Bench chrome', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('.agent-sidebar__header').text()).toContain('CODEX CLAW');
    expect(wrapper.text()).toContain('CODEX CLAW');
    expect(wrapper.text()).not.toContain('Bench');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('~/src/id8');
    expect(wrapper.text()).toContain('Jesse');
    expect(wrapper.text()).toContain('~/src/multi-llm-ts');
    expect(wrapper.find('.agent-sidebar__agent--active').text()).toContain('Dina');
    expect(wrapper.find('.agent-sidebar__agent--active').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[aria-label="Working"]').exists()).toBe(true);
  });

  it('emits agent selection from agent rows', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findAll('.agent-sidebar__agent')[1]?.trigger('click');

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
  });

  it('falls back to name initials when an avatar is not set', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-jesse',
        teamName: 'Codex Claw',
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
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.find('[aria-label="Starting"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Awaiting input"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Error"]').exists()).toBe(true);
  });

  it('surfaces short collaboration statuses in compact rows', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [
          { ...agents[0], statusText: 'Running tests' },
        ],
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Running tests');
    expect(wrapper.text()).not.toContain('~/src/id8');
  });

  it('renders a taller rounded new agent action', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('.agent-sidebar__new').text()).toContain('New Agent');
  });

  it('emits collapse requests from the team header icon', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('[aria-label="Hide agent sidebar"]').trigger('click');

    expect(wrapper.emitted('collapse-sidebar')).toStrictEqual([[]]);
  });
});
