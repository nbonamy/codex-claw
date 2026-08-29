import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GitWorkflowControl from '../GitWorkflowControl.vue';
import type { Agent, AgentGitStatus, AgentGitWorkflow } from '@codex-claw/core/contracts';

const agent = { id: 'agent-1', name: 'Dina', avatar: 'DI', folder: '/repo/worktree', backend: 'codex', backendDefaults: { kind: 'codex' }, status: { type: 'idle' }, createdAt: '', updatedAt: '' } as Agent;
const status: AgentGitStatus = { folder: agent.folder, branch: 'feature/demo', ahead: 2, behind: 0, changedFiles: 2, addedLines: 4, removedLines: 1, hasUntracked: false, state: 'dirty', updatedAt: '' };
const workflow: AgentGitWorkflow = { repository: 'owner/repo', folder: agent.folder, isLinkedWorktree: true, branch: 'feature/demo', detached: false, remote: 'origin', remoteUrl: 'git@github.com:owner/repo.git', upstream: 'origin/feature/demo', ahead: 2, behind: 0, stagedAddedLines: 4, stagedRemovedLines: 1, unstagedAddedLines: 2, unstagedRemovedLines: 0, untrackedAddedLines: 3, untrackedRemovedLines: 0, files: [{ path: 'a.ts', indexStatus: ' ', worktreeStatus: 'M' }, { path: 'new.ts', indexStatus: '?', worktreeStatus: '?' }], stagedFiles: [], unstagedFiles: ['a.ts', 'new.ts'], githubConnected: true };
const componentSource = readFileSync(resolve(process.cwd(), 'src/components/GitWorkflowControl.vue'), 'utf8');

function mountControl(overrides: Partial<Record<string, unknown>> = {}) {
  return mount(GitWorkflowControl, { props: { agent, gitStatus: status, getWorkflow: async () => workflow, ...overrides }, global: { plugins: [ElementPlus] } });
}

