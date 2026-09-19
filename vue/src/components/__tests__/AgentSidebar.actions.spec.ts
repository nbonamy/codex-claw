import { mount } from '@vue/test-utils';
import { ElPopover } from 'element-plus';
import { describe, expect, it } from 'vitest';
import AgentSidebar from '../AgentSidebar.vue';

import {
  agents,
  clickPortaledMenuItem,
  dragEvent,
  mockRect,
  portaledMenuItems,
  teams,
} from './agent-sidebar-test-harness';

const ElTooltipStub = {
  name: 'ElTooltip',
  props: ['content'],
  template: '<span class="tooltip-stub" :data-content="content"><slot /></span>',
};

describe('AgentSidebar actions', () => {
  const id8Agents = [
    agents[0]!,
    {
      ...agents[0]!,
      id: 'agent-abby',
      name: 'Abby',
      workspace: {
        ...agents[0]!.workspace!,
        branch: 'feat/sidebar-drag',
        isLinkedWorktree: true,
      },
    },
  ];

  it('emits agent selection from agent rows', async () => {
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

    await wrapper.findAll('.agent-sidebar__agent')[1]?.trigger('click');

    expect(wrapper.emitted('select-agent')).toStrictEqual([['agent-jesse']]);
  });

  it('offers closed pull request cleanup without selecting the agent', async () => {
    const closedAgent = {
      ...agents[0]!,
      pullRequest: {
        provider: 'github' as const,
        repository: 'nbonamy/id8',
        branch: 'feat/merged',
        number: 7,
        title: 'Merged work',
        url: 'https://github.com/nbonamy/id8/pull/7',
        draft: false,
        headSha: 'abc123',
        state: 'closed' as const,
        createdAt: '2026-09-03T11:00:00.000Z',
        updatedAt: '2026-09-03T12:00:00.000Z',
      },
    };
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [closedAgent],
        activeAgentId: closedAgent.id,
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover, ElTooltip: ElTooltipStub } },
    });

    const attention = wrapper.get('.agent-sidebar__pull-request-attention');
    expect(attention.attributes('aria-label')).toContain('#7 was closed');
    expect(wrapper.get('.tooltip-stub').attributes('data-content')).toContain('#7 was closed');
    expect(wrapper.find('.agent-sidebar__status').exists()).toBe(false);
    await attention.trigger('click');

    expect(wrapper.emitted('cleanup-pull-request')).toStrictEqual([[closedAgent.id]]);
    expect(wrapper.emitted('select-agent')).toBeUndefined();
  });

  it('emits agent reorder drops and marks the drop location', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [...id8Agents, agents[1]!],
        activeAgentId: 'agent-dina',
        teamId: 'team-codex-claw',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
      },
    });
    const rows = wrapper.findAll('.agent-sidebar__agent');
    const dinaRow = rows[0];
    const abbyRow = rows[1];
    const jesseRow = rows[2];
    expect(abbyRow.attributes('draggable')).toBe('true');
    expect(jesseRow.attributes('draggable')).toBe('false');
    mockRect(dinaRow.element, { top: 100, height: 64 });

    abbyRow.element.dispatchEvent(dragEvent('dragstart', 0));
    dinaRow.element.dispatchEvent(dragEvent('dragover', 108));
    await wrapper.vm.$nextTick();

    expect(dinaRow.classes()).toContain('list-reorder-drag--drop-before');

    dinaRow.element.dispatchEvent(dragEvent('drop', 108));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('reorder-agents')).toStrictEqual([[
      {
        teamId: 'team-codex-claw',
        agentId: 'agent-abby',
        beforeAgentId: 'agent-dina',
      },
    ]]);
  });

  it('does not accept agent drops across repositories', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [...id8Agents, agents[1]!],
        activeAgentId: 'agent-dina',
        teamId: 'team-codex-claw',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
      },
    });
    const rows = wrapper.findAll('.agent-sidebar__agent');
    const abbyRow = rows[1];
    const jesseRow = rows[2];
    mockRect(jesseRow.element, { top: 100, height: 64 });

    abbyRow.element.dispatchEvent(dragEvent('dragstart', 0));
    jesseRow.element.dispatchEvent(dragEvent('dragover', 108));
    jesseRow.element.dispatchEvent(dragEvent('drop', 108));
    await wrapper.vm.$nextTick();

    expect(jesseRow.classes()).not.toContain('list-reorder-drag--drop-before');
    expect(jesseRow.classes()).not.toContain('list-reorder-drag--drop-after');
    expect(wrapper.emitted('reorder-agents')).toBeUndefined();
  });

  it('emits repository reorder drops for the entire workspace group', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamId: 'team-codex-claw',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
      },
    });
    const groups = wrapper.findAll('.agent-sidebar__workspace-group');
    const id8Group = groups[0];
    const multiLlmGroup = groups[1];
    const headers = wrapper.findAll('.agent-sidebar__workspace-header');
    expect(headers[0].attributes('draggable')).toBe('true');
    expect(headers[1].attributes('draggable')).toBe('true');
    mockRect(id8Group.element, { top: 100, height: 96 });

    headers[1].element.dispatchEvent(dragEvent('dragstart', 0));
    id8Group.element.dispatchEvent(dragEvent('dragover', 108));
    await wrapper.vm.$nextTick();

    expect(id8Group.classes()).toContain('list-reorder-drag--drop-before');

    id8Group.element.dispatchEvent(dragEvent('drop', 108));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('reorder-repositories')).toStrictEqual([[
      {
        teamId: 'team-codex-claw',
        repositoryRoot: '~/src/multi-llm-ts',
        beforeRepositoryRoot: '~/src/id8',
      },
    ]]);
  });

  it('does not emit agent reorder drops without a team id', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: id8Agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
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
        components: { ElPopover },
      },
    });

    expect(wrapper.findAll('.agent-sidebar__session-icon')).toHaveLength(2);
    expect(wrapper.find('.agent-sidebar__avatar').exists()).toBe(false);
  });

  it('labels non-idle statuses for assistive tech', () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [
          { ...agents[0], id: 'working', status: { type: 'working' } },
          { ...agents[0], id: 'awaiting', status: { type: 'awaitingInput' } },
          { ...agents[0], id: 'error', status: { type: 'error', message: 'failed' } },
        ],
        activeAgentId: 'working',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
      },
    });

    expect(wrapper.find('[aria-label="Working"]').exists()).toBe(true);
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
        components: { ElPopover },
      },
    });

    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('id8');
    expect(wrapper.get('.agent-sidebar__status').attributes('aria-label')).toBe('Idle');
  });

  it('places agents without workspace identity under Chats with a create action', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [
          agents[0]!,
          { ...agents[0], folder: '', workspace: undefined },
        ],
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
      },
    });

    expect(wrapper.findAll('.agent-sidebar__workspace-header').map((header) => header.text()))
      .toStrictEqual(['Chats', 'id8']);
    const chatsGroup = wrapper.findAll('.agent-sidebar__workspace-group')[0]!;
    expect(chatsGroup.find('.agent-sidebar__branch').exists()).toBe(false);
    expect(chatsGroup.get('.agent-sidebar__workspace-header').find('[data-icon="message"]').exists()).toBe(true);
    expect(chatsGroup.get('.agent-sidebar__agent').find('.agent-sidebar__session-icon').exists()).toBe(false);

    await wrapper.get('[aria-label="New quick chat"]').trigger('click');
    expect(wrapper.emitted('create-quick-chat')).toStrictEqual([[]]);
  });

  it('offers Quick chat beneath Add project until the team has chats', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents,
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: { components: { ElPopover } },
    });

    const action = wrapper.get('.agent-sidebar__quick-chat-action');
    expect(action.text()).toBe('Quick chat');
    expect(action.find('[data-icon="message"]').exists()).toBe(true);
    await action.trigger('click');
    expect(wrapper.emitted('create-quick-chat')).toStrictEqual([[]]);
  });

  it('renders the new session action at the top instead of a footer action', () => {
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
        components: { ElPopover },
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
      'Compress Session',
      'Resume Session',
      'Restart Agent',
      'Close Agent',
    ]);

    await clickPortaledMenuItem('Edit Agent');

    expect(wrapper.emitted('edit-agent')).toStrictEqual([['agent-dina']]);
    expect(document.body.querySelector('.agent-context-menu')).toBeNull();

    const expectedActions = [
      ['Duplicate Agent', 'duplicate-agent'],
      ['Resume Session', 'resume-session'],
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
      global: { components: { ElPopover } },
    });

    await wrapper.findAll('.agent-sidebar__agent')[0].trigger('contextmenu');
    await clickPortaledMenuItem('Finder');

    expect(wrapper.emitted('open-in')).toStrictEqual([[
      { agentId: 'agent-dina', application: 'finder' },
    ]]);
  });

  it('offers session compression for an idle Codex agent with a conversation', async () => {
    const wrapper = mount(AgentSidebar, {
      props: {
        agents: [{
          ...agents[0]!,
          backendSession: { kind: 'codex', threadId: 'thread-dina' },
        }],
        activeAgentId: 'agent-dina',
        teamName: 'Codex Claw',
      },
      global: {
        components: { ElPopover },
      },
    });

    await wrapper.get('.agent-sidebar__agent').trigger('contextmenu', {
      clientX: 120,
      clientY: 80,
    });
    await clickPortaledMenuItem('Compress Session');

    expect(wrapper.emitted('compress-session')).toStrictEqual([['agent-dina']]);
  });
});
