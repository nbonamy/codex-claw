import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import type { Agent, WorkBacklogAssignment, WorkItem } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import CockpitWorkInbox from '../CockpitWorkInbox.vue';

describe('CockpitWorkInbox', () => {
  it('defaults to Focus and preserves the view order while prioritizing attention and review', async () => {
    const blocked = item(21, 'Resolve a blocker', 'repo-one');
    const review = item(22, 'Review the result', 'repo-two');
    const ready = item(23, 'Start this next', 'repo-one');
    const wrapper = mountInbox([blocked, review, ready], {
      [workItemAssignmentKey(blocked)]: assignment(blocked, 'agent-one', 'blocked'),
      [workItemAssignmentKey(review)]: assignment(review, 'agent-two', 'readyForReview'),
    });

    expect(wrapper.findAll('.cockpit-inbox__view-label').map((label) => label.text())).toStrictEqual([
      'All', 'Backlog', 'WIP', 'Focus',
    ]);
    expect(wrapper.findAll('.cockpit-inbox__view-count').map((count) => count.text())).toStrictEqual(['3', '1', '2', '2']);
    expect(wrapper.findAll('.cockpit-inbox__views > button')[3]?.attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('Needs attention');
    expect(wrapper.text()).toContain('Ready for review');
    expect(wrapper.text()).not.toContain('Start this next');

    await wrapper.findAll('.cockpit-inbox__views > button')[0]?.trigger('click');
    expect(wrapper.text()).toContain('Start this next');
    expect(wrapper.findAll('.cockpit-inbox__group > header strong').map((header) => header.text())).toStrictEqual([
      'Needs attention', 'Ready for review', 'Ready',
    ]);
  });

  it('isolates backlog and WIP and routes assigned and unassigned rows', async () => {
    const assigned = item(21, 'Assigned work', 'repo-one');
    const ready = item(22, 'Ready work', 'repo-two');
    const wrapper = mountInbox([assigned, ready], {
      [workItemAssignmentKey(assigned)]: assignment(assigned, 'agent-one', 'inProgress'),
    });

    await wrapper.findAll('.cockpit-inbox__views > button')[1]?.trigger('click');
    expect(wrapper.text()).toContain('Ready work');
    expect(wrapper.text()).not.toContain('Assigned work');
    await wrapper.get('.cockpit-inbox__row').trigger('click');
    expect(wrapper.emitted('start-work')).toStrictEqual([[ready]]);

    await wrapper.findAll('.cockpit-inbox__views > button')[2]?.trigger('click');
    expect(wrapper.text()).toContain('Assigned work');
    expect(wrapper.text()).not.toContain('Ready work');
    await wrapper.get('.cockpit-inbox__row').trigger('click');
    expect(wrapper.emitted('select-assigned-agent')).toStrictEqual([['agent-one']]);
  });

  it('keeps view, assign, and GitHub actions inline without an overflow menu', async () => {
    const assigned = item(21, 'Assigned work', 'repo-one');
    const ready = item(22, 'Ready work', 'repo-two');
    const wrapper = mountInbox([assigned, ready], {
      [workItemAssignmentKey(assigned)]: assignment(assigned, 'agent-one', 'inProgress'),
    }, { activeView: 'all' });
    const rows = wrapper.findAll('.cockpit-inbox__row');
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    expect(rows[0]?.get('.cockpit-inbox__row-action').attributes('aria-label')).toBe('View agent for #21');
    expect(rows[1]?.get('.cockpit-inbox__row-action').attributes('aria-label')).toBe('Assign #22');
    expect(wrapper.find('details').exists()).toBe(false);

    await rows[0]?.get('.cockpit-inbox__row-action').trigger('click');
    await rows[1]?.get('.cockpit-inbox__row-action').trigger('click');
    await rows[0]?.get('.cockpit-inbox__external-action').trigger('click');

    expect(wrapper.emitted('select-assigned-agent')).toStrictEqual([['agent-one']]);
    expect(wrapper.emitted('start-work')).toStrictEqual([[ready]]);
    expect(open).toHaveBeenCalledWith(assigned.url, '_blank', 'noreferrer');
    open.mockRestore();
  });

  it('applies a KPI status filter inside the selected view', async () => {
    const working = item(21, 'Working item', 'repo-one');
    const blocked = item(22, 'Blocked item', 'repo-two');
    const wrapper = mountInbox([working, blocked], {
      [workItemAssignmentKey(working)]: assignment(working, 'agent-one', 'inProgress'),
      [workItemAssignmentKey(blocked)]: assignment(blocked, 'agent-two', 'blocked'),
    }, { activeView: 'focus', statusFilter: 'blocked' });

    expect(wrapper.text()).toContain('Blocked item');
    expect(wrapper.text()).not.toContain('Working item');

    await wrapper.findAll('.cockpit-inbox__views > button')[0]?.trigger('click');
    expect(wrapper.emitted('update-active-view')).toStrictEqual([['all']]);
  });

  it('keeps repository identity scannable across repositories and forwards filters', async () => {
    const wrapper = mountInbox([item(21, 'First repo work', 'repo-one'), item(22, 'Second repo work', 'repo-two')]);
    await wrapper.findAll('.cockpit-inbox__views > button')[0]?.trigger('click');

    expect(wrapper.text()).toContain('repo-one #21');
    expect(wrapper.text()).toContain('repo-two #22');
    const selects = wrapper.findAllComponents({ name: 'ElSelect' });
    await selects[0]?.vm.$emit('update:modelValue', 'repo-two');
    await selects[1]?.vm.$emit('update:modelValue', 'bug');
    await selects[2]?.vm.$emit('update:modelValue', 'nicolas');
    expect(wrapper.emitted('select-repository')).toStrictEqual([['repo-two']]);
    expect(wrapper.emitted('select-tag')).toStrictEqual([['bug']]);
    expect(wrapper.emitted('select-assignee')).toStrictEqual([['nicolas']]);
  });

  it('searches work and starts the next ready item from the primary action', async () => {
    const first = item(21, 'First repo work', 'repo-one');
    const second = item(22, 'Second repo work', 'repo-two');
    const wrapper = mountInbox([first, second]);

    await wrapper.get('[aria-label="Search work"]').trigger('click');
    await wrapper.get('input[aria-label="Search work"]').setValue('second');
    await wrapper.findAll('.cockpit-inbox__views > button')[0]?.trigger('click');
    expect(wrapper.text()).toContain('Second repo work');
    expect(wrapper.text()).not.toContain('First repo work');

    await wrapper.findAllComponents({ name: 'ElButton' }).find((button) => button.text().includes('Start work'))?.trigger('click');
    expect(wrapper.emitted('start-work')).toStrictEqual([[second]]);
  });

  it('guides unfiltered global views before loading cross-repository work', async () => {
    const wrapper = mountInbox([], {}, { activeView: 'all', globalScope: null });

    expect(wrapper.get('.cockpit-inbox__scope').text()).toContain('select a repository from the sidebar');
    expect(wrapper.text()).toContain('Show items assigned to me');
    expect(wrapper.text()).toContain('Load everything');

    const buttons = wrapper.findAll('.cockpit-inbox__scope-actions button');
    await buttons[0]?.trigger('click');
    await buttons[1]?.trigger('click');
    expect(wrapper.emitted('select-global-scope')).toStrictEqual([['assignedToMe'], ['all']]);
  });
});

function mountInbox(
  items: WorkItem[],
  assignments: Record<string, WorkBacklogAssignment> = {},
  filters: { activeView?: 'all' | 'backlog' | 'wip' | 'focus'; globalScope?: 'assignedToMe' | 'all' | null; statusFilter?: 'inProgress' | 'blocked' | 'readyForReview' | null } = {},
) {
  return mount(CockpitWorkInbox, {
    props: {
      agents: [agent('agent-one', 'Dina'), agent('agent-two', 'Jesse')], assignments,
      connection: { provider: 'github', status: 'connected', accountLabel: 'nicolas' },
      error: null, items,
      repositories: [
        { provider: 'github', id: 'repo-one', owner: 'owner', name: 'repo-one', fullName: 'owner/repo-one', url: 'https://github.com/owner/repo-one', isPrivate: false },
        { provider: 'github', id: 'repo-two', owner: 'owner', name: 'repo-two', fullName: 'owner/repo-two', url: 'https://github.com/owner/repo-two', isPrivate: false },
      ],
      globalScope: 'all', selectedRepositoryId: null, status: 'loaded',
      ...filters,
    },
    global: { plugins: [ElementPlus] },
  });
}

function item(number: number, title: string, repositoryId: string): WorkItem {
  return { provider: 'github', id: `owner/${repositoryId}#${number}`, repositoryId, repositoryFullName: `owner/${repositoryId}`, number, title, url: `https://github.com/owner/${repositoryId}/issues/${number}`, state: 'open', assignees: ['nicolas'], labels: [{ name: 'bug' }], createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' };
}

function assignment(workItem: WorkItem, agentId: string, status: WorkBacklogAssignment['status']): WorkBacklogAssignment {
  return { provider: 'github', itemId: workItem.id, agentId, assignedAt: '2026-08-12T01:00:00.000Z', policy: 'review', status };
}

function agent(id: string, name: string): Agent {
  return { id, teamId: 'team-one', name, avatar: name.slice(0, 2), folder: '/tmp/repo', backend: 'codex', backendDefaults: { kind: 'codex' }, status: { type: 'idle' }, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' };
}
