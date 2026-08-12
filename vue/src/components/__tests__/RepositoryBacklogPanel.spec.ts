import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, WorkItem } from '@codex-claw/core/contracts';
import { i18n } from '../../i18n';
import RepositoryBacklogPanel from '../RepositoryBacklogPanel.vue';

describe('RepositoryBacklogPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('separates issues and pull requests and filters the visible list', async () => {
    const wrapper = mountPanel({
      items: [
        workItem(),
        workItem({ id: 'nbonamy/codex-claw#21', kind: 'pullRequest', number: 21, title: 'Ship backlog workspace' }),
      ],
    });

    expect(wrapper.findAll('.repository-backlog__segments button svg')).toHaveLength(2);
    expect(wrapper.text()).toContain('Fix backlog assignment');
    expect(wrapper.text()).not.toContain('Ship backlog workspace');

    await wrapper.get('[role="radio"][aria-checked="false"]').trigger('click');

    expect(wrapper.text()).not.toContain('Fix backlog assignment');
    expect(wrapper.text()).toContain('Ship backlog workspace');
  });

  it('opens issue and pull request titles in the system browser without adding another row action', async () => {
    const wrapper = mountPanel({
      items: [
        workItem(),
        workItem({
          id: 'nbonamy/codex-claw#21',
          kind: 'pullRequest',
          number: 21,
          title: 'Ship backlog workspace',
          url: 'https://github.com/nbonamy/codex-claw/pull/21',
        }),
      ],
    });

    const issueLink = wrapper.get('.repository-backlog__item-title');
    expect(issueLink.attributes()).toMatchObject({
      href: 'https://github.com/nbonamy/codex-claw/issues/12',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(wrapper.findAll('[aria-label^="Work item actions"]')).toHaveLength(1);

    await wrapper.get('[role="radio"][aria-checked="false"]').trigger('click');

    const pullRequestLink = wrapper.get('.repository-backlog__item-title');
    expect(pullRequestLink.attributes('href')).toBe('https://github.com/nbonamy/codex-claw/pull/21');
    expect(wrapper.findAll('[aria-label^="Work item actions"]')).toHaveLength(1);
  });

  it('keeps only active assignments in needs attention', () => {
    const wrapper = mountPanel({
      assignments: {
        'github:nbonamy/codex-claw#12': {
          provider: 'github',
          itemId: 'nbonamy/codex-claw#12',
          agentId: agent.id,
          assignedAt: '2026-08-12T00:00:00.000Z',
          status: 'completed',
        },
      },
    });

    expect(wrapper.text()).not.toContain('Needs attention');
    expect(wrapper.text()).toContain('Fix backlog assignment');
  });

  it('keeps search collapsed until requested and clears it when closed', async () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[aria-label="Search repository work"]').exists()).toBe(true);
    expect(wrapper.find('input[aria-label="Search repository work"]').exists()).toBe(false);

    await wrapper.get('button[aria-label="Search repository work"]').trigger('click');
    const search = wrapper.get('input[aria-label="Search repository work"]');

    await search.setValue('missing');
    expect(wrapper.text()).toContain('No matching work items');

    await wrapper.get('button[aria-label="Close search"]').trigger('click');
    expect(wrapper.find('input[aria-label="Search repository work"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Fix backlog assignment');
  });

  it('saves filter defaults for only the current repository', async () => {
    const wrapper = mountPanel({
      items: [
        workItem(),
        workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Completed backlog work', state: 'closed' }),
      ],
    });

    wrapper.findAllComponents({ name: 'ElPopover' }).at(0)?.vm.$emit('update:visible', true);
    await nextTick();
    wrapper.findAllComponents({ name: 'ElSelect' }).at(0)?.vm.$emit('update:modelValue', 'closed');
    await nextTick();
    await wrapper.get('.repository-backlog__filter-menu footer button').trigger('click');

    expect(window.localStorage.getItem('repositoryBacklogFilters:nbonamy/codex-claw')).toBe(JSON.stringify({
      state: 'closed',
      assignee: 'all',
      label: '',
    }));

    wrapper.unmount();
    const restored = mountPanel({
      items: [
        workItem(),
        workItem({ id: 'nbonamy/codex-claw#13', number: 13, title: 'Completed backlog work', state: 'closed' }),
      ],
    });
    expect(restored.text()).not.toContain('Fix backlog assignment');
    expect(restored.text()).toContain('Completed backlog work');

    const otherRepository = mountPanel({ repositoryId: 'nbonamy/another-repository' });
    expect(otherRepository.text()).toContain('Fix backlog assignment');
  });

  it('ignores invalid or unavailable saved filter defaults', () => {
    window.localStorage.setItem('repositoryBacklogFilters:nbonamy/codex-claw', JSON.stringify({
      state: 'invalid',
      assignee: 'me',
      label: 'not-in-this-repository',
    }));

    const wrapper = mountPanel({ connection: null });

    expect(wrapper.text()).toContain('Fix backlog assignment');
  });

  it('offers contextual issue actions and fixes an issue in an isolated worktree', async () => {
    const startWorkAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ startWorkAction });

    await wrapper.get('[aria-label="Work item actions #12"]').trigger('click');
    expect(wrapper.text()).toContain('Start work on #12');
    expect(wrapper.text()).toContain('Custom');
    expect(wrapper.text()).toContain('Investigate');
    expect(wrapper.text()).toContain('Fix');
    expect(wrapper.text()).not.toContain('Cancel');
    expect(wrapper.get('[aria-label="Branch name"]').element).toHaveProperty('value', 'fix/12-fix-backlog-assignment');

    await wrapper.get('.repository-backlog__start-work .claw-button--primary').trigger('click');

    expect(startWorkAction).toHaveBeenCalledWith({
      action: 'fix',
      item: expect.objectContaining({ id: 'nbonamy/codex-claw#12' }),
      target: 'current',
      workspace: { branchName: 'fix/12-fix-backlog-assignment', kind: 'worktree' },
    });
    await nextTick();
    expect(wrapper.text()).toContain('Work started');
  });

  it('prefills custom issue work without dispatching it', async () => {
    const prefillAction = vi.fn();
    const startWorkAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ prefillAction, startWorkAction });

    await wrapper.get('[aria-label="Work item actions #12"]').trigger('click');
    await wrapper.get('.repository-backlog__start-work .claw-button--tertiary').trigger('click');

    expect(prefillAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'nbonamy/codex-claw#12' }));
    expect(startWorkAction).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Start work on #12');
  });

  it('dispatches issue investigation without using the fix prompt', async () => {
    const startWorkAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ startWorkAction });

    await wrapper.get('[aria-label="Work item actions #12"]').trigger('click');
    await wrapper.get('.repository-backlog__start-work .claw-button--secondary').trigger('click');

    expect(startWorkAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'investigate' }));
  });

  it('can dispatch work in the current folder and branch without creating a branch', async () => {
    const startWorkAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({ branch: 'feature/current-work', startWorkAction });

    await wrapper.get('[aria-label="Work item actions #12"]').trigger('click');
    expect(wrapper.text()).toContain('Current workspace');
    expect(wrapper.text()).toContain('Keep feature/current-work in this folder');
    expect(wrapper.text()).toContain('New worktree');

    await wrapper.get('input[type="radio"][value="current"]').setValue(true);
    expect(wrapper.find('[aria-label="Branch name"]').exists()).toBe(false);
    await wrapper.get('.repository-backlog__start-work .claw-button--primary').trigger('click');

    expect(startWorkAction).toHaveBeenCalledWith(expect.objectContaining({
      target: 'current',
      workspace: { kind: 'current' },
    }));
  });

  it('forces duplicated agents into a worktree and suggests a review branch for pull requests', async () => {
    const startWorkAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      items: [workItem({ branchName: 'feature/backlog-workspace', kind: 'pullRequest', number: 21, title: 'Ship backlog workspace' })],
      startWorkAction,
    });

    await wrapper.get('[role="radio"][aria-checked="false"]').trigger('click');
    await wrapper.get('[aria-label="Work item actions #21"]').trigger('click');
    expect(wrapper.text()).toContain('Address feedback');
    expect(wrapper.text()).toContain('Review');
    expect(wrapper.text()).toContain('Check out feature/backlog-workspace in an isolated folder');
    expect(wrapper.find('[aria-label="Branch name"]').exists()).toBe(false);
    await wrapper.findAll('.repository-backlog__target-options > button')[1]?.trigger('click');
    expect(wrapper.get('input[type="radio"][value="current"]').attributes('disabled')).toBeDefined();
    await wrapper.get('.repository-backlog__start-work .claw-button--primary').trigger('click');

    expect(startWorkAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'review',
      target: 'duplicate',
      workspace: { branchName: 'feature/backlog-workspace', kind: 'worktree' },
    }));
  });

  it('can check out the pull request branch in the current agent workspace', async () => {
    const startWorkAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      items: [workItem({ branchName: 'feature/current-pr', kind: 'pullRequest', number: 22, title: 'Update current workspace' })],
      startWorkAction,
    });

    await wrapper.get('[role="radio"][aria-checked="false"]').trigger('click');
    await wrapper.get('[aria-label="Work item actions #22"]').trigger('click');
    await wrapper.get('input[type="radio"][value="current"]').setValue(true);

    expect(wrapper.text()).toContain('Check out feature/current-pr in this folder');
    await wrapper.get('.repository-backlog__start-work .claw-button--primary').trigger('click');
    expect(startWorkAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'review',
      target: 'current',
      workspace: { kind: 'current' },
    }));
  });

  it('allows pull request work to resolve missing branch metadata at dispatch time', async () => {
    const startWorkAction = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPanel({
      items: [workItem({ kind: 'pullRequest', number: 23, title: 'Resolve remote branch' })],
      startWorkAction,
    });

    await wrapper.get('[role="radio"][aria-checked="false"]').trigger('click');
    await wrapper.get('[aria-label="Work item actions #23"]').trigger('click');
    expect(wrapper.text()).not.toContain('The pull request branch is unavailable');
    expect(wrapper.get('.repository-backlog__start-work .claw-button--primary').attributes('disabled')).toBeUndefined();
    await wrapper.get('.repository-backlog__start-work .claw-button--primary').trigger('click');

    expect(startWorkAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'review' }));
  });

  it('dismisses start work when the popover closes or the workspace becomes inactive', async () => {
    const wrapper = mountPanel();

    await wrapper.get('[aria-label="Work item actions #12"]').trigger('click');
    expect(wrapper.text()).toContain('Start work on #12');

    wrapper.findAllComponents({ name: 'ElPopover' }).at(-1)?.vm.$emit('update:visible', false);
    await nextTick();
    expect(wrapper.text()).not.toContain('Start work on #12');

    await wrapper.get('[aria-label="Work item actions #12"]').trigger('click');
    await wrapper.setProps({ visible: false });
    expect(wrapper.text()).not.toContain('Start work on #12');
  });
});

function mountPanel(overrides: Partial<InstanceType<typeof RepositoryBacklogPanel>['$props']> = {}) {
  return mount(RepositoryBacklogPanel, {
    props: {
      agent,
      assignments: {},
      branch: 'main',
      connection: { provider: 'github', status: 'connected', accountLabel: 'nbonamy' },
      error: null,
      items: [workItem()],
      repositoryId: 'nbonamy/codex-claw',
      prefillAction: vi.fn(),
      status: 'loaded',
      startWorkAction: vi.fn().mockResolvedValue(undefined),
      visible: true,
      ...overrides,
    },
    global: {
      plugins: [ElementPlus, i18n],
      stubs: {
        ElPopover: {
          name: 'ElPopover',
          props: ['visible'],
          emits: ['update:visible'],
          template: '<div><slot name="reference" /><slot v-if="visible !== false" /></div>',
        },
      },
    },
  });
}

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '/Users/nbonamy/src/codex-claw',
  backend: 'codex',
  backendDefaults: { kind: 'codex' },
  status: { type: 'idle' },
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
};

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    kind: 'issue',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix backlog assignment',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    labels: [{ name: 'bug', color: 'ff0000' }],
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}
