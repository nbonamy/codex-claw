import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import CockpitView from '../CockpitView.vue';
import CockpitAgentsView from '../CockpitAgentsView.vue';
import CockpitWorkInbox from '../CockpitWorkInbox.vue';

describe('CockpitView', () => {
  it('presents Backlog as an operator inbox and Agents as the original Cockpit', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountView(snapshot, []);

    expect(wrapper.text()).toContain('Cockpit');
    expect(wrapper.get('[aria-label="Cockpit navigation"]').text()).toContain('Backlog');
    expect(wrapper.get('[data-tone="working"] span').text()).toBe('working');
    expect(wrapper.get('[data-tone="working"] strong').text()).toBe('0');
    expect(wrapper.get('[data-tone="review"] span').text()).toBe('ready for review');
    expect(wrapper.get('[data-tone="review"] strong').text()).toBe('0');
    expect(wrapper.find('.cockpit-view__activity').exists()).toBe(false);
    expect(wrapper.findAll('.cockpit-view__summary button i')).toHaveLength(0);
    expect(wrapper.find('.cockpit-view__agent-card').exists()).toBe(false);
    expect(wrapper.findComponent(CockpitWorkInbox).exists()).toBe(true);
    expect(wrapper.get('[aria-label="Cockpit navigation"]').text()).toContain('Agents 2');

    await wrapper.get('[aria-label="Cockpit navigation"] button:nth-of-type(2)').trigger('click');

    expect(wrapper.findComponent(CockpitWorkInbox).exists()).toBe(false);
    expect(wrapper.findComponent(CockpitAgentsView).exists()).toBe(true);
    expect(wrapper.text()).toContain('Codex Claw');
  });

  it('keeps the Cockpit navigation focused and connects shared search to the operator inbox', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountView(snapshot, [item(24)]);
    const navigation = wrapper.get('[aria-label="Cockpit navigation"]');
    expect(navigation.text()).not.toContain('Settings');
    await wrapper.get('input[aria-label="Search Cockpit work"]').setValue('operator');

    expect(wrapper.findComponent(CockpitWorkInbox).props('searchQuery')).toBe('operator');
  });

  it('sorts repositories by recent activity, filters the backlog, and launches an agent', async () => {
    const snapshot = createInitialSnapshot();
    const repositories = [
      repository('older', '2026-08-10T00:00:00.000Z'),
      repository('recent', '2026-08-13T00:00:00.000Z'),
    ];
    const wrapper = mountView(snapshot, [item(24)], repositories, vi.fn().mockResolvedValue(undefined), 'nbonamy/recent');
    const rows = wrapper.findAll('.cockpit-view__repositories > div');

    expect(wrapper.get('.cockpit-view__navigation-section').text()).toBe('Repositories');
    expect(rows.map((row) => row.text())).toStrictEqual(['recent', 'older']);
    expect(wrapper.get('.cockpit-view__navigation-item').attributes('aria-current')).toBe('page');
    expect(rows[0]!.findAll('button')[0]!.attributes('aria-pressed')).toBe('true');

    await rows[0]!.findAll('button')[0]!.trigger('click');

    const launchButton = rows[0]!.findAll('button')[1]!;
    expect(launchButton.attributes('aria-label')).toBe('Start agent in recent');
    await launchButton.trigger('click');

    expect(wrapper.emitted('select-work-repository')).toStrictEqual([['nbonamy/recent']]);
    expect(wrapper.emitted('add-agent-for-repository')).toStrictEqual([[repositories[1]]]);
  });

  it('routes assigned rows to their team and passes the batch launcher to the inbox', () => {
    const snapshot = createInitialSnapshot();
    const assigned = item(24);
    const ready = item(25);
    snapshot.workBacklog.assignments[workItemAssignmentKey(assigned)] = {
      provider: 'github', itemId: assigned.id, agentId: 'agent-dina', assignedAt: '2026-08-12T00:00:00.000Z', policy: 'review', status: 'readyForReview',
    };
    const startWorkItemsAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView(snapshot, [assigned, ready], [], startWorkItemsAction);
    const inbox = wrapper.findComponent(CockpitWorkInbox);

    inbox.vm.$emit('select-assigned-agent', 'agent-dina');

    expect(wrapper.emitted('select-agent')).toStrictEqual([[{ agentId: 'agent-dina', teamId: 'team-codex-claw' }]]);
    expect(inbox.props('startWorkAction')).toBe(startWorkItemsAction);
    expect(inbox.props('defaultTeamId')).toBe('team-codex-claw');
  });

  it('summarizes assignments as clickable working, blocked, and review filters', async () => {
    const snapshot = createInitialSnapshot();
    const working = item(24);
    const blocked = item(25);
    const review = item(26);
    snapshot.workBacklog.assignments = {
      [workItemAssignmentKey(working)]: { provider: 'github', itemId: working.id, agentId: 'agent-dina', assignedAt: '2026-08-12T00:00:00.000Z', policy: 'review', status: 'inProgress' },
      [workItemAssignmentKey(blocked)]: { provider: 'github', itemId: blocked.id, agentId: 'agent-jesse', assignedAt: '2026-08-12T00:00:00.000Z', policy: 'review', status: 'blocked' },
      [workItemAssignmentKey(review)]: { provider: 'github', itemId: review.id, agentId: 'agent-dina', assignedAt: '2026-08-12T00:00:00.000Z', policy: 'review', status: 'readyForReview' },
    };
    const wrapper = mountView(snapshot, [working, blocked, review]);

    const summary = wrapper.get('[aria-label="Work summary filters"]');
    expect(summary.get('[data-tone="working"] span').text()).toBe('working');
    expect(summary.get('[data-tone="working"] strong').text()).toBe('1');
    expect(summary.get('[data-tone="blocked"] span').text()).toBe('blocked');
    expect(summary.get('[data-tone="blocked"] strong').text()).toBe('1');
    expect(summary.get('[data-tone="review"] span').text()).toBe('ready for review');
    expect(summary.get('[data-tone="review"] strong').text()).toBe('1');

    await summary.get('[data-tone="working"]').trigger('click');
    expect(wrapper.findComponent(CockpitWorkInbox).props()).toMatchObject({ activeView: 'wip', statusFilter: 'inProgress' });

    await summary.get('[data-tone="blocked"]').trigger('click');
    expect(wrapper.findComponent(CockpitWorkInbox).props()).toMatchObject({ activeView: 'focus', statusFilter: 'blocked' });

    wrapper.findComponent(CockpitWorkInbox).vm.$emit('update-active-view', 'all');
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(CockpitWorkInbox).props()).toMatchObject({ activeView: 'all', statusFilter: null });
  });

  it('defaults to Focus regardless of whether attention work exists', () => {
    const focusSnapshot = createInitialSnapshot();
    const focusItem = item(24);
    focusSnapshot.workBacklog.assignments[workItemAssignmentKey(focusItem)] = {
      provider: 'github', itemId: focusItem.id, agentId: 'agent-dina', assignedAt: '2026-08-12T00:00:00.000Z', policy: 'review', status: 'blocked',
    };
    expect(mountView(focusSnapshot, [focusItem]).findComponent(CockpitWorkInbox).props('activeView')).toBe('focus');

    const wipSnapshot = createInitialSnapshot();
    const wipItem = item(25);
    wipSnapshot.workBacklog.assignments[workItemAssignmentKey(wipItem)] = {
      provider: 'github', itemId: wipItem.id, agentId: 'agent-dina', assignedAt: '2026-08-12T00:00:00.000Z', policy: 'review', status: 'inProgress',
    };
    expect(mountView(wipSnapshot, [wipItem]).findComponent(CockpitWorkInbox).props('activeView')).toBe('focus');

    expect(mountView(createInitialSnapshot(), [item(26)]).findComponent(CockpitWorkInbox).props('activeView')).toBe('focus');
  });

  it('shows a provider connection empty state', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(CockpitView, {
      props: { agents: snapshot.agents, teams: snapshot.teams, startWorkItemsAction: vi.fn().mockResolvedValue(undefined) },
      global: { plugins: [ElementPlus] },
    });
    expect(wrapper.text()).toContain('Connect a work provider');
  });
});

