import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import AgentSidebar from '../AgentSidebar.vue';
import type { Agent } from '../../../shared/contracts';

function pointerEvent(type: string, clientX: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event as PointerEvent;
}

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
    expect(wrapper.find('.agent-sidebar__new-icon').exists()).toBe(true);
  });

  it('emits new agent requests from the footer action', async () => {
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

    await wrapper.get('.agent-sidebar__new').trigger('click');

    expect(wrapper.emitted('new-agent')).toStrictEqual([[]]);
  });

  it('opens a small context menu and emits edit agent requests', async () => {
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

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });

    expect(wrapper.find('.agent-sidebar__context-menu').exists()).toBe(true);
    expect(wrapper.get('.agent-sidebar__context-action').text()).toContain('Edit Agent');

    await wrapper.get('.agent-sidebar__context-action').trigger('click');

    expect(wrapper.emitted('edit-agent')).toStrictEqual([['agent-dina']]);
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

  it('renders a clamped sidebar width contract for the shell', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
        width: 180,
        minWidth: 220,
        maxWidth: 420,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.attributes('style')).toContain('--agent-sidebar-width: 220px');
    expect(wrapper.attributes('style')).toContain('--agent-sidebar-min-width: 220px');
    expect(wrapper.attributes('style')).toContain('--agent-sidebar-max-width: 420px');
  });

  it('allows the shell to shrink the sidebar to avatar-only size by default', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
        width: 40,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.attributes('style')).toContain('--agent-sidebar-width: 72px');
    expect(wrapper.attributes('style')).toContain('--agent-sidebar-min-width: 72px');
  });

  it('defines avatar-only responsive rules for the small sidebar', () => {
    const source = readFileSync(join(import.meta.dirname, '../AgentSidebar.vue'), 'utf8');

    expect(source).toContain('@container (max-width: 140px)');
    expect(source).toContain('.agent-sidebar__meta');
    expect(source).toContain('display: none;');
    expect(source).toContain('.agent-sidebar__status');
    expect(source).toContain('position: absolute;');
    expect(source).toContain('.agent-sidebar__new-label');
  });

  it('emits clamped resize widths from the right border drag handle', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
        width: 260,
        minWidth: 220,
        maxWidth: 420,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    const handle = wrapper.get('[aria-label="Resize agent sidebar"]');

    handle.element.dispatchEvent(pointerEvent('pointerdown', 260));
    handle.element.dispatchEvent(pointerEvent('pointermove', 500));
    handle.element.dispatchEvent(pointerEvent('pointerup', 500));

    expect(wrapper.emitted('resize-sidebar')).toStrictEqual([[420]]);
  });

  it('supports keyboard resizing from the right border handle', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
        width: 260,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    const handle = wrapper.get('[aria-label="Resize agent sidebar"]');

    await handle.trigger('keydown', { key: 'ArrowLeft' });
    await handle.trigger('keydown', { key: 'ArrowRight' });

    expect(wrapper.emitted('resize-sidebar')).toStrictEqual([[244], [276]]);
  });
});
