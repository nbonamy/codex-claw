import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '../../../shared/snapshot';
import type { AppSnapshot, CreateLoopInput, Loop, WorkItem, WorkRepository } from '../../../shared/contracts';
import LoopsView from '../LoopsView.vue';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoopsView', () => {
  it('shows the welcome state and opens the editor', async () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain('Loops');
    expect(wrapper.text()).not.toContain('Automations');
    expect(wrapper.text()).toContain('A loop is an automation that just works for you.');

    await wrapper.find('.loop-welcome__button').trigger('click');

    expect(wrapper.find('.loop-editor').exists()).toBe(true);
  });

  it('creates a loop from the editor submit payload', async () => {
    const createLoop = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountView({ createLoop });

    await wrapper.find('.loop-welcome__button').trigger('click');
    wrapper.findComponent({ name: 'LoopEditor' }).vm.$emit('submit', {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
    });
    await flushPromises();

    expect(createLoop).toHaveBeenCalledWith({
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
    });
  });

  it('confirms before deleting a loop', async () => {
    const deleteLoop = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      deleteLoop,
      loops: [loop()],
    });

    await wrapper.get('[aria-label="Delete loop"]').trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      'Loop "GitHub bugs" will stop creating agents.',
      'Delete loop?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete Loop',
        type: 'warning',
      },
    );
    expect(deleteLoop).toHaveBeenCalledWith('loop-bugs');
  });

  it('shows execution logs from the loop row action', async () => {
    const wrapper = mountView({
      loops: [loop({
        executionLog: [{
          id: 'loop-exec-1',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T10:00:00.000Z',
          completedAt: '2026-06-09T10:01:00.000Z',
          status: 'completed',
          createdCount: 1,
          createdAgents: [{
            agentId: 'agent-dina',
            agentName: 'Dina',
            workItemId: 'github:nbonamy/codex-claw#12',
            workItemTitle: 'Fix cockpit',
            workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
            conversationId: 'thread-dina',
            turnId: 'turn-dina',
          }],
        }, {
          id: 'loop-exec-0',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T09:00:00.000Z',
          completedAt: '2026-06-09T09:00:03.000Z',
          status: 'failed',
          createdCount: 0,
          createdAgents: [],
          error: 'GitHub failed',
        }],
        processedWorkItemIds: ['github:nbonamy/codex-claw#12'],
      })],
    });

    expect(wrapper.find('[aria-label="Current loops"]').exists()).toBe(true);
    await wrapper.get('[aria-label="View loop log"]').trigger('click');

    expect(wrapper.text()).toContain('2 executions');
    expect(wrapper.text()).not.toContain('Dina');
    expect(wrapper.text()).toContain('github:nbonamy/codex-claw#12');
    expect(wrapper.text()).not.toContain('Fix cockpit');
    expect(wrapper.text()).toContain('1m');
    expect(wrapper.find('a[href="https://github.com/nbonamy/codex-claw/issues/12"]').exists()).toBe(true);
    expect(wrapper.text().indexOf('Completed')).toBeLessThan(wrapper.text().indexOf('Failed'));
    expect(wrapper.text()).not.toContain('No ticket');
  });

  it('confirms before clearing execution history', async () => {
    const clearLoopHistory = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mountView({
      clearLoopHistory,
      loops: [loop({
        executionLog: [{
          id: 'loop-exec-1',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T10:00:00.000Z',
          completedAt: '2026-06-09T10:01:00.000Z',
          status: 'completed',
          createdCount: 0,
          createdAgents: [],
        }],
      })],
    });

    await wrapper.get('[aria-label="View loop log"]').trigger('click');
    const clearButton = wrapper.findAll('button').find((button) => button.text() === 'Clear History');
    expect(clearButton).toBeDefined();
    await clearButton!.trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      'Execution history for "GitHub bugs" will be cleared.',
      'Clear history?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Clear History',
        type: 'warning',
      },
    );
    expect(clearLoopHistory).toHaveBeenCalledWith('loop-bugs');
  });
});

function mountView(overrides: Partial<{
  clearLoopHistory: (loopId: string) => Promise<void>;
  createLoop: (input: CreateLoopInput) => Promise<void>;
  deleteLoop: (loopId: string) => Promise<void>;
  loops: Loop[];
  snapshot: AppSnapshot;
}> = {}) {
  const snapshot = overrides.snapshot ?? createInitialSnapshot();
  snapshot.bench = [{
    id: 'bench-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '/Users/nbonamy/src/codex-claw',
    backend: 'codex',
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  }];
  snapshot.workBacklog.connections = [{
    provider: 'github',
    status: 'connected',
  }];

  return mount(LoopsView, {
    props: {
      bench: snapshot.bench,
      clearLoopHistory: overrides.clearLoopHistory ?? vi.fn().mockResolvedValue(undefined),
      createLoop: overrides.createLoop ?? vi.fn().mockResolvedValue(undefined),
      deleteLoop: overrides.deleteLoop ?? vi.fn().mockResolvedValue(undefined),
      loadWorkItems: vi.fn().mockResolvedValue(undefined),
      loadWorkRepositories: vi.fn().mockResolvedValue(undefined),
      loops: overrides.loops ?? [],
      teams: snapshot.teams,
      updateLoop: vi.fn().mockResolvedValue(undefined),
      workBacklog: snapshot.workBacklog,
      workItemsByRepository: {
        'github:nbonamy/codex-claw': [workItem()],
      },
      workRepositoriesByProvider: {
        github: [repository()],
      },
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-bugs',
    name: 'GitHub bugs',
    enabled: true,
    source: {
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      tagName: 'bug',
    },
    action: {
      type: 'create-agent-from-bench',
      benchTemplateId: 'bench-dina',
      teamTarget: {
        mode: 'existing',
        teamId: 'team-codex-claw',
      },
    },
    processedWorkItemIds: [],
    executionLog: [],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    ...overrides,
  };
}

function repository(): WorkRepository {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw',
    owner: 'nbonamy',
    name: 'codex-claw',
    fullName: 'nbonamy/codex-claw',
    url: 'https://github.com/nbonamy/codex-claw',
    isPrivate: true,
  };
}

function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    labels: [{ name: 'bug' }],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  };
}
