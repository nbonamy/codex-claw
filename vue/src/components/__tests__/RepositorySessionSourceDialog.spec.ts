import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceBranch, WorkItem } from '@codex-claw/core/contracts';
import RepositorySessionSourceDialog from '../RepositorySessionSourceDialog.vue';

const branches: SourceBranch[] = [
  { name: 'main', isDefault: true, worktreePath: '/repos/project' },
  { name: 'feat/polish-dialog', isDefault: false, worktreePath: '/repos/project-polish' },
  { name: 'fix/menu-dismissal', isDefault: false },
];
const issue: WorkItem = {
  provider: 'github',
  id: 'github:nbonamy/codex-claw#24',
  repositoryId: 'nbonamy/codex-claw',
  repositoryFullName: 'nbonamy/codex-claw',
  number: 24,
  title: 'Repository-first sessions',
  url: 'https://github.com/nbonamy/codex-claw/issues/24',
  state: 'open',
  kind: 'issue',
  labels: [],
  assignees: [],
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

describe('RepositorySessionSourceDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps branch metadata compact and gives branch states distinct semantics', async () => {
    const wrapper = mount(RepositorySessionSourceDialog, {
      props: {
        visible: true,
        repositoryName: 'codex-claw',
        branches,
      },
    });
    await flushPromises();

    expect(wrapper.get('.repository-session-source-dialog').classes()).toContain('claw-dialog--compact');

    const rows = wrapper.findAll('.repository-session-source-dialog__result');
    expect(rows).toHaveLength(3);
    expect(rows[0].find('.repository-session-source-dialog__result-icon--default').exists()).toBe(true);
    expect(rows[0].get('.repository-session-source-dialog__result-copy').text()).toBe('mainDefault');
    expect(rows[0].get('.repository-session-source-dialog__badge').text()).toBe('Checked out');
    expect(rows[1].find('.repository-session-source-dialog__result-icon--worktree').exists()).toBe(true);
    expect(rows[2].find('.repository-session-source-dialog__badge').exists()).toBe(false);

    await rows[1].trigger('click');
    expect(wrapper.emitted('select-branch')).toStrictEqual([[branches[1]]]);
  });

  it('uses Element Plus tabs to switch the searchable source type', async () => {
    const wrapper = mount(RepositorySessionSourceDialog, {
      props: {
        visible: true,
        repositoryName: 'codex-claw',
        branches,
      },
    });
    await flushPromises();

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((candidate) => candidate.text())).toStrictEqual(['Branches', 'Pull requests', 'Issues']);
    await tabs[1]!.trigger('click');
    await flushPromises();

    expect(wrapper.get('[aria-label="Search session sources"]').attributes('placeholder'))
      .toBe('Search by title, number, author, or URL');
    expect(wrapper.text()).toContain('Recent pull requests');
  });

  it('opens the shared assignment picker for repository work items', async () => {
    const wrapper = mount(RepositorySessionSourceDialog, {
      props: {
        visible: true,
        repositoryName: 'codex-claw',
        branches,
        workItems: [issue],
        sessions: [{ agentId: 'agent-main', label: 'main · main' }],
      },
    });
    await flushPromises();

    expect(wrapper.get('.repository-session-source-dialog').attributes('style')).toContain('width: 720px');
    await wrapper.findAll('[role="tab"]')[2]!.trigger('click');
    await flushPromises();
    await wrapper.get('.repository-session-source-dialog__result').trigger('click');

    expect(wrapper.getComponent({ name: 'WorkItemAssignmentPicker' }).props('item')).toStrictEqual(issue);
    expect(wrapper.text()).toContain('Start work on #24');
    expect(wrapper.find('.repository-session-source-dialog__toolbar').exists()).toBe(false);
    expect(wrapper.get('.repository-session-source-dialog').classes()).toContain('repository-session-source-dialog--assignment');
    expect(wrapper.get('.repository-session-source-dialog').attributes('style')).toContain('width: 440px');

    await wrapper.get('.claw-button--primary').trigger('click');
    expect(wrapper.emitted('start-work-item')).toStrictEqual([[
      { action: 'fix', destination: 'new', item: issue },
    ]]);
  });

  it('paces isolated-session preparation before completing', async () => {
    const wrapper = mount(RepositorySessionSourceDialog, {
      props: {
        visible: true,
        repositoryName: 'codex-claw',
        branches,
        workItems: [issue],
      },
    });
    await flushPromises();
    await wrapper.findAll('[role="tab"]')[2]!.trigger('click');
    await flushPromises();
    await wrapper.get('.repository-session-source-dialog__result').trigger('click');

    vi.useFakeTimers();
    await wrapper.get('.claw-button--primary').trigger('click');
    await wrapper.setProps({ assignmentState: 'running' });

    expect(wrapper.get('.staged-operation-progress__heading').text())
      .toContain('Building an isolated home for #24');
    const firstStep = wrapper.get('.staged-operation-progress li.is-active').text();
    expect(firstStep).toContain('Creating isolated worktree');
    expect(firstStep).toContain('fix/gh-24');

    vi.advanceTimersByTime(1_200);
    await nextTick();
    expect(wrapper.get('.staged-operation-progress li.is-active').text())
      .toContain('Initializing worktree');

    vi.advanceTimersByTime(1_700);
    await nextTick();
    expect(wrapper.get('.staged-operation-progress li.is-active').text())
      .toContain('Starting agent session');

    await wrapper.setProps({ assignmentState: 'success' });
    vi.advanceTimersByTime(1_700);
    await nextTick();
    expect(wrapper.get('.staged-operation-progress li.is-active').text())
      .toContain('Handing over work context');

    vi.advanceTimersByTime(1_500);
    await nextTick();
    expect(wrapper.get('.staged-operation-progress__heading').text())
      .toContain('Work on #24 is ready');
    expect(wrapper.emitted('preparation-complete')).toHaveLength(1);
  });
});
