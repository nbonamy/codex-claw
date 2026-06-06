import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentHeader from '../AgentHeader.vue';
import type { Agent, BackendRuntimeStatus } from '../../../shared/contracts';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/id8',
  backend: 'codex',
  backendDefaults: { kind: 'codex' },
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

function mountHeader(backendRuntime: BackendRuntimeStatus, isLoading = false) {
  return mount(AgentHeader, {
    props: {
      agent,
      backendRuntime,
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
    const wrapper = mountHeader({ backend: 'codex', status: 'notConfigured' });

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
      props: { ...props, backendRuntime: { backend: 'codex', status: 'notConfigured' }, isLoading: true },
      global: { plugins: [ElementPlus] },
    }).text()).toContain('Loading');
    expect(mount(AgentHeader, {
      props: { ...props, backendRuntime: { backend: 'codex', status: 'running' }, isLoading: false },
      global: { plugins: [ElementPlus] },
    }).text()).toContain('Connected');
    expect(mount(AgentHeader, {
      props: { ...props, backendRuntime: { backend: 'codex', status: 'error', detail: 'failed' }, isLoading: false },
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
        backendRuntime: { backend: 'codex', status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Running tests');
    expect(wrapper.get('.agent-header__activity-line strong').text()).toBe('Idle');
    expect(wrapper.get('.agent-header__inline-status').text()).toBe('Running tests');
  });

  it.each([
    [{ type: 'working' as const, detail: 'Getting stats...' }, 'Working', 'Getting stats...'],
    [{ type: 'working' as const }, 'Working', 'Working'],
    [{ type: 'starting' as const }, 'Working', 'Starting'],
    [{ type: 'awaitingInput' as const, detail: 'Approval needed' }, 'Blocked', 'Approval needed'],
    [{ type: 'awaitingInput' as const }, 'Blocked', 'Awaiting input'],
    [{ type: 'error' as const, message: 'Tool failed' }, 'Blocked', 'Tool failed'],
  ])('renders expanded state label and status detail for %s', (status, stateLabel, detail) => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent: {
          ...agent,
          status,
        },
        backendRuntime: { backend: 'codex', status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('.agent-header__activity-line strong').text()).toBe(stateLabel);
    expect(wrapper.text()).toContain(detail);
    expect(wrapper.text()).toContain('Git status pending');
  });

  it('renders an empty identity when no agent is selected', () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent: null,
        backendRuntime: { backend: 'codex', status: 'notConfigured' },
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
        backendRuntime: { backend: 'codex', status: 'running' },
        isLoading: false,
        sidebarCollapsed: true,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('Idle');
    expect(wrapper.text()).toContain('~/src/id8');
    expect(wrapper.text()).not.toContain('Git status pending');

    await wrapper.get('[aria-label="Show agent sidebar"]').trigger('click');

    expect(wrapper.emitted('expand-sidebar')).toStrictEqual([[]]);
  });
});
