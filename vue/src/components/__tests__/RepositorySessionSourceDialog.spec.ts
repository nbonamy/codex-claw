import { computed, nextTick, ref } from 'vue';
import { ElDialog } from 'element-plus';
import { backendChoicesKey } from '../backend-selection';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceBranch, WorkItem } from '@codex-claw/core/contracts';
import '../../styles/base.css';
import RepositorySessionSourceDialog from '../RepositorySessionSourceDialog.vue';
import { createClientApiMock } from '../../test/client-api-mock';
import { configureClawClient } from '../../platform-api';

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
  it('selects a Linear issue in the Mission picker with its provider and source intact', async () => {
    const { api } = createClientApiMock();
    configureClawClient({ platform: 'desktop', api });
    api.listWorkRepositories.mockResolvedValue([{ provider: 'linear', id: 'linear:team', name: 'Engineering', fullName: 'Engineering', owner: 'ENG', isPrivate: true, url: 'https://linear.app' }]);
    const selected: WorkItem = { ...issue, provider: 'linear', id: 'linear:uuid', identifier: 'ENG-24', repositoryId: 'linear:team', linearSource: { teamId: 'team', teamName: 'Engineering' } };
    api.listWorkItems.mockResolvedValue([selected]);
    const wrapper = mount(RepositorySessionSourceDialog, { props: { visible: true, repositoryName: '', purpose: 'missionIssue' } });
    await wrapper.get('[aria-label="Backlog provider"] select').setValue('linear');
    await flushPromises();
    await wrapper.get('[aria-label="Team / project"] select').setValue('linear:team');
    await flushPromises();
    await wrapper.get('[aria-label="Search issues"]').setValue('ENG-24');
    await wrapper.get('.repository-session-source-dialog__result').trigger('click');
    expect(wrapper.emitted('select-work-item')).toEqual([[selected]]);
    expect(wrapper.find('[role="tab"]').exists()).toBe(false);
    configureClawClient();
  });
  it('browses Linear on the selected host, ignores an older source response, and keeps branch navigation on GitHub', async () => {
    const { api } = createClientApiMock();
    configureClawClient({ platform: 'desktop', api });
    const source = (id: string) => ({ provider: 'linear' as const, id: `linear:${id}`, owner: id, name: id, fullName: id, url: 'https://linear.app', isPrivate: true });
    api.listWorkRepositories.mockResolvedValue([source('eng'), source('ops')]);
    let resolveOld!: (items: WorkItem[]) => void;
    const item = { ...issue, provider: 'linear' as const, id: 'linear:uuid', identifier: 'OPS-24', repositoryId: 'linear:ops', body: 'Issue details', nativeState: 'In progress' };
    api.listWorkItems.mockImplementation(async (_provider, id) => id === 'linear:eng' ? new Promise(resolve => { resolveOld = resolve; }) : [item]);
    const location = { kind: 'remote' as const, remoteConnectionId: 'remote-one' };
    const wrapper = mount(RepositorySessionSourceDialog, { props: { visible: true, repositoryName: 'claw', branches, workItems: [issue], location } });
    await wrapper.findAll('[role="tab"]')[2].trigger('click');
    await wrapper.get('[aria-label="Backlog provider"] select').setValue('linear');
    await flushPromises();
    await wrapper.get('[aria-label="Team / project"] select').setValue('linear:eng');
    await flushPromises();
    await wrapper.get('[aria-label="Team / project"] select').setValue('linear:ops');
    await flushPromises();
    resolveOld([{ ...item, identifier: 'ENG-24', repositoryId: 'linear:eng' }]);
    await flushPromises();
    expect(wrapper.text()).toContain('OPS-24');
    expect(wrapper.text()).not.toContain('ENG-24');
    expect(api.listWorkItems).toHaveBeenLastCalledWith('linear', 'linear:ops', location, { kind: 'issue', state: 'all' });
    await wrapper.get('.repository-session-source-dialog__result').trigger('click');
    expect(wrapper.get('.linear-issue-detail').text()).toContain('Issue details');
    expect(wrapper.findComponent({ name: 'WorkItemAssignmentPicker' }).exists()).toBe(false);
    await wrapper.get('[aria-label="Back"]').trigger('click');
    await wrapper.findAll('[role="tab"]')[0].trigger('click');
    await wrapper.get('.repository-session-source-dialog__result').trigger('click');
    expect(wrapper.emitted('select-branch')).toEqual([[branches[0]]]);
    await wrapper.findAll('[role="tab"]')[2].trigger('click');
    await wrapper.get('[aria-label="Backlog provider"] select').setValue('github');
    api.listWorkRepositories.mockRejectedValueOnce(new Error('Linear unavailable'));
    await wrapper.get('[aria-label="Backlog provider"] select').setValue('linear');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Linear unavailable');
    await wrapper.findAll('[role="tab"]')[0].trigger('click');
    expect(wrapper.findAll('.repository-session-source-dialog__result')).toHaveLength(3);
    configureClawClient();
  });
  it('renders a footer only when there is a backend choice', async () => {
    const choices = ref<('codex' | 'claude')[]>(['codex']);
    const wrapper = mount(RepositorySessionSourceDialog, {
      props: { visible: true, repositoryName: 'claw', branches },
      global: {
        components: { ElDialog },
        provide: { [backendChoicesKey as symbol]: computed(() => choices.value) },
      },
    });
    await flushPromises();
    for (const tab of wrapper.findAll('[role="tab"]')) {
      await tab.trigger('click');
      expect(wrapper.find('.el-dialog__footer').exists()).toBe(false);
    }
    choices.value = ['codex', 'claude'];
    await flushPromises();
    expect(wrapper.find('.el-dialog__footer .backend-selector').exists()).toBe(true);
    choices.value = ['codex'];
    await flushPromises();
    expect(wrapper.find('.el-dialog__footer').exists()).toBe(false);
  });

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

  it('reuses the source dialog as a cross-repository issue picker without branch or PR actions', async () => {
    const pullRequest: WorkItem = { ...issue, id: 'github:nbonamy/codex-claw#25', number: 25, kind: 'pullRequest', title: 'Update UI' };
    const wrapper = mount(RepositorySessionSourceDialog, {
      props: {
        visible: true,
        purpose: 'missionIssue',
        repositoryName: '',
        repositories: [
          { provider: 'github', id: 'first', owner: 'nbonamy', name: 'codex-claw', fullName: 'nbonamy/codex-claw', url: 'https://github.com/nbonamy/codex-claw', isPrivate: false },
          { provider: 'github', id: 'second', owner: 'nbonamy', name: 'other', fullName: 'nbonamy/other', url: 'https://github.com/nbonamy/other', isPrivate: false },
        ],
        selectedRepositoryId: 'first',
        branches,
        workItems: [issue, pullRequest],
      },
    });
    await flushPromises();

    // The compact dialog removes Element Plus's default header padding. Reserve
    // its 48px close-button hit target before placing the repository selector.
    expect(getComputedStyle(wrapper.get('.el-dialog__header').element).paddingRight).toBe('48px');

    expect(wrapper.find('[role="tab"]').exists()).toBe(false);
    expect(wrapper.findAll('.repository-session-source-dialog__result')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Update UI');
    await wrapper.get('[aria-label="Repository"] select').setValue('second');
    expect(wrapper.emitted('select-repository')).toStrictEqual([['second']]);
    await wrapper.get('[aria-label="Search issues"]').setValue('not found');
    expect(wrapper.find('.repository-session-source-dialog__result').exists()).toBe(false);
    await wrapper.get('[aria-label="Search issues"]').setValue('Repository-first');
    await wrapper.get('.repository-session-source-dialog__result').trigger('click');
    expect(wrapper.emitted('select-work-item')).toStrictEqual([[issue]]);
    expect(wrapper.findComponent({ name: 'WorkItemAssignmentPicker' }).exists()).toBe(false);
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
      { action: 'fix', destination: 'new', item: issue, backend: 'codex' },
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
