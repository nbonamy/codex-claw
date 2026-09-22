import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import BacklogView from '../BacklogView.vue';
import CockpitWorkInbox from '../CockpitWorkInbox.vue';

describe('BacklogView', () => {
  it('presents Backlog as an operator inbox and keeps search inside it', async () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mountView(snapshot, []);

    expect(wrapper.get('h1').text()).toBe('Backlog');
    expect(wrapper.get('[data-tone="working"] span').text()).toBe('working');
    expect(wrapper.get('[data-tone="working"] strong').text()).toBe('0');
    expect(wrapper.get('[data-tone="review"] span').text()).toBe('ready for review');
    expect(wrapper.get('[data-tone="review"] strong').text()).toBe('0');
    expect(wrapper.find('.cockpit-view__activity').exists()).toBe(false);
    expect(wrapper.findAll('.cockpit-view__summary button i')).toHaveLength(0);
    expect(wrapper.find('.cockpit-view__agent-card').exists()).toBe(false);
    expect(wrapper.findComponent(CockpitWorkInbox).exists()).toBe(true);

    const navigation = wrapper.get('[aria-label="Backlog navigation"]');
    expect(navigation.text()).not.toContain('Settings');
    expect(navigation.find('input[aria-label="Search Cockpit work"]').exists()).toBe(false);

    wrapper.findComponent(CockpitWorkInbox).vm.$emit('update-search-query', 'operator');
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(CockpitWorkInbox).props('searchQuery')).toBe('operator');
  });

  it('supports repository navigation, sorting, filtering, and stable activity order', async () => {
    const snapshot = createInitialSnapshot();
    const initialRepositories = [
      repository('older', '2026-08-14T00:00:00.000Z', '2026-08-10T00:00:00.000Z'),
      repository('recent', '2026-08-01T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
    ];
    const wrapper = mountView(snapshot, [item(24)], initialRepositories, vi.fn().mockResolvedValue(undefined), 'nbonamy/recent');
    const rows = wrapper.findAll('.cockpit-view__repositories > div');

    expect(wrapper.get('.cockpit-view__navigation-section').text()).toContain('Repositories');
    expect(wrapper.get('[aria-label="Sort repositories by recent activity"]').text()).toContain('Recent');
    expect(rows.map((row) => row.text())).toStrictEqual(['recent', 'older']);
    expect(rows[0]!.findAll('button')[0]!.attributes('aria-pressed')).toBe('true');
    expect(rows[0]!.findAll('button')[0]!.attributes('title')).toBe('recent');

    await wrapper.get('input[aria-label="Filter repositories"]').setValue('old');
    expect(wrapper.findAll('.cockpit-view__repositories > div').map((row) => row.text())).toStrictEqual(['older']);
    await wrapper.get('input[aria-label="Filter repositories"]').setValue('');

    await wrapper.getComponent({ name: 'ElDropdown' }).vm.$emit('command', 'alphabetical');
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[aria-label="Sort repositories by name"]').text()).toContain('A–Z');
    expect(wrapper.findAll('.cockpit-view__repositories > div').map((row) => row.text())).toStrictEqual(['older', 'recent']);

    await wrapper.findAll('.cockpit-view__repositories > div')[1]!.findAll('button')[0]!.trigger('click');

    const repositoryLink = wrapper.findAll('.cockpit-view__repositories > div')[1]!.get('a');
    expect(repositoryLink.attributes()).toMatchObject({
      'aria-label': 'Open recent on GitHub',
      href: 'https://github.com/nbonamy/recent',
      rel: 'noreferrer',
      target: '_blank',
    });

    expect(wrapper.emitted('select-work-repository')).toStrictEqual([['nbonamy/recent']]);
    expect(wrapper.findAll('.cockpit-view__repositories > div')[1]!.findAll('button')).toHaveLength(1);

    const allRepositories = Array.from({ length: 12 }, (_, index) => (
      repository(`repository-${index + 1}`, `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`)
    ));
    await wrapper.setProps({
      workBacklog: {
        ...wrapper.props('workBacklog')!,
        repositories: allRepositories,
        selectedRepositoryId: null,
      },
    });

    expect(wrapper.findAll('.cockpit-view__repositories > div')).toHaveLength(12);

    const activityRepositories = [
      repository('inactive', '2026-08-14T00:00:00.000Z'),
      repository('active', '2026-08-01T00:00:00.000Z', '2026-08-10T00:00:00.000Z'),
    ];
    await wrapper.getComponent({ name: 'ElDropdown' }).vm.$emit('command', 'recent');
    await wrapper.setProps({
      workBacklog: {
        ...wrapper.props('workBacklog')!,
        items: [],
        repositories: activityRepositories,
      },
    });

    expect(wrapper.findAll('.cockpit-view__repositories > div').map((row) => row.text())).toStrictEqual(['active', 'inactive']);

    const paginatedRepositories = [
      repository('older', '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'),
      repository('recent', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
    ];
    const firstPageItem = {
      ...item(24),
      repositoryId: paginatedRepositories[1]!.id,
      repositoryFullName: paginatedRepositories[1]!.fullName,
      updatedAt: '2026-08-13T12:00:00.000Z',
    };
    const secondPageItem = {
      ...item(25),
      repositoryId: paginatedRepositories[0]!.id,
      repositoryFullName: paginatedRepositories[0]!.fullName,
      updatedAt: '2026-08-14T00:00:00.000Z',
    };
    await wrapper.setProps({
      workBacklog: {
        ...wrapper.props('workBacklog')!,
        items: [firstPageItem],
        repositories: paginatedRepositories,
      },
    });

    expect(wrapper.findAll('.cockpit-view__repositories > div').map((row) => row.text())).toStrictEqual(['recent', 'older']);

    await wrapper.setProps({
      workBacklog: {
        ...wrapper.props('workBacklog')!,
        items: [secondPageItem],
      },
    });

    expect(wrapper.findAll('.cockpit-view__repositories > div').map((row) => row.text())).toStrictEqual(['recent', 'older']);
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

  it('shows a provider connection empty state', () => {
    const snapshot = createInitialSnapshot();
    const wrapper = mount(BacklogView, {
      props: { agents: snapshot.agents, teams: snapshot.teams, startWorkItemsAction: vi.fn().mockResolvedValue(undefined) },
      global: { stubs: { CockpitWorkInbox: true } },
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
  return mount(BacklogView, {
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
    global: { stubs: { CockpitWorkInbox: true } },
  });
}

function repository(name: string, updatedAt: string, workItemsUpdatedAt?: string): WorkRepository {
  return {
    provider: 'github',
    id: `nbonamy/${name}`,
    owner: 'nbonamy',
    name,
    fullName: `nbonamy/${name}`,
    url: `https://github.com/nbonamy/${name}`,
    isPrivate: true,
    updatedAt,
    ...(workItemsUpdatedAt ? { workItemsUpdatedAt } : {}),
  };
}

function item(number: number): WorkItem {
  return { provider: 'github', id: `nbonamy/codex-claw#${number}`, repositoryId: 'nbonamy/codex-claw', repositoryFullName: 'nbonamy/codex-claw', number, title: `Work item ${number}`, url: `https://github.com/nbonamy/codex-claw/issues/${number}`, state: 'open', labels: [], createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' };
}
