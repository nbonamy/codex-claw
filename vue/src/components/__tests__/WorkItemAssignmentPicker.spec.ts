import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import type { WorkItem } from '@codex-claw/core/contracts';
import WorkItemAssignmentPicker from '../WorkItemAssignmentPicker.vue';

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

describe('WorkItemAssignmentPicker', () => {
  it('defaults to an isolated session and emits the tuned primary action', async () => {
    const wrapper = mount(WorkItemAssignmentPicker, {
      props: {
        item: issue,
        branchName: 'fix/gh-24',
        sessions: [{ agentId: 'agent-main', label: 'main · main' }],
      },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.get('.work-item-assignment-picker__target-options button.is-selected').text())
      .toContain('New isolated session');
    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('submit')).toStrictEqual([[
      { action: 'fix', destination: 'new', item: issue },
    ]]);
  });

  it('assigns an existing repository session without offering a worktree', async () => {
    const wrapper = mount(WorkItemAssignmentPicker, {
      props: {
        item: issue,
        branchName: 'fix/gh-24',
        sessions: [{ agentId: 'agent-main', label: 'main · main' }],
      },
      global: { plugins: [ElementPlus] },
    });

    await wrapper.findAll('.work-item-assignment-picker__target-options button')[0]!.trigger('click');
    expect(wrapper.text()).toContain('main · main');
    expect(wrapper.text()).toContain('This switches the selected session’s current folder to this branch. No worktree is created.');
    expect(wrapper.find('.work-item-assignment-picker__branch-warning svg').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('New worktree');
    await wrapper.get('.claw-button--secondary').trigger('click');

    expect(wrapper.emitted('submit')).toStrictEqual([[
      { action: 'investigate', agentId: 'agent-main', destination: 'existing', item: issue },
    ]]);
  });

  it('disables existing-session assignment when the repository has no session', () => {
    const wrapper = mount(WorkItemAssignmentPicker, {
      props: { item: issue, branchName: 'fix/gh-24' },
      global: { plugins: [ElementPlus] },
    });

    const existingButton = wrapper.findAll('.work-item-assignment-picker__target-options button')[0]!;
    expect(existingButton.attributes('disabled')).toBeDefined();
    expect(existingButton.text()).toContain('No sessions are available in this repository');
  });
});
