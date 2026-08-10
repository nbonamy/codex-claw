import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import GitWorkflowControl from '../GitWorkflowControl.vue';
import type { Agent, AgentGitStatus, AgentGitWorkflow } from '@codex-claw/core/contracts';

const agent = { id: 'agent-1', name: 'Dina', avatar: 'DI', folder: '/repo/worktree', backend: 'codex', backendDefaults: { kind: 'codex' }, status: { type: 'idle' }, createdAt: '', updatedAt: '' } as Agent;
const status: AgentGitStatus = { folder: agent.folder, branch: 'feature/demo', ahead: 2, behind: 0, changedFiles: 2, addedLines: 4, removedLines: 1, hasUntracked: false, state: 'dirty', updatedAt: '' };
const workflow: AgentGitWorkflow = { repository: 'owner/repo', folder: agent.folder, branch: 'feature/demo', detached: false, remote: 'origin', remoteUrl: 'git@github.com:owner/repo.git', upstream: 'origin/feature/demo', ahead: 2, behind: 0, stagedAddedLines: 4, stagedRemovedLines: 1, unstagedAddedLines: 2, unstagedRemovedLines: 0, untrackedAddedLines: 3, untrackedRemovedLines: 0, files: [{ path: 'a.ts', indexStatus: ' ', worktreeStatus: 'M' }, { path: 'new.ts', indexStatus: '?', worktreeStatus: '?' }], stagedFiles: [], unstagedFiles: ['a.ts', 'new.ts'], githubConnected: true };

function mountControl(overrides: Partial<Record<string, unknown>> = {}) {
  return mount(GitWorkflowControl, { props: { agent, gitStatus: status, getWorkflow: async () => workflow, ...overrides }, global: { plugins: [ElementPlus] } });
}

describe('GitWorkflowControl', () => {
  it('opens the commit dialog as the first enabled action', async () => {
    const commitChanges = vi.fn(async () => workflow);
    const wrapper = mountControl({ commitChanges });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__primary').trigger('click');
    expect(wrapper.find('[role="dialog"]').attributes('aria-labelledby')).toBeDefined();
    expect(wrapper.text()).toContain('Commit and push');
    expect(wrapper.findAll('.git-workflow-control__submit').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.find('.git-workflow-control__stats').text()).toContain('+6');
    expect(wrapper.findAll('.git-workflow-control__stats')[1]?.text()).toBe('+3');
    await wrapper.findAllComponents({ name: 'ElSwitch' })[0]!.setValue(false);
    expect(wrapper.find('.git-workflow-control__stats').text()).toContain('+6');
    expect(wrapper.findAll('.git-workflow-control__stats')[0]?.classes()).toContain('git-workflow-control__stats--muted');
    await wrapper.findAllComponents({ name: 'ElSwitch' })[1]!.setValue(false);
    expect(wrapper.find('.git-workflow-control__stats').text()).toContain('+6');
    expect(wrapper.findAll('.git-workflow-control__stats')[1]?.classes()).toContain('git-workflow-control__stats--muted');
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
    expect(wrapper.find('[role="menu"]').text()).toContain('Commit');
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

  it('uses a quiet strategy choice and switch controls in the merge dialog', async () => {
    const mergeBranch = vi.fn(async () => workflow);
    const wrapper = mountControl({ mergeBranch });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]').find((item) => item.text().includes('Merge'))?.trigger('click');

    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true);
    expect(wrapper.findAll('.git-workflow-control__merge-strategy label')).toHaveLength(2);
    expect(wrapper.findAllComponents({ name: 'ElSwitch' })).toHaveLength(2);
  });

  it('requires changes for a PR from main but allows a clean feature branch', async () => {
    const cleanMain = { ...workflow, branch: 'main', files: [], unstagedFiles: [] };
    const mainWrapper = mountControl({ getWorkflow: async () => cleanMain });
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

  it('refreshes stale workflow state when the menu opens', async () => {
    let clean = false;
    const getWorkflow = vi.fn(async () => clean ? { ...workflow, files: [], unstagedFiles: [], ahead: 0 } : workflow);
    const wrapper = mountControl({ getWorkflow });
    await vi.waitFor(() => expect(wrapper.get('.git-workflow-control__primary').attributes('disabled')).toBeUndefined());
    clean = true;
    await wrapper.get('.git-workflow-control__trigger').trigger('click');
    await vi.waitFor(() => expect(getWorkflow).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(wrapper.get('.app-menu__item').attributes('disabled')).toBeDefined());
  });
});