function mountView(
  snapshot: ReturnType<typeof createInitialSnapshot>,
  items: WorkItem[],
  repositories: WorkRepository[] = [],
  startWorkItemsAction = vi.fn().mockResolvedValue(undefined),
  selectedRepositoryId: string | null = null,
) {
  return mount(CockpitView, {
    props: {
      agents: snapshot.agents, teams: snapshot.teams,
      defaultTeamId: snapshot.activeTeamId,
      startWorkItemsAction,
      workBacklog: {
        assignments: snapshot.workBacklog.assignments,
        connection: { provider: 'github', status: 'connected', accountLabel: 'nbonamy' },
        error: null, globalScope: 'all', items, repositories, selectedRepositoryId, status: 'loaded',
      },
    },
    global: { plugins: [ElementPlus] },
  });
}

function repository(name: string, updatedAt: string): WorkRepository {
  return {
    provider: 'github',
    id: `nbonamy/${name}`,
    owner: 'nbonamy',
    name,
    fullName: `nbonamy/${name}`,
    url: `https://github.com/nbonamy/${name}`,
    isPrivate: true,
    updatedAt,
  };
}

function item(number: number): WorkItem {
  return { provider: 'github', id: `nbonamy/codex-claw#${number}`, repositoryId: 'nbonamy/codex-claw', repositoryFullName: 'nbonamy/codex-claw', number, title: `Work item ${number}`, url: `https://github.com/nbonamy/codex-claw/issues/${number}`, state: 'open', labels: [], createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' };
}
