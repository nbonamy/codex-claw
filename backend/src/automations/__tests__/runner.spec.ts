import { createAutomationInSnapshot } from '@codex-claw/core/automation-manager';
import type { Automation, WorkItem } from '@codex-claw/core/contracts';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationRunner, automationIsDue, matchingAutomationItems } from '../runner';

const logMainMock = vi.hoisted(() => vi.fn());
const warnMainMock = vi.hoisted(() => vi.fn());

vi.mock('../../log', () => ({ logMain: logMainMock, warnMain: warnMainMock }));

describe('AutomationRunner', () => {
  beforeEach(() => {
    logMainMock.mockReset();
    warnMainMock.mockReset();
  });

  it('checks every selected repository and creates isolated agents in the selected team', async () => {
    const snapshot = createInitialSnapshot();
    createAutomationInSnapshot(
      snapshot,
      {
        repositories: [repository('nbonamy/codex-claw', '/src/codex-claw'), repository('nbonamy/witsy', '/src/witsy')],
        teamId: 'team-codex-claw',
        selectionPrompt: 'Only actionable bugs.',
        assignmentPrompt: 'Run the focused tests.',
        schedule: { intervalMinutes: 60 },
      },
      '2026-06-09T10:00:00.000Z',
      () => 'automation-work',
    );
    const items = [workItem(12), workItem(13, 'nbonamy/witsy')];
    const listItems = vi.fn((_provider: string, repositoryId: string) =>
      Promise.resolve(items.filter((item) => item.repositoryId === repositoryId)),
    );
    const createWorktree = vi.fn(({ repoPath, branchName }: { repoPath: string; branchName: string }) =>
      Promise.resolve({
        name: branchName,
        path: `${repoPath}-${branchName.replace('/', '-')}`,
      }),
    );
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const selectWorkItems = vi.fn(async (_automation, candidates: WorkItem[]) => candidates);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const notifySnapshotUpdated = vi.fn();
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: { listItems },
      createWorktree,
      sendPrompt,
      selectWorkItems,
      saveSnapshot,
      notifySnapshotUpdated,
      createExecutionId: () => 'automation-exec-work',
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(listItems).toHaveBeenCalledTimes(2);
    expect(createWorktree).toHaveBeenCalledWith({
      repoPath: '/src/codex-claw',
      branchName: 'automation/github-12',
      reuseExisting: true,
    });
    expect(createWorktree).toHaveBeenCalledWith({
      repoPath: '/src/witsy',
      branchName: 'automation/github-13',
      reuseExisting: true,
    });
    expect(snapshot.agents.filter((agent) => agent.name?.startsWith('GitHub #'))).toHaveLength(2);
    expect(snapshot.agents.find((agent) => agent.name === 'GitHub #12')).toMatchObject({
      folder: '/src/codex-claw-automation-github-12',
      teamId: 'team-codex-claw',
    });
    expect(snapshot.workBacklog.assignments[workItemAssignmentKey(items[0]!)].status).toBe('inProgress');
    expect(snapshot.automations[0]).toMatchObject({
      lastRunAt: '2026-06-09T11:00:00.000Z',
      lastCreatedCount: 2,
      executionLog: [{ status: 'working', createdCount: 2 }],
    });
    expect(sendPrompt).toHaveBeenCalledTimes(2);
    expect(selectWorkItems).toHaveBeenCalledWith(snapshot.automations[0], items);
    expect(sendPrompt.mock.calls[0]?.[1]).toContain('Assignment instructions:\nRun the focused tests.');
    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(notifySnapshotUpdated).toHaveBeenCalledOnce();
  });

  it('records a due check even when there is no new work', async () => {
    const snapshot = snapshotWithAutomation({ selectionPrompt: 'Only ready work.' });
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const selectWorkItems = vi.fn();
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: { listItems: vi.fn().mockResolvedValue([]) },
      selectWorkItems,
      createWorktree: vi.fn(),
      sendPrompt: vi.fn(),
      saveSnapshot,
      notifySnapshotUpdated: vi.fn(),
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(snapshot.automations[0]).toMatchObject({
      lastRunAt: '2026-06-09T11:00:00.000Z',
      lastCreatedCount: 0,
      executionLog: [],
    });
    expect(selectWorkItems).not.toHaveBeenCalled();
    expect(saveSnapshot).toHaveBeenCalledOnce();
  });

  it('creates agents only for work selected by the picker', async () => {
    const snapshot = snapshotWithAutomation({ selectionPrompt: 'Only issue 13.' });
    const items = [workItem(12), workItem(13)];
    const createWorktree = vi.fn(({ branchName }: { branchName: string }) => Promise.resolve({
      name: branchName,
      path: `/src/${branchName}`,
    }));
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: { listItems: vi.fn().mockResolvedValue(items) },
      selectWorkItems: vi.fn().mockResolvedValue([items[1]]),
      createWorktree,
      sendPrompt: vi.fn().mockResolvedValue(undefined),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      notifySnapshotUpdated: vi.fn(),
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(createWorktree).toHaveBeenCalledOnce();
    expect(createWorktree).toHaveBeenCalledWith(expect.objectContaining({ branchName: 'automation/github-13' }));
  });

  it('does not create a second agent for work that was already handled', async () => {
    const snapshot = snapshotWithAutomation();
    const initialAgentCount = snapshot.agents.length;
    const item = workItem(12);
    snapshot.workBacklog.assignments[workItemAssignmentKey(item)] = {
      provider: 'github',
      itemId: item.id,
      agentId: 'agent-dina',
      status: 'completed',
      policy: 'complete',
      assignedAt: '2026-06-09T10:30:00.000Z',
      updatedAt: '2026-06-09T10:30:00.000Z',
    };
    const createWorktree = vi.fn();
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: { listItems: vi.fn().mockResolvedValue([item]) },
      createWorktree,
      sendPrompt: vi.fn(),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      notifySnapshotUpdated: vi.fn(),
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(createWorktree).not.toHaveBeenCalled();
    expect(snapshot.agents).toHaveLength(initialAgentCount);
  });

  it('records failures from worktree creation', async () => {
    const snapshot = snapshotWithAutomation();
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: { listItems: vi.fn().mockResolvedValue([workItem(12)]) },
      createWorktree: vi.fn().mockRejectedValue(new Error('worktree failed')),
      sendPrompt: vi.fn(),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      notifySnapshotUpdated: vi.fn(),
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(snapshot.automations[0]).toMatchObject({
      lastError: 'worktree failed',
      executionLog: [{ status: 'failed', createdCount: 0, error: 'worktree failed' }],
    });
    expect(warnMainMock).toHaveBeenCalledWith('automation-runner', 'failed', expect.objectContaining({ message: 'worktree failed' }));
  });
});

