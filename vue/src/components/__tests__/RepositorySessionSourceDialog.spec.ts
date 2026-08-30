import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import type { SourceBranch, WorkItem } from '@codex-claw/core/contracts';
import RepositorySessionSourceDialog from '../RepositorySessionSourceDialog.vue';

const componentSource = readFileSync(resolve(process.cwd(), 'src/components/RepositorySessionSourceDialog.vue'), 'utf8');

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
  it('keeps branch metadata compact and gives branch states distinct semantics', async () => {
    const wrapper = mount(RepositorySessionSourceDialog, {
      props: {
        visible: true,
        repositoryName: 'codex-claw',
        branches,
      },
      global: { plugins: [ElementPlus] },
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
      global: { plugins: [ElementPlus] },
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

  it('keeps text centered inside the outer pill tabs', () => {
    expect(componentSource).toMatch(/el-tabs__item\.is-top:nth-child\(2\)\)[^{]*\{[^}]*padding-left:\s*var\(--space-6\);/s);
    expect(componentSource).toMatch(/el-tabs__item\.is-top:last-child\)[^{]*\{[^}]*padding-right:\s*var\(--space-6\);/s);
  });

  it('animates the forwarded Element Plus dialog root when its width changes', () => {
    expect(componentSource).toMatch(/:global\(\.repository-session-source-dialog\.el-dialog\)[^{]*\{[^}]*transition:\s*width 240ms ease;/s);
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
      global: { plugins: [ElementPlus] },
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
    expect(wrapper.get('.repository-session-source-dialog').attributes('style')).toContain('width: 480px');

    await wrapper.get('.claw-button--primary').trigger('click');
    expect(wrapper.emitted('start-work-item')).toStrictEqual([[
      { action: 'fix', destination: 'new', item: issue },
    ]]);
  });
});