describe('GitWorkflowControl', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps dialog titles on one line while repository context truncates', () => {
    expect(componentSource).toMatch(/\.git-workflow-control__dialog-header \.claw-dialog__title\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s);
    expect(componentSource).toMatch(/\.git-workflow-control__dialog-header \.git-workflow-control__branch\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 auto;/s);
  });

  it('keeps the push summary left aligned', () => {
    expect(componentSource).toMatch(/\.git-workflow-control__push-summary\s*\{[^}]*justify-items:\s*start;[^}]*text-align:\s*left;/s);
    expect(componentSource).toMatch(/\.git-workflow-control__push-count\s*\{[^}]*justify-self:\s*start;[^}]*text-align:\s*left;/s);
  });

  it('uses one border for focused merge choices', () => {
    expect(componentSource).toMatch(/\.git-workflow-control__merge-strategy label:focus-within\s*\{[^}]*border-color:\s*var\(--color-primary\);/s);
    expect(componentSource).not.toMatch(/\.git-workflow-control__merge-strategy label:focus-within\s*\{[^}]*outline:/s);
  });

  it('opens the commit dialog as the first enabled action', async () => {
    const commitChanges = vi.fn(async () => workflow);
    const wrapper = mountControl({ commitChanges });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__primary').trigger('click');
    expect(wrapper.find('[role="dialog"]').attributes('aria-labelledby')).toBeDefined();
    expect(wrapper.text()).toContain('Commit and push');
    expect(wrapper.findAll('.claw-dialog__footer .claw-button:not(.claw-button--tertiary)').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.findAll('.claw-dialog__footer .claw-button--tertiary').map((button) => button.text())).toStrictEqual(['Cancel']);
    expect(submitButton(wrapper, 'Commit').classes()).toContain('claw-button--secondary');
    expect(submitButton(wrapper, 'Commit and push').classes()).toContain('claw-button--primary');
    expect(wrapper.findAll('.git-workflow-control__scope-row')).toHaveLength(3);
    expect(wrapper.findAll('.git-workflow-control__stats')[0]?.text()).toContain('+4');
    expect(wrapper.findAll('.git-workflow-control__stats')[0]?.text()).toContain('−1');
    expect(wrapper.findAll('.git-workflow-control__stats')[1]?.text()).toContain('+2');
    expect(wrapper.findAll('.git-workflow-control__stats')[2]?.text()).toContain('+3');
    expect(wrapper.findAll('.git-workflow-control__stats')[2]?.text()).toContain('−0');
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })[0]?.props('modelValue')).toBe(true);
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })[1]?.props('modelValue')).toBe(false);
    expect(wrapper.findAll('.git-workflow-control__stats')[2]?.classes()).toContain('git-workflow-control__stats--muted');
    await wrapper.findAllComponents({ name: 'ElSwitch' })[0]!.setValue(false);
    expect(wrapper.findAll('.git-workflow-control__stats')[1]?.classes()).toContain('git-workflow-control__stats--muted');
    await wrapper.findAllComponents({ name: 'ElSwitch' })[1]!.setValue(true);
    expect(wrapper.findAll('.git-workflow-control__stats')[2]?.classes()).not.toContain('git-workflow-control__stats--muted');
  });

  it('keeps commit enabled from the header status while workflow details refresh', async () => {
    const pendingWorkflow = deferred<AgentGitWorkflow>();
    const wrapper = mountControl({ getWorkflow: () => pendingWorkflow.promise });
    await wrapper.get('.git-workflow-control__trigger').trigger('click');

    const commit = wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Commit'));
    expect(commit?.attributes('disabled')).toBeUndefined();

    pendingWorkflow.resolve(workflow);
    await flushPromises();
  });

  it('shows commit progress and passive success before closing automatically', async () => {
    const pendingCommit = deferred<AgentGitWorkflow>();
    const commitChanges = vi.fn(() => pendingCommit.promise);
    const wrapper = mountControl({ commitChanges });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__primary').trigger('click');
    await wrapper.get('textarea').setValue('test: commit selected changes');
    await submitButton(wrapper, 'Commit').trigger('click');

    expect(wrapper.text()).toContain('Creating commit');
    expect(wrapper.text()).toContain('test: commit selected changes');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    vi.useFakeTimers();
    pendingCommit.resolve({ ...workflow, files: [], stagedFiles: [], unstagedFiles: [] });
    await flushPromises();

    expect(wrapper.text()).toContain('Commit created');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('generates an editable commit message from the selected scopes', async () => {
    const pendingGeneration = deferred<{ kind: 'commit'; message: string }>();
    const generateMessage = vi.fn(() => pendingGeneration.promise);
    const wrapper = mountControl({ generateMessage });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__primary').trigger('click');
    await wrapper.findAllComponents({ name: 'ElSwitch' })[0]!.setValue(false);
    await wrapper.findAllComponents({ name: 'ElSwitch' })[1]!.setValue(true);
    const generate = wrapper.get('[aria-label="Generate commit message with Codex"]');
    await generate.trigger('click');

    expect(generateMessage).toHaveBeenCalledWith('agent-1', {
      kind: 'commit',
      includeUnstaged: false,
      includeUntracked: true,
    });
    expect(wrapper.text()).toContain('Generating…');

    pendingGeneration.resolve({ kind: 'commit', message: 'feat: improve Git drafts' });
    await flushPromises();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('feat: improve Git drafts');
    await wrapper.get('textarea').setValue('feat: edit the generated draft');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('feat: edit the generated draft');
  });

  it('retries only the push when commit and push partially fails', async () => {
    const commitChanges = vi.fn(async () => ({ ...workflow, files: [], stagedFiles: [], unstagedFiles: [], ahead: 3 }));
    const pushBranch = vi.fn()
      .mockRejectedValueOnce(new Error('Remote rejected the push.'))
      .mockResolvedValueOnce({ ...workflow, files: [], stagedFiles: [], unstagedFiles: [], ahead: 0 });
    const wrapper = mountControl({ commitChanges, pushBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__primary').trigger('click');
    await wrapper.get('textarea').setValue('test: commit before push');
    await submitButton(wrapper, 'Commit and push').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Commit created, but push failed');
    expect(wrapper.text()).toContain('Remote rejected the push.');
    expect(commitChanges).toHaveBeenCalledTimes(1);
    expect(pushBranch).toHaveBeenCalledTimes(1);

    await submitButton(wrapper, 'Retry push').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Committed and pushed');
    expect(commitChanges).toHaveBeenCalledTimes(1);
    expect(pushBranch).toHaveBeenCalledTimes(2);
  });

  it('confirms a push before showing progress and passive success', async () => {
    const pendingPush = deferred<AgentGitWorkflow>();
    const pushBranch = vi.fn(() => pendingPush.promise);
    const wrapper = mountControl({ pushBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Push'))?.trigger('click');

    expect(wrapper.text()).toContain('Push changes');
    expect(wrapper.find('.git-workflow-control__dialog-header .git-workflow-control__branch').text()).toBe('owner/repo · feature/demo');
    expect(wrapper.find('.git-workflow-control__push-count').text()).toBe('2 commits');
    expect(wrapper.find('.git-workflow-control__push-destination').text()).toBe('origin/feature/demo');
    expect(wrapper.find('.git-workflow-control__push-arrow').exists()).toBe(true);
    expect(wrapper.text()).toContain('Uncommitted changes stay in this worktree and will not be pushed.');
    expect(pushBranch).not.toHaveBeenCalled();

    await submitButton(wrapper, 'Push').trigger('click');
    expect(wrapper.text()).toContain('Pushing 2 commits');
    expect(pushBranch).toHaveBeenCalledWith('agent-1', { confirmed: true });

    vi.useFakeTimers();
    pendingPush.resolve({ ...workflow, files: [], stagedFiles: [], unstagedFiles: [], ahead: 0 });
    await flushPromises();

    expect(wrapper.text()).toContain('Push complete');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('keeps a failed push open and retries from the same dialog', async () => {
    const pushBranch = vi.fn()
      .mockRejectedValueOnce(new Error('Remote rejected the push.'))
      .mockResolvedValueOnce({ ...workflow, files: [], stagedFiles: [], unstagedFiles: [], ahead: 0 });
    const wrapper = mountControl({ pushBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Push'))?.trigger('click');
    await submitButton(wrapper, 'Push').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Push failed');
    expect(wrapper.text()).toContain('Remote rejected the push.');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    await submitButton(wrapper, 'Retry').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Push complete');
    expect(pushBranch).toHaveBeenCalledTimes(2);
  });

  it('disables the untracked scope when the worktree has no untracked files', async () => {
    const cleanWorkflow = { ...workflow, files: workflow.files.filter((file) => file.indexStatus !== '?'), untrackedAddedLines: 0, untrackedRemovedLines: 0 };
    const wrapper = mountControl({ getWorkflow: async () => cleanWorkflow });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__primary').trigger('click');

    const switches = wrapper.findAllComponents({ name: 'ElSwitch' });
    expect(switches[1]?.props('disabled')).toBe(true);
    expect(wrapper.text()).toContain('No untracked files');
  });

  it('shows icon-only action menu entries without descriptions', async () => {
    const wrapper = mountControl();
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__trigger')).toBeTruthy());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    expect(wrapper.findAll('.app-menu__label').map((item) => item.text())).toStrictEqual([
      'Commit',
      'Push',
      'Merge',
      'Create PR',
    ]);
    expect(wrapper.find('.app-menu__description').exists()).toBe(false);
  });

  it('reloads action availability when the selected agent changes', async () => {
    const secondAgent = { ...agent, id: 'agent-2', folder: '/repo/other' };
    const secondWorkflow = { ...workflow, folder: secondAgent.folder, files: [], unstagedFiles: [], ahead: 3 };
    const getWorkflow = vi.fn(async (agentId: string) => agentId === agent.id ? workflow : secondWorkflow);
    const wrapper = mountControl({ getWorkflow });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.setProps({ agent: secondAgent });
    await vi.waitFor(() => expect(getWorkflow).toHaveBeenLastCalledWith('agent-2'));
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    const labels = wrapper.findAll('.app-menu__label').map((item) => item.text());
    expect(labels).toContain('Push');
  });

  it('uses the header git status as a push fallback while workflow data refreshes', async () => {
    const staleWorkflow = { ...workflow, ahead: undefined } as unknown as AgentGitWorkflow;
    const wrapper = mountControl({ getWorkflow: async () => staleWorkflow });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    const push = wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Push'));
    expect(push?.attributes('disabled')).toBeUndefined();
  });

  it('does not offer merge for the integration branch', async () => {
    const wrapper = mountControl({ getWorkflow: async () => ({ ...workflow, branch: 'main' }) });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    const merge = wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'));
    expect(merge?.attributes('disabled')).toBeDefined();
  });

  it('uses distinct icon-led strategy choices and secondary switch controls in the merge dialog', async () => {
    const mergeBranch = vi.fn(async () => workflow);
    const wrapper = mountControl({ mergeBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'))?.trigger('click');

    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true);
    const choices = wrapper.findAll('.git-workflow-control__merge-strategy label');
    expect(choices).toHaveLength(2);
    expect(choices[0]?.text()).toContain('Preserve every commit in a merge commit.');
    expect(choices[1]?.text()).toContain('Combine all changes into a single commit.');
    expect(wrapper.findAll('.git-workflow-control__merge-icon')).toHaveLength(2);
    expect(choices[0]?.classes()).toContain('git-workflow-control__merge-option--selected');
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })).toHaveLength(2);
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })[1]?.props('disabled')).toBe(true);
    await wrapper.findAllComponents({ name: 'ElSwitch' })[0]!.setValue(true);
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })[1]?.props('disabled')).toBe(false);
    await choices[1]?.find('input').setValue(true);
    expect(choices[1]?.classes()).toContain('git-workflow-control__merge-option--selected');
    const message = wrapper.get<HTMLTextAreaElement>('.git-workflow-control__merge-message');
    expect(message.element.value).toBe('');
    expect(message.attributes('placeholder')).toBe('Squash commit message…');
    expect(submitButton(wrapper, 'Merge').attributes('disabled')).toBeDefined();
    expect(submitButton(wrapper, 'Merge and push').attributes('disabled')).toBeDefined();
    await message.setValue('feat: combine demo work');
    await submitButton(wrapper, 'Merge').trigger('click');
    await flushPromises();
    expect(mergeBranch).toHaveBeenCalledWith('agent-1', {
      strategy: 'squash',
      commitMessage: 'feat: combine demo work',
      deleteBranch: false,
      deleteWorktree: true,
      confirmed: true,
    });
  });

  it('omits worktree cleanup when the agent uses the primary checkout', async () => {
    const primaryWorkflow = { ...workflow, isLinkedWorktree: false };
    const wrapper = mountControl({
      getWorkflow: async () => primaryWorkflow,
      mergeBranch: async () => primaryWorkflow,
    });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'))?.trigger('click');

    expect(wrapper.text()).not.toContain('Delete worktree after merging');
    expect(wrapper.text()).not.toContain('Delete branch after removing worktree');
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })).toHaveLength(0);
  });

  it('shows merge progress and passive success before closing automatically', async () => {
    const pendingMerge = deferred<AgentGitWorkflow>();
    const mergeBranch = vi.fn(() => pendingMerge.promise);
    const wrapper = mountControl({ mergeBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'))?.trigger('click');
    await submitButton(wrapper, 'Merge').trigger('click');

    expect(wrapper.text()).toContain('Merging feature/demo');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    vi.useFakeTimers();
    pendingMerge.resolve({ ...workflow, folder: '/repo', branch: 'main', isLinkedWorktree: false });
    await flushPromises();

    expect(wrapper.text()).toContain('Merge complete');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('merges and pushes the resulting base branch before showing passive success', async () => {
    const baseWorkflow = { ...workflow, folder: '/repo', branch: 'main', isLinkedWorktree: false, ahead: 3 };
    const pendingPush = deferred<AgentGitWorkflow>();
    const mergeBranch = vi.fn(async () => baseWorkflow);
    const pushBranch = vi.fn(() => pendingPush.promise);
    const wrapper = mountControl({ mergeBranch, pushBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'))?.trigger('click');
    await submitButton(wrapper, 'Merge and push').trigger('click');
    await flushPromises();

    expect(mergeBranch).toHaveBeenCalledTimes(1);
    expect(pushBranch).toHaveBeenCalledWith('agent-1', { confirmed: true, target: 'mergeTarget' });
    expect(wrapper.text()).toContain('Pushing merged branch');

    vi.useFakeTimers();
    pendingPush.resolve({ ...baseWorkflow, ahead: 0 });
    await flushPromises();

    expect(wrapper.text()).toContain('Merged and pushed');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('retries only the target push when merge and push partially fails', async () => {
    const baseWorkflow = { ...workflow, folder: '/repo', branch: 'main', isLinkedWorktree: false, ahead: 3 };
    const mergeBranch = vi.fn(async () => baseWorkflow);
    const pushBranch = vi.fn()
      .mockRejectedValueOnce(new Error('Remote rejected the base branch.'))
      .mockResolvedValueOnce({ ...baseWorkflow, ahead: 0 });
    const wrapper = mountControl({ mergeBranch, pushBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'))?.trigger('click');
    await submitButton(wrapper, 'Merge and push').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Merge complete, but push failed');
    expect(wrapper.text()).toContain('Remote rejected the base branch.');
    expect(mergeBranch).toHaveBeenCalledTimes(1);
    expect(pushBranch).toHaveBeenCalledTimes(1);

    await submitButton(wrapper, 'Retry push').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Merged and pushed');
    expect(mergeBranch).toHaveBeenCalledTimes(1);
    expect(pushBranch).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed merge open with its error and a retry action', async () => {
    const mergeBranch = vi.fn().mockRejectedValue(new Error('The linked worktree could not be removed.'));
    const wrapper = mountControl({ mergeBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'))?.trigger('click');
    await submitButton(wrapper, 'Merge').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Merge failed');
    expect(wrapper.text()).toContain('The linked worktree could not be removed.');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(submitButton(wrapper, 'Retry').exists()).toBe(true);
  });

  it('requires a feature branch for a PR even when main has uncommitted changes', async () => {
    const dirtyMain = { ...workflow, branch: 'main' };
    const mainWrapper = mountControl({ getWorkflow: async () => dirtyMain });
    await vi.waitFor(() => expect(mainWrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await mainWrapper.get('.git-workflow-control__trigger').trigger('click');
    const mainPr = mainWrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Create PR'));
    expect(mainPr?.attributes('disabled')).toBeDefined();

    const featureWrapper = mountControl({ getWorkflow: async () => ({ ...workflow, branch: 'feature/clean', files: [], unstagedFiles: [] }) });
    await vi.waitFor(() => expect(featureWrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await featureWrapper.get('.git-workflow-control__trigger').trigger('click');
    const featurePr = featureWrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Create PR'));
    expect(featurePr?.attributes('disabled')).toBeUndefined();
  });

  it('opens pull request fields in one writing surface', async () => {
    const wrapper = mountControl({
      getWorkflow: async () => ({ ...workflow, branch: 'feature/dialog' }),
    });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Create PR'))?.trigger('click');

    const writingSurface = wrapper.get('.git-workflow-control__pull-request-form');
    expect(writingSurface.get('input').attributes('placeholder')).toBe('Title');
    expect((writingSurface.get('input').element as HTMLInputElement).value).toBe('');
    expect(writingSurface.get('textarea').attributes('placeholder')).toBe('Describe the change (optional)');
  });

  it('generates an editable pull request title and body together', async () => {
    const generateMessage = vi.fn().mockResolvedValue({
      kind: 'pullRequest',
      title: 'Improve Git drafts',
      body: '## Summary\n- Add ephemeral generation',
    });
    const wrapper = mountControl({ generateMessage });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Create PR'))?.trigger('click');
    await wrapper.get('[aria-label="Generate pull request draft with Codex"]').trigger('click');
    await flushPromises();

    expect(generateMessage).toHaveBeenCalledWith('agent-1', { kind: 'pullRequest' });
    expect((wrapper.get('.git-workflow-control__pull-request-form input').element as HTMLInputElement).value).toBe('Improve Git drafts');
    expect((wrapper.get('.git-workflow-control__pull-request-form textarea').element as HTMLTextAreaElement).value).toContain('ephemeral generation');
  });

  it('does not offer Codex draft generation for Claude agents', async () => {
    const wrapper = mountControl({
      agent: { ...agent, backend: 'claude', backendDefaults: { kind: 'claude' } },
      generateMessage: vi.fn(),
    });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__primary').trigger('click');
    expect(wrapper.find('.git-workflow-control__generate').exists()).toBe(false);
  });

  it('shows pull request progress and passive success before closing automatically', async () => {
    const pendingPullRequest = deferred<AgentGitWorkflow>();
    const createPullRequest = vi.fn(() => pendingPullRequest.promise);
    const wrapper = mountControl({ createPullRequest });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Create PR'))?.trigger('click');
    await wrapper.get('.git-workflow-control__pull-request-form input').setValue('Improve Git workflow');
    await submitButton(wrapper, 'Create PR').trigger('click');

    expect(wrapper.text()).toContain('Creating pull request');
    expect(wrapper.text()).toContain('Improve Git workflow');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    vi.useFakeTimers();
    pendingPullRequest.resolve(workflow);
    await flushPromises();

    expect(wrapper.text()).toContain('Pull request created');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('keeps a failed pull request open and retries from the same dialog', async () => {
    const createPullRequest = vi.fn()
      .mockRejectedValueOnce(new Error('GitHub API rate limit exceeded.'))
      .mockResolvedValueOnce(workflow);
    const wrapper = mountControl({ createPullRequest });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Create PR'))?.trigger('click');
    await wrapper.get('.git-workflow-control__pull-request-form input').setValue('Improve Git workflow');
    await submitButton(wrapper, 'Create PR').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Pull request failed');
    expect(wrapper.text()).toContain('GitHub API rate limit exceeded.');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    await submitButton(wrapper, 'Retry').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Pull request created');
    expect(createPullRequest).toHaveBeenCalledTimes(2);
  });

  it('does not reload workflow state when the menu opens', async () => {
    const getWorkflow = vi.fn(async () => workflow);
    const wrapper = mountControl({ getWorkflow });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await flushPromises();

    expect(getWorkflow).toHaveBeenCalledOnce();
  });

  it('reloads workflow state once when git status changes', async () => {
    const getWorkflow = vi.fn(async () => workflow);
    const wrapper = mountControl({ getWorkflow });
    await vi.waitFor(() => expect(getWorkflow).toHaveBeenCalledOnce());

    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    expect(wrapper.get('.git-workflow-control__trigger').attributes('aria-expanded')).toBe('true');

    await wrapper.setProps({ gitStatus: { ...status, updatedAt: '2026-08-11T20:00:00.000Z' } });
    await flushPromises();

    expect(wrapper.get('.git-workflow-control__trigger').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    expect(getWorkflow).toHaveBeenCalledTimes(2);
  });

  it('coalesces a git status update with an in-flight active-agent workflow load', async () => {
    const pendingWorkflow = deferred<AgentGitWorkflow>();
    const getWorkflow = vi.fn(() => pendingWorkflow.promise);
    const wrapper = mountControl({ getWorkflow });
    await vi.waitFor(() => expect(getWorkflow).toHaveBeenCalledOnce());

    await wrapper.setProps({ gitStatus: { ...status, updatedAt: '2026-08-11T20:00:00.000Z' } });
    await flushPromises();

    expect(getWorkflow).toHaveBeenCalledOnce();
    pendingWorkflow.resolve(workflow);
    await flushPromises();
  });

  it('keeps the last known action availability when the menu opens', async () => {
    const getWorkflow = vi.fn().mockResolvedValueOnce(workflow);
    const wrapper = mountControl({ getWorkflow });
    await vi.waitFor(() => expect(getWorkflow).toHaveBeenCalledOnce());
    await flushPromises();

    await wrapper.get('.git-workflow-control__trigger').trigger('click');

    const push = wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Push'));
    const createPr = wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Create PR'));
    expect(push?.attributes('disabled')).toBeUndefined();
    expect(createPr?.attributes('disabled')).toBeUndefined();
    expect(getWorkflow).toHaveBeenCalledOnce();
  });
});

function submitButton(wrapper: ReturnType<typeof mountControl>, label: string) {
  const button = wrapper.findAll('.claw-dialog__footer .claw-button').find((candidate) => candidate.text() === label);
  if (!button) throw new Error(`Submit button not found: ${label}`);
  return button;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
