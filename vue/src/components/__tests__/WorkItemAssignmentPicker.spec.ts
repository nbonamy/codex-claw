import { mount } from '@vue/test-utils';
import { computed } from 'vue';
import { backendChoicesKey } from '../backend-selection';
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
      global: { provide: { [backendChoicesKey as symbol]: computed(() => ['codex', 'claude']) } },
    });

    const destinationButtons = wrapper.findAll('.work-item-assignment-picker__target-options button');
    expect(destinationButtons[0]!.text()).toContain('New agent');
    expect(destinationButtons[0]!.text()).toContain('Create an agent in a dedicated worktree.');
    expect(destinationButtons[0]!.classes()).toContain('is-selected');
    expect(destinationButtons[0]!.attributes('aria-pressed')).toBe('true');
    expect(destinationButtons[1]!.text()).toContain('Existing agent');
    expect(destinationButtons[1]!.attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('input[aria-label="Branch"]').attributes('readonly')).toBeDefined();
    expect(wrapper.find<HTMLInputElement>('input[aria-label="Branch"]').element.value).toBe('fix/gh-24');
    expect(wrapper.find('.work-item-assignment-picker__workspace').text()).not.toContain('Workspace');
    expect(wrapper.find('.work-item-assignment-picker__workspace').text()).not.toContain('New worktree');
    await wrapper.get('.backend-selector select').setValue('claude');
    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('submit')).toStrictEqual([[
      { action: 'fix', destination: 'new', item: issue, backend: 'claude' },
    ]]);
    await destinationButtons[1]!.trigger('click');
    expect(wrapper.find('.backend-selector').exists()).toBe(false);
  });

  it('assigns an existing repository session without offering a worktree', async () => {
    const wrapper = mount(WorkItemAssignmentPicker, {
      props: {
        item: issue,
        branchName: 'fix/gh-24',
        sessions: [{ agentId: 'agent-main', label: 'main · main' }],
      },
    });

    await wrapper.findAll('.work-item-assignment-picker__target-options button')[1]!.trigger('click');
    expect(wrapper.findAll('.work-item-assignment-picker__target-options button')[1]!.attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('main · main');
    expect(wrapper.text()).toContain('Assign this branch to one of your agents.');
    expect(wrapper.text()).toContain('Uses the selected agent’s current folder. No worktree will be created.');
    expect(wrapper.find('.work-item-assignment-picker__branch-warning svg').exists()).toBe(true);
    expect(wrapper.find<HTMLInputElement>('input[aria-label="Branch"]').element.value).toBe('fix/gh-24');
    await wrapper.get('.claw-button--secondary').trigger('click');

    expect(wrapper.emitted('submit')).toStrictEqual([[
      { action: 'investigate', agentId: 'agent-main', destination: 'existing', item: issue },
    ]]);
  });

  it('disables existing-session assignment when the repository has no session', () => {
    const wrapper = mount(WorkItemAssignmentPicker, {
      props: { item: issue, branchName: 'fix/gh-24' },
    });

    const existingButton = wrapper.findAll('.work-item-assignment-picker__target-options button')[1]!;
    expect(existingButton.attributes('disabled')).toBeDefined();
    expect(existingButton.text()).toContain('No agents are available in this repository');
  });

  it('asks before reusing an existing worktree', async () => {
    const wrapper = mount(WorkItemAssignmentPicker, {
      props: {
        item: issue,
        branchName: 'fix/gh-24',
        existingWorktreePath: '/Users/nbonamy/src/codex-claw-fix-gh-24',
      },
    });

    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Worktree already exists');
    expect(wrapper.text()).toContain('fix/gh-24 is already checked out at:');
    expect(wrapper.text()).toContain('/Users/nbonamy/src/codex-claw-fix-gh-24');

    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('submit')).toStrictEqual([[
      { action: 'fix', destination: 'new', item: issue, reuseExisting: true, backend: 'codex' },
    ]]);
  });
});
