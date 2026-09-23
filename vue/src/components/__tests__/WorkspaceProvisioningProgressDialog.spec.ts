import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import WorkspaceProvisioningProgressDialog from '../WorkspaceProvisioningProgressDialog.vue';

describe('WorkspaceProvisioningProgressDialog', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the delegated worktree handoff and closes after the success animation', async () => {
    vi.useFakeTimers();
    const initialProgress = {
      id: 'agent-creation-1',
      state: 'running' as const,
      backend: 'codex' as const,
      repositoryName: 'codex-app-sdk',
      createWorktree: true,
      branchName: 'feature/contracts',
      hasPrompt: true,
      phase: 'creatingWorktree' as const,
    };
    const wrapper = mount(WorkspaceProvisioningProgressDialog, {
      props: {
        operation: {
          mode: 'single',
          progress: initialProgress,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Building an isolated home in codex-app-sdk');
    expect(wrapper.text()).toContain('Creating isolated worktree');
    expect(wrapper.text()).toContain('Initializing worktree');
    expect(wrapper.text()).toContain('Handing over initial instructions');

    await wrapper.setProps({
      operation: {
        mode: 'single',
        progress: {
          ...initialProgress,
          phase: 'initializingWorktree' as const,
          initializationDetail: 'npm ci · uv sync',
        },
      },
    });
    expect(wrapper.text()).toContain('npm ci · uv sync');

    await wrapper.setProps({
      operation: {
        mode: 'single',
        progress: {
          ...initialProgress,
          state: 'success' as const,
          phase: 'initializingWorktree',
          agentId: 'agent-worker',
          agentName: 'feature/contracts',
        },
      },
    });
    vi.advanceTimersByTime(4_400);
    await nextTick();

    expect(wrapper.text()).toContain('feature/contracts is ready');
    expect(wrapper.emitted('close')).toStrictEqual([['agent-creation-1']]);
  });

  it('holds multiple-worktree progress until every repository reaches the next phase', async () => {
    vi.useFakeTimers();
    const operation = {
      mode: 'multiple' as const,
      id: 'mission-1',
      state: 'running' as const,
      repositories: ['/src/api', '/src/web'],
      ticketCount: 3,
      phase: 'creatingWorktrees' as const,
    };
    const wrapper = mount(WorkspaceProvisioningProgressDialog, { props: { operation } });

    expect(wrapper.text()).toContain('2 repositories');
    expect(wrapper.text()).toContain('api, web');
    expect(wrapper.text()).toContain('3 tickets');
    expect(wrapper.findAll('.staged-operation-progress li')[0]?.classes()).toContain('is-active');

    vi.advanceTimersByTime(10_000);
    await nextTick();
    expect(wrapper.findAll('.staged-operation-progress li')[0]?.classes()).toContain('is-active');

    await wrapper.setProps({ operation: { ...operation, phase: 'initializingWorkspaces' } });
    expect(wrapper.findAll('.staged-operation-progress li')[0]?.classes()).toContain('is-complete');
    expect(wrapper.findAll('.staged-operation-progress li')[1]?.classes()).toContain('is-active');

    await wrapper.setProps({ operation: { ...operation, phase: 'startingAgents' } });
    expect(wrapper.findAll('.staged-operation-progress li')[2]?.classes()).toContain('is-active');
  });

  it('shows a multiple-worktree error and closes the matching operation', async () => {
    const wrapper = mount(WorkspaceProvisioningProgressDialog, {
      props: {
        operation: {
          mode: 'multiple',
          id: 'mission-1',
          state: 'error',
          repositories: ['/src/api', '/src/web'],
          ticketCount: 2,
          phase: 'creatingWorktrees',
          error: 'Web worktree could not be created.',
        },
      },
    });

    expect(wrapper.get('[role="status"]').text()).toContain('Web worktree could not be created.');
    await wrapper.get('.claw-dialog__footer button').trigger('click');
    expect(wrapper.emitted('close')).toStrictEqual([['mission-1']]);
  });
});
