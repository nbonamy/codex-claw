import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentHeader from '../AgentHeader.vue';
import type { Agent, AgentGitStatus, BackendRuntimeStatus } from '@codex-claw/core/contracts';

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

function mountHeader(backendRuntime: BackendRuntimeStatus, isLoading = false, gitStatus: AgentGitStatus | null = null, workspaceOpen = false) {
  return mount(AgentHeader, {
    props: {
      agent,
      gitStatus,
      backendRuntime,
      workspaceOpen,
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
    expect(wrapper.find('[aria-label="Show agent sidebar"]').exists()).toBe(false);
    expect(wrapper.classes()).toContain('agent-header--with-sidebar-edge');
  });

  it('renders repo diff stats without file count or branch details', () => {
    const wrapper = mountHeader({ backend: 'codex', status: 'running' }, false, {
      folder: '/Users/nbonamy/src/id8',
      branch: 'main',
      ahead: 2,
      behind: 1,
      changedFiles: 3,
      addedLines: 134,
      removedLines: 1,
      hasUntracked: true,
      state: 'dirty',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });

    expect(wrapper.text()).toContain('+134');
    expect(wrapper.text()).toContain('-1');
    expect(wrapper.text()).not.toContain('3 files');
    expect(wrapper.text()).not.toContain('main');
    expect(wrapper.text()).not.toContain('ahead');
    expect(wrapper.findComponent({ name: 'ChatAnimatedDiffStat' }).exists()).toBe(true);
  });

  it('emits a git diff preview request when repo diff stats are clicked', async () => {
    const wrapper = mountHeader({ backend: 'codex', status: 'running' }, false, {
      folder: '/Users/nbonamy/src/id8',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 1,
      addedLines: 12,
      removedLines: 4,
      hasUntracked: false,
      state: 'dirty',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });

    await wrapper.get('[aria-label="Open repository diff"]').trigger('click');

    expect(wrapper.emitted('open-git-diff')).toStrictEqual([[]]);
  });

  it('renders an icon-only right-workspace action in the header', async () => {
    const wrapper = mountHeader({ backend: 'codex', status: 'running' }, false, null, true);
    const workspaceAction = wrapper.get('[aria-label="Toggle right workspace"]');

    expect(workspaceAction.text()).toBe('');
    expect(workspaceAction.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.agent-header__activity').element.lastElementChild).toBe(workspaceAction.element);
    await workspaceAction.trigger('click');

    expect(wrapper.emitted('toggle-workspace')).toStrictEqual([[]]);
  });

  it('opens the agent folder in its remembered application from the header', async () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent: { ...agent, openInApplication: 'xcode' },
        backendRuntime: { backend: 'codex', status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
        openInAvailable: true,
        openInCatalog: {
          defaultApplication: 'vscode',
          applications: [
            { id: 'vscode', label: 'VS Code' },
            { id: 'xcode', label: 'Xcode' },
          ],
        },
      },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.get('[aria-label="Open in Xcode"]').trigger('click');

    expect(wrapper.emitted('open-in')).toStrictEqual([['xcode']]);
  });

  it('shows the execution-plan toggle only when a plan is available', async () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent,
        backendRuntime: { backend: 'codex', status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
        executionPlanAvailable: true,
        executionPlanOpen: true,
      },
      global: { plugins: [ElementPlus] },
    });

    const planAction = wrapper.get('[aria-label="Toggle execution plan"]');
    expect(planAction.attributes('aria-pressed')).toBe('true');
    await planAction.trigger('click');
    expect(wrapper.emitted('toggle-execution-plan')).toStrictEqual([[]]);

    const hiddenWrapper = mount(AgentHeader, {
      props: {
        agent,
        backendRuntime: { backend: 'codex', status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
        executionPlanAvailable: false,
      },
      global: { plugins: [ElementPlus] },
    });
    expect(hiddenWrapper.find('[aria-label="Toggle execution plan"]').exists()).toBe(false);
  });

  it('places a downloaded update badge in the header and forwards install', async () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent,
        backendRuntime: { backend: 'codex', status: 'running' },
        isLoading: false,
        sidebarCollapsed: false,
        updateStatus: { state: 'downloaded', version: '0.4.0' },
      },
      global: { plugins: [ElementPlus] },
    });

    const badge = wrapper.get('.update-available-badge');
    expect(badge.text()).toBe('Update available');
    await badge.trigger('click');

    expect(wrapper.emitted('install-update')).toStrictEqual([[]]);
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

  it('keeps the full header presentation and emits expand requests when the sidebar is collapsed', async () => {
    const wrapper = mount(AgentHeader, {
      props: {
        agent,
        gitStatus: {
          folder: '/Users/nbonamy/src/id8',
          branch: 'main',
          ahead: 0,
          behind: 0,
          changedFiles: 1,
          addedLines: 12,
          removedLines: 4,
          hasUntracked: false,
          state: 'dirty',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
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
    expect(wrapper.text()).toContain('+12');
    expect(wrapper.text()).toContain('-4');
    expect(wrapper.get('.agent-header__avatar').classes()).toContain('agent-avatar--sm');
    expect(wrapper.classes()).not.toContain('agent-header--sidebar-collapsed');
    expect(wrapper.classes()).not.toContain('agent-header--with-sidebar-edge');

    await wrapper.get('[aria-label="Show agent sidebar"]').trigger('click');

    expect(wrapper.emitted('expand-sidebar')).toStrictEqual([[]]);
  });
});
