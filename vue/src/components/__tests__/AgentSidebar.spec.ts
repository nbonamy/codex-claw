import { flushPromises, mount } from '@vue/test-utils';
import { ElPopover } from 'element-plus';
import { computed, ref } from 'vue';
import { backendChoicesKey } from '../backend-selection';
import { describe, expect, it, vi } from 'vitest';
import AgentSidebar from '../AgentSidebar.vue';
import type { Agent, AgentBackend } from '@codex-claw/core/contracts';

import { agents } from './agent-sidebar-test-harness';

describe('AgentSidebar sessions', () => {
  it('does not reveal engine icons solely because a selected Mission row retains focus', async () => {
    const { createMission } = await import('@codex-claw/core/missions');
    const { createInitialSnapshot } = await import('@codex-claw/core/snapshot-construction');
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, {
      outcome: 'Add team billing', workflowType: 'shapeAndShipFeature',
      teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id,
    });
    const wrapper = mount(AgentSidebar, {
      attachTo: document.body,
      props: { agents, missions: [mission], activeMissionId: mission.id, activeAgentId: null, teamName: 'Team' },
      global: { provide: { [backendChoicesKey as symbol]: computed(() => ['codex', 'claude']) } },
    });
    const missionRow = wrapper.get<HTMLButtonElement>('[data-group-kind="missions"] .agent-sidebar__agent');
    missionRow.element.focus();

    expect(missionRow.attributes('aria-pressed')).toBe('true');
    expect(wrapper.element.matches(':hover')).toBe(false);
    expect(document.activeElement).toBe(missionRow.element);
    const engine = wrapper.get('.agent-sidebar__engine');
    expect(getComputedStyle(engine.element).display).toBe('none');
    const agentRow = engine.element.closest('.agent-sidebar__agent')!;
    expect(getComputedStyle(agentRow).getPropertyValue('--agent-sidebar-engine-track')).toBe('');
    wrapper.unmount();
  });

  it('identifies each engine before status without taking space while hidden, including quick chats and input requests', async () => {
    const claude: Agent = { ...agents[1]!, backend: 'claude', backendDefaults: { kind: 'claude' }, sessionKind: 'quickChat', status: { type: 'awaitingInput' } };
    const enabled = ref<AgentBackend[]>(['codex', 'claude']);
    const wrapper = mount(AgentSidebar, {
      props: { agents: [agents[0]!, claude], activeAgentId: null, teamName: 'Team' },
      global: { provide: { [backendChoicesKey as symbol]: computed(() => enabled.value) } },
    });
    const rows = [agents[0]!, claude].map(agent => wrapper.get(`[data-reorder-id="${agent.id}"]`));
    const icons = rows.map(row => row.get('[role="img"]'));
    expect(icons.map(icon => icon.attributes('aria-label'))).toEqual(['Codex', 'Claude Code']);
    for (const [index, icon] of icons.entries()) {
      expect(icon.element.nextElementSibling?.getAttribute('aria-label')).toBe(index === 0 ? 'Idle' : 'Awaiting input');
      expect(getComputedStyle(icon.element).display).toBe('none');
    }
    await wrapper.setProps({ agents: [agents[0]!, { ...claude, backend: 'codex', backendDefaults: { kind: 'codex' } }] });
    expect(rows[1]!.get('[role="img"]').attributes('aria-label')).toBe('Codex');
    await rows[1]!.trigger('click');
    expect(wrapper.emitted('select-agent')).toEqual([[claude.id]]);
    enabled.value = ['codex'];
    await flushPromises();
    expect(wrapper.findAll('.agent-sidebar__engine')).toHaveLength(0);
  });

  it('keeps the input label visible over unread and shortcut indicators until the agent resumes', async () => {
    const waiting: Agent = { ...agents[0]!, status: { type: 'awaitingInput' } };
    const wrapper = mount(AgentSidebar, {
      props: { agents: [waiting], activeAgentId: null, teamName: 'Team', unreadAgentIds: [waiting.id], quickSwitchShortcutsVisible: true },
    });
    const row = wrapper.get('.agent-sidebar__agent');
    expect(row.get('[aria-label="Awaiting input"]').text()).toBe('Input');
    expect(row.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);
    await row.trigger('click');
    expect(wrapper.emitted('select-agent')).toEqual([[waiting.id]]);
    await wrapper.setProps({ unreadAgentIds: [] });
    expect(row.get('[aria-label="Awaiting input"]').text()).toBe('Input');
    await wrapper.setProps({ agents: [{ ...waiting, status: { type: 'working' } }], quickSwitchShortcutsVisible: false });
    expect(row.text()).not.toContain('Input');
    expect(row.find('[aria-label="Working"]').exists()).toBe(true);
  });

  it('renders repository headers, branch sessions, statuses, and active selection', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
      },
    });

    expect(wrapper.get('.agent-sidebar__header').text()).toContain('Sessions');
    expect(wrapper.text()).toContain('id8');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('multi-llm-ts');
    expect(wrapper.text()).toContain('Jesse');
    expect(wrapper.find('.agent-sidebar__agent--active').text()).toContain('Dina');
    expect(wrapper.find('.agent-sidebar__agent--active').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.agent-sidebar__session-title--active').text()).toBe('Dina');
    expect(wrapper.findAll('.agent-sidebar__session-title--active')).toHaveLength(1);
    expect(wrapper.find('[aria-label="Working"]').exists()).toBe(true);
  });

  it('collapses and expands a repository by clicking its title', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover } },
    });

    let repositoryTitle = wrapper.findAll('.agent-sidebar__workspace-label')[0]!;
    let firstSession = wrapper.findAll('.agent-sidebar__agent')[0]!;
    expect(firstSession.attributes('style') ?? '').not.toContain('display: none');

    await repositoryTitle.trigger('click');
    expect(wrapper.emitted('update-collapsed-repositories')?.[0]).toStrictEqual([
      ['remote:github.com/nbonamy/id8'],
    ]);
    await wrapper.setProps({ collapsedRepositoryKeys: ['remote:github.com/nbonamy/id8'] });
    repositoryTitle = wrapper.findAll('.agent-sidebar__workspace-label')[0]!;
    firstSession = wrapper.findAll('.agent-sidebar__agent')[0]!;
    expect(firstSession.attributes('style') ?? '').toContain('display: none');
    expect(repositoryTitle.attributes('aria-expanded')).toBe('false');

    await repositoryTitle.trigger('click');
    expect(wrapper.emitted('update-collapsed-repositories')?.[1]).toStrictEqual([[]]);
    await wrapper.setProps({ collapsedRepositoryKeys: [] });
    repositoryTitle = wrapper.findAll('.agent-sidebar__workspace-label')[0]!;
    firstSession = wrapper.findAll('.agent-sidebar__agent')[0]!;
    expect(repositoryTitle.attributes('aria-expanded')).toBe('true');
    expect(firstSession.attributes('style') ?? '').not.toContain('display: none');
  });

  it('creates directly on main even with multiple backends enabled', async () => {
    const listRepositoryBranches = vi.fn().mockResolvedValue([{ name: 'main', isDefault: true, worktreePath: '~/src/id8' }]);
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        listRepositoryBranches,
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
        provide: { [backendChoicesKey as symbol]: computed(() => ['codex', 'claude']) },
      },
    });

    const sessionMenu = wrapper.findAllComponents({ name: 'ElPopover' }).find((popover) => (
      popover.props('popperClass') === 'claw-popover agent-sidebar__repository-session-menu-popover'
    ));
    await sessionMenu?.vm.$emit('update:visible', true);
    await flushPromises();
    const menu = wrapper.findAllComponents({ name: 'AppMenu' }).find((item) => item.props('ariaLabel') === 'New session in id8')!;
    const main = menu.findAll('[role="menuitem"]').find((item) => item.text() === 'main')!;
    expect(main.attributes('aria-haspopup')).toBeUndefined();
    await main.trigger('click');
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

  it('shows repository branch loading failures in the session menu', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [agents[0]!],
        activeAgentId: 'agent-dina',
        listRepositoryBranches: vi.fn().mockRejectedValue(new Error('offline')),
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover } },
    });

    const sessionMenu = wrapper.findAllComponents({ name: 'ElPopover' }).find((popover) => (
      popover.props('popperClass') === 'claw-popover agent-sidebar__repository-session-menu-popover'
    ));
    await sessionMenu?.vm.$emit('update:visible', true);
    await flushPromises();

    expect(document.body.textContent).toContain('Could not load branches: offline');
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
        components: { ElPopover },
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
      global: { components: { ElPopover } },
    });

    const picker = wrapper.findAllComponents({ name: 'RepositoryIconPicker' })
      .find((component) => component.props('label') === 'id8')!;
    expect(picker.props('modelValue')).toBe('🦞');
    expect(wrapper.find('.agent-sidebar__workspace-toggle').exists()).toBe(false);
    picker.vm.$emit('update:modelValue', '🚀');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update-repository-icon')).toStrictEqual([
      [{ repositoryKey: 'remote:github.com/nbonamy/id8', repositoryRoot: '~/src/id8', icon: '🚀' }],
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
      global: { components: { ElPopover } },
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
      global: { components: { ElPopover } },
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
      global: { components: { ElPopover } },
    });
    expect(hiddenWrapper.find('.agent-sidebar__quick-switch-shortcut').exists()).toBe(false);
    expect(hiddenWrapper.findAll('.agent-sidebar__status')).toHaveLength(10);
  });

  it('uses the branch fallback in an unnamed agent quick-switch label', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [{ ...agents[0]!, name: null }],
        activeAgentId: 'agent-dina',
        quickSwitchShortcutsVisible: true,
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover } },
    });

    expect(wrapper.get('.agent-sidebar__quick-switch-shortcut').attributes('aria-label'))
      .toBe('Switch to main with Command 1');
  });

  it('renders only the branch as the sidebar title when the agent name is null', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [{ ...agents[0]!, name: null, conversationTitle: 'Previous conversation' }],
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover } },
    });

    expect(wrapper.get('.agent-sidebar__meta strong').text()).toBe('main');
  });

  it('does not append repository names to duplicate unnamed branch titles', () => {
    const computerUseAgent: Agent = {
      ...agents[0]!,
      id: 'agent-computer-use',
      name: null,
      folder: '~/src/computer-use',
      workspace: {
        kind: 'git',
        folder: '~/src/computer-use',
        repositoryName: 'computer-use',
        repositoryRoot: '~/src/computer-use',
        branch: 'main',
        isLinkedWorktree: false,
        primaryWorktreeRoot: '~/src/computer-use',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    };
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [{ ...agents[0]!, name: null }, computerUseAgent],
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover } },
    });

    expect(wrapper.findAll('.agent-sidebar__meta strong').map((title) => title.text()))
      .toStrictEqual(['main', 'main']);
  });

  it('renders persisted repository collapse state and emits controlled updates', async () => {
    const repositoryKey = 'remote:github.com/nbonamy/id8';
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [agents[0]!],
        activeAgentId: 'agent-dina',
        collapsedRepositoryKeys: [repositoryKey],
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover } },
    });

    const toggle = wrapper.get('[aria-label="Expand id8 sessions"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('.agent-sidebar__agent').isVisible()).toBe(false);
    await toggle.trigger('click');

    expect(wrapper.emitted('update-collapsed-repositories')).toStrictEqual([[[]]]);
  });
});

