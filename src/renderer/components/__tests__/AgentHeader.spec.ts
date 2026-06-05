import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentHeader from '../AgentHeader.vue';
import type { Agent, AppSnapshot } from '../../../shared/contracts';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/id8',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

function mountHeader(appServer: AppSnapshot['appServer'], isLoading = false) {
  return mount(AgentHeader, {
    props: {
      agent,
      appServer,
      isLoading,
      sidebarCollapsed: false,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

describe('AgentHeader', () => {
  it('renders the expanded active agent identity and activity block', () => {
    const wrapper = mountHeader({ status: 'notConfigured' });

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('~/src/id8');
    expect(wrapper.text()).toContain('Ready to get going');
    expect(wrapper.text()).toContain('Git status pending');
    expect(wrapper.find('[aria-label="Show agent sidebar"]').exists()).toBe(false);
  });

  it('renders loading, running, and error fallback labels without an agent', () => {
    const props = {
      agent: null,
      sidebarCollapsed: false,
    };

    expect(mount(AgentHeader, {
      props: { ...props, appServer: { status: 'notConfigured' }, isLoading: true },
      global: { plugins: [ElementPlus] },
    }).text()).toContain('Loading');
    expect(mount(AgentHeader, {
      props: { ...props, appServer: { status: 'running' }, isLoading: false },
      global: { plugins: [ElementPlus] },
    }).text()).toContain('Connected');
    expect(mount(AgentHeader, {
      props: { ...props, appServer: { status: 'error', detail: 'failed' }, isLoading: false },
      global: { plugins: [ElementPlus] },
    }).text()).toContain('Codex error');
  });

  it('shows the agent collaboration status when one is set', () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent: {
          ...agent,
          statusText: 'Running tests',
        },
        appServer: { status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Running tests');
  });

  it.each([
    [{ type: 'working' as const, detail: 'Getting stats...' }, 'Working', 'Getting stats...'],
    [{ type: 'working' as const }, 'Working', 'Working'],
    [{ type: 'starting' as const }, 'Starting', 'Starting'],
    [{ type: 'awaitingInput' as const, detail: 'Approval needed' }, 'Awaiting input', 'Approval needed'],
    [{ type: 'awaitingInput' as const }, 'Awaiting input', 'Awaiting input'],
    [{ type: 'error' as const, message: 'Tool failed' }, 'Error', 'Tool failed'],
  ])('renders expanded status label and detail for %s', (status, label, detail) => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent: {
          ...agent,
          status,
        },
        appServer: { status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain(label);
    expect(wrapper.text()).toContain(detail);
    expect(wrapper.text()).toContain('Git status pending');
  });

  it('renders an empty identity when no agent is selected', () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent: null,
        appServer: { status: 'notConfigured' },
        isLoading: false,
        sidebarCollapsed: true,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('No agent');
    expect(wrapper.get('[aria-label="Show agent sidebar"]').attributes('aria-label')).toBe('Show agent sidebar');
  });

  it('emits sidebar expand requests from the compact app header icon', async () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent,
        appServer: { status: 'running' },
        isLoading: false,
        sidebarCollapsed: true,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Idle');
    expect(wrapper.text()).not.toContain('~/src/id8');
    expect(wrapper.text()).not.toContain('Git status pending');

    await wrapper.get('[aria-label="Show agent sidebar"]').trigger('click');

    expect(wrapper.emitted('expand-sidebar')).toStrictEqual([[]]);
  });
});
