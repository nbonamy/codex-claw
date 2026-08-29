import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import type { SourceBranch } from '@codex-claw/core/contracts';
import RepositorySessionSourceDialog from '../RepositorySessionSourceDialog.vue';

const componentSource = readFileSync(resolve(process.cwd(), 'src/components/RepositorySessionSourceDialog.vue'), 'utf8');

const branches: SourceBranch[] = [
  { name: 'main', isDefault: true, worktreePath: '/repos/project' },
  { name: 'feat/polish-dialog', isDefault: false, worktreePath: '/repos/project-polish' },
  { name: 'fix/menu-dismissal', isDefault: false },
];

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

  it('uses the standard tab indicator without pill styling', () => {
    expect(componentSource).not.toMatch(/el-tabs__active-bar[^}]*display:\s*none;/s);
    expect(componentSource).not.toMatch(/el-tabs__item\)[^{]*\{[^}]*border-radius:/s);
    expect(componentSource).not.toMatch(/el-tabs__item\.is-active\)[^{]*\{[^}]*background:\s*var\(--color-surface-base\);/s);
  });
});