describe('mission navigation', () => {
  it('uses the native workspace-group and session-row layout for missions', async () => {
    const { createMission } = await import('@codex-claw/core/missions');
    const { createInitialSnapshot } = await import('@codex-claw/core/snapshot-construction');
    const missionSnapshot = createInitialSnapshot();
    const mission = createMission(missionSnapshot, { outcome: 'Add team billing', workflowType: 'shapeAndShipFeature', teamId: missionSnapshot.teams[0]!.id, orchestratorMemberId: missionSnapshot.agents[0]!.id });
    const wrapper = mount(AgentSidebar, {
      props: { agents: [], activeAgentId: null, teamName: 'Team' },
      global: { components: { ElPopover } },
    });
    expect(wrapper.get('.agent-sidebar__start-work').findAll('button')
      .map(button => button.text())
      .filter(label => ['Add project', 'Quick chat', 'New mission'].includes(label)))
      .toStrictEqual(['Add project', 'Quick chat', 'New mission']);
    expect(wrapper.find('.agent-sidebar__mission-action [data-icon="target-arrow"]').exists()).toBe(true);
    await wrapper.get('.agent-sidebar__mission-action').trigger('click');
    expect(wrapper.emitted('create-mission')).toStrictEqual([[]]);

    await wrapper.setProps({ activeMissionId: mission.id, missions: [mission] });
    const group = wrapper.get('[data-group-kind="missions"]');
    expect(group.get('.agent-sidebar__workspace-icon').attributes('data-icon')).toBe('target-arrow');
    expect(group.get('.agent-sidebar__workspace-label').text()).toBe('Missions');
    const row = group.get('.agent-sidebar__agent');
    expect(row.get('.agent-sidebar__session-title').text()).toBe('Add team billing');
    expect(row.get('.agent-sidebar__status').attributes('aria-label')).toBe('1/5 · Requirements');
    expect(row.attributes('aria-pressed')).toBe('true');
    await row.trigger('click');
    expect(wrapper.emitted('select-mission')).toStrictEqual([[mission.id]]);
    await row.trigger('contextmenu', { clientX: 80, clientY: 120 });
    const deleteAction = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find(button => button.textContent?.trim() === 'Delete mission');
    expect(deleteAction).toBeDefined();
    deleteAction!.click();
    await flushPromises();
    expect(wrapper.emitted('delete-mission')).toStrictEqual([[mission.id]]);
    await group.get('.agent-sidebar__workspace-label').trigger('click');
    expect(group.find('.agent-sidebar__agent').exists()).toBe(false);
  });

  it('disables mission creation while pending and surfaces creation failures', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [],
        activeAgentId: null,
        missionCreationError: 'Backend unavailable',
        missionCreationPending: true,
        teamName: 'Team',
      },
      global: { components: { ElPopover } },
    });

    expect(wrapper.get('.agent-sidebar__mission-action').attributes()).toMatchObject({
      'aria-busy': 'true',
      disabled: '',
    });
    expect(wrapper.get('[role="alert"]').text()).toBe('Backend unavailable');
  });
});
