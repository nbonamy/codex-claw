import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentSidebar from '../AgentSidebar.vue';
import type { Agent, Team } from '@codex-claw/core/contracts';

const agentSidebarSource = readFileSync(resolve(process.cwd(), 'src/components/AgentSidebar.vue'), 'utf8');

function pointerEvent(type: string, clientX: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event as PointerEvent;
}

function dragEvent(type: string, clientY: number): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  const dataTransfer = {
    dropEffect: '',
    effectAllowed: '',
    setData: vi.fn(),
  };

  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
}

function mockRect(element: Element, rect: { top: number; height: number }): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    top: rect.top,
    bottom: rect.top + rect.height,
    height: rect.height,
    left: 0,
    right: 280,
    width: 280,
    x: 0,
    y: rect.top,
    toJSON: () => undefined,
  });
}

function portaledMenuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('.agent-context-menu [role="menuitem"]'));
}

async function clickPortaledMenuItem(label: string): Promise<void> {
  const item = portaledMenuItems().find((candidate) => candidate.textContent?.trim() === label);
  expect(item).toBeDefined();
  item!.click();
  await flushPromises();
}

const agents: Agent[] = [
  {
    id: 'agent-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '~/src/id8',
    workspace: {
      kind: 'git',
      folder: '~/src/id8',
      repositoryName: 'id8',
      repositoryRoot: '~/src/id8',
      branch: 'main',
      isLinkedWorktree: false,
      primaryWorktreeRoot: '~/src/id8',
      originUrl: 'git@github.com:nbonamy/id8.git',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'idle' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'agent-jesse',
    name: 'Jesse',
    folder: '~/src/multi-llm-ts',
    workspace: {
      kind: 'git',
      folder: '~/src/multi-llm-ts',
      repositoryName: 'multi-llm-ts',
      repositoryRoot: '~/src/multi-llm-ts',
      branch: 'feat/testing',
      isLinkedWorktree: false,
      primaryWorktreeRoot: '~/src/multi-llm-ts',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'working', detail: 'Testing' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
];

const teams: Team[] = [
  {
    id: 'team-codex-claw',
    name: 'Codex Claw',
    avatar: 'CC',
    color: '#1B4FB2',
    agentIds: ['agent-dina', 'agent-jesse'],
  },
  {
    id: 'team-skwad',
    name: 'Skwad',
    avatar: 'SK',
    color: '#46A857',
    agentIds: [],
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('AgentSidebar', () => {
  it('renders repository headers, branch sessions, statuses, and active selection without Bench chrome', () => {
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

    expect(wrapper.get('.agent-sidebar__header').text()).toContain('Sessions');
    expect(wrapper.text()).not.toContain('Bench');
    expect(wrapper.text()).toContain('id8');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('multi-llm-ts');
    expect(wrapper.text()).toContain('Jesse');
    expect(wrapper.find('.agent-sidebar__agent--active').text()).toContain('Dina');
    expect(wrapper.find('.agent-sidebar__agent--active').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[aria-label="Working"]').exists()).toBe(true);
  });

  it('collapses and expands a repository by clicking its title', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: { plugins: [ElementPlus] },
    });

    let repositoryTitle = wrapper.findAll('.agent-sidebar__workspace-label')[0]!;
    let firstSession = wrapper.findAll('.agent-sidebar__agent')[0]!;
    expect(firstSession.attributes('style') ?? '').not.toContain('display: none');

    await repositoryTitle.trigger('click');
    expect(firstSession.attributes('style') ?? '').toContain('display: none');
    expect(repositoryTitle.attributes('aria-expanded')).toBe('false');

    repositoryTitle = wrapper.findAll('.agent-sidebar__workspace-label')[0]!;
    await repositoryTitle.trigger('click');
    await wrapper.vm.$nextTick();
    repositoryTitle = wrapper.findAll('.agent-sidebar__workspace-label')[0]!;
    firstSession = wrapper.findAll('.agent-sidebar__agent')[0]!;
    expect(repositoryTitle.attributes('aria-expanded')).toBe('true');
    expect(firstSession.attributes('style') ?? '').not.toContain('display: none');
  });

  it('emits repository-scoped session creation actions', async () => {
    const listRepositoryBranches = vi.fn().mockResolvedValue([{ name: 'main', isDefault: true, worktreePath: '~/src/id8' }]);
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        listRepositoryBranches,
        teamName: 'Codex Claw',
      },
      global: { plugins: [ElementPlus] },
    });

    const sessionMenu = wrapper.findAllComponents({ name: 'ElPopover' }).find((popover) => (
      popover.props('popperClass') === 'claw-popover agent-sidebar__repository-session-menu-popover'
    ));
    await sessionMenu?.vm.$emit('update:visible', true);
    await flushPromises();
    wrapper.findAllComponents({ name: 'AppMenu' }).find((menu) => menu.props('ariaLabel') === 'New session in id8')?.vm.$emit('select', 'default-branch');
    await wrapper.get('[aria-label="Create agent from branch, pull request, or issue"]').trigger('click');

    expect(listRepositoryBranches).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      repositoryRoot: '~/src/id8',
    });
    expect(wrapper.emitted('create-agent-on-branch')).toStrictEqual([[{
      agentId: 'agent-dina',
      repositoryName: 'id8',
      repositoryRoot: '~/src/id8',
      branch: { name: 'main', isDefault: true, worktreePath: '~/src/id8' },
    }]]);
    expect(wrapper.emitted('create-agent-from-repository')).toStrictEqual([[{
      agentId: 'agent-dina',
      repositoryName: 'id8',
      repositoryRoot: '~/src/id8',
    }]]);
  });

  it('renders compact workspace rows with repository headers, branches, and status icons', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        compact: true,
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.classes()).toContain('agent-sidebar--compact');
    expect(wrapper.findAll('.agent-sidebar__workspace-header').map((header) => header.text())).toStrictEqual(['id8', 'multi-llm-ts']);
    expect(wrapper.findAll('.agent-sidebar__meta strong').map((name) => name.text())).toStrictEqual(['Dina', 'Jesse']);
    expect(wrapper.findAll('.agent-sidebar__status')).toHaveLength(2);
    expect(wrapper.find('.agent-sidebar__branch').exists()).toBe(false);
  });

  it('renders and updates repository-specific icons', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        repositoryIcons: { '~/src/id8': '🦞' },
        teamName: 'Codex Claw',
      },
      global: { plugins: [ElementPlus] },
    });

    const picker = wrapper.findAllComponents({ name: 'RepositoryIconPicker' })
      .find((component) => component.props('label') === 'id8')!;
    expect(picker.props('modelValue')).toBe('🦞');
    expect(wrapper.find('.agent-sidebar__workspace-toggle').exists()).toBe(false);
    picker.vm.$emit('update:modelValue', '🚀');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update-repository-icon')).toStrictEqual([
      [{ repositoryKey: 'git@github.com:nbonamy/id8.git', repositoryRoot: '~/src/id8', icon: '🚀' }],
    ]);
  });

  it('replaces an unread agent runtime status with the unread indicator', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        unreadAgentIds: ['agent-jesse'],
        quickSwitchShortcutsVisible: true,
        teamName: 'Codex Claw',
      },
      global: { plugins: [ElementPlus] },
    });

    const rows = wrapper.findAll('.agent-sidebar__agent');
    expect(rows[0]?.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(true);
    expect(rows[1]?.get('.agent-sidebar__status').classes()).toContain('agent-sidebar__status--unread');
    expect(rows[1]?.get('.agent-sidebar__status').attributes('aria-label')).toBe('Unread activity');
    expect(rows[1]?.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);
  });

  it('replaces the first nine status dots with Command-number shortcuts', () => {
    const manyAgents = Array.from({ length: 10 }, (_, index): Agent => ({
      ...agents[0]!,
      id: `agent-${index + 1}`,
      name: `Agent ${index + 1}`,
    }));
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: manyAgents,
        activeAgentId: manyAgents[0]!.id,
        quickSwitchShortcutsVisible: true,
        teamName: 'Codex Claw',
      },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.findAll('.agent-sidebar__quick-switch-shortcut').map((shortcut) => shortcut.text()))
      .toStrictEqual(['⌘1', '⌘2', '⌘3', '⌘4', '⌘5', '⌘6', '⌘7', '⌘8', '⌘9']);
    expect(wrapper.findAll('.agent-sidebar__status')).toHaveLength(1);

    const hiddenWrapper = mount(AgentSidebar, {
      props: {
        agents: manyAgents,
        activeAgentId: manyAgents[0]!.id,
        teamName: 'Codex Claw',
      },
      global: { plugins: [ElementPlus] },
    });
    expect(hiddenWrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);
    expect(hiddenWrapper.findAll('.agent-sidebar__status')).toHaveLength(10);
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

  it('emits agent reorder drops and marks the drop location', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamId: 'team-codex-claw',
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });
    const rows = wrapper.findAll('.agent-sidebar__agent');
    const dinaRow = rows[0];
    const jesseRow = rows[1];
    expect(jesseRow.attributes('draggable')).toBe('true');
    mockRect(dinaRow.element, { top: 100, height: 64 });

    jesseRow.element.dispatchEvent(dragEvent('dragstart', 0));
    dinaRow.element.dispatchEvent(dragEvent('dragover', 108));
    await wrapper.vm.$nextTick();

    expect(dinaRow.classes()).toContain('list-reorder-drag--drop-before');

    dinaRow.element.dispatchEvent(dragEvent('drop', 108));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('reorder-agents')).toStrictEqual([[
      {
        teamId: 'team-codex-claw',
        agentId: 'agent-jesse',
        beforeAgentId: 'agent-dina',
      },
    ]]);
  });

  it('does not emit agent reorder drops without a team id', async () => {
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
    const rows = wrapper.findAll('.agent-sidebar__agent');
    mockRect(rows[0].element, { top: 100, height: 64 });

    rows[1].element.dispatchEvent(dragEvent('dragstart', 0));
    rows[0].element.dispatchEvent(dragEvent('dragover', 108));
    rows[0].element.dispatchEvent(dragEvent('drop', 108));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('reorder-agents')).toBeUndefined();
  });

  it('uses branch icons instead of agent avatars', () => {
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

    expect(wrapper.findAll('.agent-sidebar__session-icon')).toHaveLength(2);
    expect(wrapper.find('.agent-sidebar__avatar').exists()).toBe(false);
  });

  it('gives normal workspace rows larger icons and breathing room than compact rows', () => {
    expect(agentSidebarSource).toContain('--agent-sidebar-row-min-height: 30px;');
    expect(agentSidebarSource).toContain('--agent-sidebar-workspace-icon-size: 16px;');
    expect(agentSidebarSource).toContain('--agent-sidebar-repository-icon-size: 20px;');
    expect(agentSidebarSource).toContain('min-height: 30px;');
    expect(agentSidebarSource).toContain('.agent-sidebar--compact {\n  --agent-sidebar-row-min-height: 28px;\n  --agent-sidebar-workspace-icon-size: 16px;');
    expect(agentSidebarSource).toContain('--agent-sidebar-repository-icon-column-width: 24px;');
    expect(agentSidebarSource).toContain('--agent-sidebar-workspace-column-gap: 4px;');
    expect(agentSidebarSource).not.toContain('agent-sidebar__workspace-toggle');
    expect(agentSidebarSource).toContain('width: calc(var(--icon-sm) + 2px);');
    expect(agentSidebarSource).not.toContain('.agent-sidebar__workspace-header:focus-within');
    expect(agentSidebarSource).toContain('.agent-sidebar__start-work {\n  flex: 0 0 auto;');
    expect(agentSidebarSource).toContain('.agent-sidebar__list {\n  flex: 1 1 0;');
    expect(agentSidebarSource).toContain('padding: 1px var(--space-6) 1px\n    calc(var(--agent-sidebar-workspace-inline-padding) + var(--space-6));');
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

  it('keeps workspace labels stable when collaboration status changes', () => {
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

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('id8');
    expect(wrapper.get('.agent-sidebar__status').attributes('aria-label')).toBe('Idle');
  });

  it('places agents without workspace identity under Quick chats', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [
          { ...agents[0], folder: '', workspace: undefined },
        ],
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.get('.agent-sidebar__workspace-header').text()).toBe('Quick chats');
    expect(wrapper.find('.agent-sidebar__branch').exists()).toBe(false);
  });

  it('renders the new session action at the top instead of a footer action', () => {
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

    expect(wrapper.get('.agent-sidebar__start-work').text()).toContain('Add project');
    expect(wrapper.find('.agent-sidebar__footer').exists()).toBe(false);
  });

  it('opens a context menu, closes it on request, and emits agent actions', async () => {
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

    expect(document.body.querySelector('.agent-context-menu')).not.toBeNull();
    expect(portaledMenuItems().map((item) => item.textContent?.trim())).toStrictEqual([
      'Edit Agent',
      'Duplicate Agent',
      'Fork Agent',
      'Move to Other Team',
      'Save to Bench',
      'Restart Agent',
      'Close Agent',
    ]);

    await clickPortaledMenuItem('Edit Agent');

    expect(wrapper.emitted('edit-agent')).toStrictEqual([['agent-dina']]);
    expect(document.body.querySelector('.agent-context-menu')).toBeNull();

    const expectedActions = [
      ['Duplicate Agent', 'duplicate-agent'],
      ['Save to Bench', 'save-agent-to-bench'],
      ['Restart Agent', 'restart-agent'],
      ['Close Agent', 'close-agent'],
    ] as const;

    for (const [label, eventName] of expectedActions) {
      await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
        clientX: 120,
        clientY: 80,
      });
      await clickPortaledMenuItem(label);
      expect(wrapper.emitted(eventName)).toStrictEqual([['agent-dina']]);
    }
  });

  it('opens an agent folder from the context menu application list', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: agents.map((agent) => ({ ...agent, teamId: 'team-codex-claw' })),
        activeAgentId: 'agent-dina',
        teams,
        teamName: 'Codex Claw',
        openInCatalog: {
          defaultApplication: 'vscode',
          applications: [
            { id: 'vscode', label: 'VS Code' },
            { id: 'finder', label: 'Finder' },
          ],
        },
      },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu');
    await clickPortaledMenuItem('Finder');

    expect(wrapper.emitted('open-in')).toStrictEqual([[
      { agentId: 'agent-dina', application: 'finder' },
    ]]);
  });

  it('emits fork for an idle Codex agent with a conversation', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [{ ...agents[0], backendSession: { kind: 'codex', threadId: 'thread-dina' } }, agents[1]],
        activeAgentId: 'agent-dina',
        forkableAgentIds: ['agent-dina'],
        teamName: 'Codex Claw',
      },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu');
    await clickPortaledMenuItem('Fork Agent');

    expect(wrapper.emitted('fork-agent')).toStrictEqual([['agent-dina']]);
  });

  it('emits move targets from the context menu submenu', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: agents.map((agent) => ({ ...agent, teamId: 'team-codex-claw' })),
        activeAgentId: 'agent-dina',
        teams,
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
    await clickPortaledMenuItem('Skwad');

    expect(wrapper.emitted('move-agent-to-team')).toStrictEqual([[{
      agentId: 'agent-dina',
      teamId: 'team-skwad',
    }]]);
  });

  it('hides cross-location move targets from the context menu submenu', async () => {
    const remoteTeam: Team = {
      id: 'team-remote',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote-upstream',
      agentIds: [],
    };
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: agents.map((agent) => ({ ...agent, teamId: 'team-codex-claw' })),
        activeAgentId: 'agent-dina',
        teams: [...teams, remoteTeam],
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

    expect(portaledMenuItems().some((item) => item.textContent?.trim() === 'Skwad')).toBe(true);
    expect(portaledMenuItems().some((item) => item.textContent?.trim() === 'Remote Core')).toBe(false);
  });

  it('hides all move targets for remote agents', async () => {
    const remoteAgent: Agent = {
      ...agents[0],
      id: 'agent-remote',
      teamId: 'team-remote',
    };
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [remoteAgent],
        activeAgentId: 'agent-remote',
        teams: [
          ...teams,
          {
            id: 'team-remote',
            name: 'Remote Core',
            remoteConnectionId: 'connection-devbox',
            remoteTeamId: 'team-remote-upstream',
            agentIds: ['agent-remote'],
          },
        ],
        teamName: 'Remote Core',
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });

    expect(portaledMenuItems().some((item) => item.textContent?.trim() === 'Skwad')).toBe(false);
    expect(portaledMenuItems().some((item) => item.textContent?.trim() === 'Codex Claw')).toBe(false);
  });

  it('closes the context menu when the menu emits close', async () => {
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

    expect(document.body.querySelector('.agent-context-menu')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('.agent-context-menu')).toBeNull();
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

  it('shows the conversation history panel below repository sessions', async () => {
    const listConversations = vi.fn().mockResolvedValue([]);
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
        listConversations,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    wrapper.get('.agent-sidebar__conversations');

    await wrapper.get('.conversation-history__header').trigger('click');
    await flushPromises();

    expect(listConversations).toHaveBeenCalledWith('agent-dina');
  });
});