describe('automation scheduling and matching', () => {
  it('runs enabled automations only when their interval has elapsed', () => {
    const automation = automationFixture();
    expect(automationIsDue(automation, new Date('2026-06-09T11:00:00.000Z'))).toBe(true);
    automation.lastRunAt = '2026-06-09T10:30:01.000Z';
    expect(automationIsDue(automation, new Date('2026-06-09T11:00:00.000Z'))).toBe(false);
    automation.lastRunAt = '2026-06-09T10:00:00.000Z';
    expect(automationIsDue(automation, new Date('2026-06-09T11:00:00.000Z'))).toBe(true);
    automation.enabled = false;
    expect(automationIsDue(automation, new Date('2026-06-09T12:00:00.000Z'))).toBe(false);
  });

  it('matches open items for one repository target', () => {
    const target = repository('nbonamy/codex-claw', '/src/codex-claw');
    const closed = { ...workItem(13), state: 'closed' as const };
    expect(matchingAutomationItems([workItem(12), workItem(14, 'nbonamy/witsy'), closed], target).map((item) => item.number)).toStrictEqual(
      [12],
    );
  });
});

function snapshotWithAutomation(overrides: Partial<Automation> = {}) {
  const snapshot = createInitialSnapshot();
  createAutomationInSnapshot(
    snapshot,
    {
      repositories: [repository('nbonamy/codex-claw', '/src/codex-claw')],
      teamId: 'team-codex-claw',
      schedule: { intervalMinutes: 60 },
    },
    '2026-06-09T10:00:00.000Z',
    () => 'automation-work',
  );
  Object.assign(snapshot.automations[0]!, overrides);
  return snapshot;
}

function automationFixture(): Automation {
  return snapshotWithAutomation().automations[0]!;
}

function repository(repositoryId: string, sourceRepositoryPath: string) {
  return { provider: 'github' as const, repositoryId, sourceRepositoryPath };
}

function workItem(number: number, repositoryId = 'nbonamy/codex-claw'): WorkItem {
  return {
    provider: 'github',
    id: `${repositoryId}#${number}`,
    repositoryId,
    repositoryFullName: repositoryId,
    number,
    title: `Issue ${number}`,
    url: `https://github.com/${repositoryId}/issues/${number}`,
    state: 'open',
    assignees: [],
    labels: [],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  };
}
