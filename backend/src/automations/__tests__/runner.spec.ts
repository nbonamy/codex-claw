import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { createAutomationInSnapshot } from '@codex-claw/core/automation-manager';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import type { WorkItem } from '@codex-claw/core/contracts';
import { AutomationRunner, matchingAutomationItems } from '../runner';

const logMainMock = vi.hoisted(() => vi.fn());
const warnMainMock = vi.hoisted(() => vi.fn());

vi.mock('../../log', () => ({
  logMain: logMainMock,
  warnMain: warnMainMock,
}));

describe('AutomationRunner', () => {
  beforeEach(() => {
    logMainMock.mockReset();
    warnMainMock.mockReset();
  });

  it('creates agents from matching issues and preserves the active selection', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:00:00.000Z',
    });
    createAutomationInSnapshot(snapshot, {
      name: 'GitHub bugs',
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
        tagName: 'bug',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'dedicated',
        },
      },
      instructions: {
        assignment: 'Remove the bug tag before closing this out.',
      },
    }, '2026-06-09T10:01:00.000Z', () => 'automation-bugs');

    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const notifySnapshotUpdated = vi.fn();
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: {
        listItems: vi.fn().mockResolvedValue([
          workItem(12, 'Fix cockpit', ['bug']),
          workItem(13, 'Docs', ['documentation']),
        ]),
      },
      notifySnapshotUpdated,
      saveSnapshot,
      sendPrompt,
      createExecutionId: () => 'automation-exec-bugs',
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    const assignment = snapshot.workBacklog.assignments[workItemAssignmentKey(workItem(12, 'Fix cockpit', ['bug']))];
    expect(assignment).toMatchObject({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#12',
      assignedAt: '2026-06-09T11:00:00.000Z',
      automationExecutionId: 'automation-exec-bugs',
      automationId: 'automation-bugs',
      policy: 'complete',
      status: 'inProgress',
    });
    expect(snapshot.activeAgentId).toBe('agent-dina');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.teams.map((team) => team.name)).toContain('GitHub #12');
    expect(snapshot.agents.find((agent) => agent.id === assignment?.agentId)).toMatchObject({
      name: 'Dina',
      teamId: expect.stringContaining('team-github-12'),
    });
    expect(snapshot.automations[0]).toMatchObject({
      lastRunAt: '2026-06-09T11:00:00.000Z',
      lastCreatedCount: 1,
      executionLog: [{
        id: 'automation-exec-bugs',
        automationId: 'automation-bugs',
        status: 'working',
        createdCount: 1,
        createdAgents: [{
          agentId: assignment?.agentId,
          agentName: 'Dina',
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
        }],
      }],
    });
    expect(snapshot.automations[0]?.executionLog[0]).not.toHaveProperty('completedAt');
    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(notifySnapshotUpdated).toHaveBeenCalledOnce();
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Assignment instructions:\nRemove the bug tag before closing this out.'),
      {
        automationId: 'automation-bugs',
        executionId: 'automation-exec-bugs',
        workItemId: 'github:nbonamy/codex-claw#12',
      },
    );
    expect(logMainMock).toHaveBeenCalledWith('automation-runner', 'started', expect.objectContaining({
      automationId: 'automation-bugs',
      executionId: 'automation-exec-bugs',
      repositoryId: 'nbonamy/codex-claw',
    }));
    expect(logMainMock).toHaveBeenCalledWith('automation-runner', 'listed work items', expect.objectContaining({
      automationId: 'automation-bugs',
      executionId: 'automation-exec-bugs',
      itemCount: 2,
      matchingCount: 1,
    }));
    expect(logMainMock).toHaveBeenCalledWith('automation-runner', 'created assignment', expect.objectContaining({
      automationId: 'automation-bugs',
      executionId: 'automation-exec-bugs',
      agentId: assignment?.agentId,
      workItemId: 'github:nbonamy/codex-claw#12',
    }));
    expect(logMainMock).toHaveBeenCalledWith('automation-runner', 'dispatching prompt', expect.objectContaining({
      automationId: 'automation-bugs',
      executionId: 'automation-exec-bugs',
      agentId: assignment?.agentId,
      workItemId: 'github:nbonamy/codex-claw#12',
    }));
  });

  it('keeps the execution log when prompt dispatch fails after a real pickup', async () => {
    const snapshot = snapshotWithAutomation('automation-all');
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const notifySnapshotUpdated = vi.fn();
    const sendPrompt = vi.fn().mockRejectedValue(new Error('backend offline'));
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: {
        listItems: vi.fn().mockResolvedValue([workItem(12, 'Fix cockpit', ['bug'])]),
      },
      notifySnapshotUpdated,
      saveSnapshot,
      sendPrompt,
      createExecutionId: () => 'automation-exec-all',
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(snapshot.automations[0]).toMatchObject({
      lastRunAt: '2026-06-09T11:00:00.000Z',
      lastCreatedCount: 1,
      lastError: 'backend offline',
      executionLog: [{
        id: 'automation-exec-all',
        status: 'failed',
        createdCount: 1,
        error: 'backend offline',
        createdAgents: [{
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
        }],
      }],
    });
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    expect(notifySnapshotUpdated).toHaveBeenCalledTimes(2);
    expect(sendPrompt).toHaveBeenCalledOnce();
    expect(warnMainMock).toHaveBeenCalledWith('automation-runner', 'prompt dispatch failed', expect.objectContaining({
      automationId: 'automation-all',
      executionId: 'automation-exec-all',
      workItemId: 'github:nbonamy/codex-claw#12',
      message: 'backend offline',
    }));
    expect(warnMainMock).toHaveBeenCalledWith('automation-runner', 'failed', expect.objectContaining({
      automationId: 'automation-all',
      executionId: 'automation-exec-all',
      createdCount: 1,
      message: 'backend offline',
    }));
  });

  it('logs created assignments if a later matching ticket fails before prompting', async () => {
    const snapshot = snapshotWithAutomation('automation-all');
    const originalTeamFind = snapshot.teams.find;
    let teamFindCalls = 0;
    snapshot.teams.find = ((predicate: (team: (typeof snapshot.teams)[number], index: number, teams: typeof snapshot.teams) => unknown, thisArg?: unknown) => {
      teamFindCalls += 1;
      if (teamFindCalls > 2) {
        return undefined;
      }
      return originalTeamFind.call(snapshot.teams, predicate, thisArg);
    }) as typeof snapshot.teams.find;
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const notifySnapshotUpdated = vi.fn();
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: {
        listItems: vi.fn().mockResolvedValue([
          workItem(12, 'Fix cockpit', ['bug']),
          workItem(13, 'Fix logging', ['bug']),
        ]),
      },
      notifySnapshotUpdated,
      saveSnapshot,
      sendPrompt,
      createExecutionId: () => 'automation-exec-all',
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    try {
      await runner.runAll();
    } finally {
      snapshot.teams.find = originalTeamFind;
    }

    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']).toMatchObject({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#12',
      status: 'inProgress',
    });
    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#13']).toBeUndefined();
    expect(snapshot.automations[0]).toMatchObject({
      lastRunAt: '2026-06-09T11:00:00.000Z',
      lastCreatedCount: 1,
      executionLog: [{
        id: 'automation-exec-all',
        status: 'failed',
        createdCount: 1,
        error: 'Team is no longer available for automation "nbonamy/codex-claw".',
        createdAgents: [{
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
        }],
      }],
    });
    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(notifySnapshotUpdated).toHaveBeenCalledOnce();
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  it('does not create duplicate agents for already assigned work', async () => {
    const snapshot = snapshotWithAutomation('automation-all');
    const item = workItem(12, 'Fix cockpit', ['bug']);
    snapshot.workBacklog.assignments[workItemAssignmentKey(item)] = {
      provider: 'github',
      itemId: item.id,
      agentId: 'agent-dina',
      assignedAt: '2026-06-09T10:02:00.000Z',
      policy: 'complete',
      status: 'inProgress',
    };
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const notifySnapshotUpdated = vi.fn();
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: {
        listItems: vi.fn().mockResolvedValue([item]),
      },
      notifySnapshotUpdated,
      saveSnapshot,
      sendPrompt,
      createExecutionId: () => 'automation-exec-all',
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(snapshot.agents).toHaveLength(2);
    expect(snapshot.automations[0]?.lastCreatedCount).toBeUndefined();
    expect(snapshot.automations[0]?.executionLog).toStrictEqual([]);
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(notifySnapshotUpdated).not.toHaveBeenCalled();
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  it('creates a new agent for an open matching issue with a completed assignment', async () => {
    const snapshot = snapshotWithAutomation('automation-all');
    const item = workItem(12, 'Fix cockpit', ['bug']);
    snapshot.workBacklog.assignments[workItemAssignmentKey(item)] = {
      provider: 'github',
      itemId: item.id,
      agentId: 'agent-closed',
      assignedAt: '2026-06-09T10:02:00.000Z',
      policy: 'complete',
      status: 'completed',
      completedAt: '2026-06-09T10:30:00.000Z',
    };
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    const notifySnapshotUpdated = vi.fn();
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: {
        listItems: vi.fn().mockResolvedValue([item]),
      },
      notifySnapshotUpdated,
      saveSnapshot,
      sendPrompt,
      createExecutionId: () => 'automation-exec-all',
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    expect(snapshot.agents).toHaveLength(3);
    expect(snapshot.workBacklog.assignments[workItemAssignmentKey(item)]).toMatchObject({
      provider: 'github',
      itemId: item.id,
      automationExecutionId: 'automation-exec-all',
      automationId: 'automation-all',
      policy: 'complete',
      status: 'inProgress',
    });
    expect(snapshot.automations[0]?.lastCreatedCount).toBe(1);
    expect(snapshot.automations[0]?.executionLog).toHaveLength(1);
    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(notifySnapshotUpdated).toHaveBeenCalledOnce();
    expect(sendPrompt).toHaveBeenCalledOnce();
  });

  it('creates plain agents from a selected source repository', async () => {
    const snapshot = createInitialSnapshot();
    createAutomationInSnapshot(snapshot, {
      name: 'GitHub bugs',
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
        tagName: 'bug',
      },
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
        backend: 'claude',
        backendDefaults: {
          kind: 'claude',
          model: 'claude-opus-4.1',
          thinking: {
            type: 'enabled',
            budgetTokens: 4096,
          },
        },
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
    }, '2026-06-09T10:01:00.000Z', () => 'automation-bugs');
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      listWorkItems: {
        listItems: vi.fn().mockResolvedValue([workItem(12, 'Fix cockpit', ['bug'])]),
      },
      notifySnapshotUpdated: vi.fn(),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      sendPrompt,
      createExecutionId: () => 'automation-exec-bugs',
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });

    await runner.runAll();

    const assignment = snapshot.workBacklog.assignments[workItemAssignmentKey(workItem(12, 'Fix cockpit', ['bug']))];
    expect(snapshot.activeAgentId).toBe('agent-dina');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.agents.find((agent) => agent.id === assignment?.agentId)).toMatchObject({
      name: 'GitHub #12',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'claude',
      backendDefaults: {
        kind: 'claude',
        model: 'claude-opus-4.1',
        thinking: {
          type: 'enabled',
          budgetTokens: 4096,
        },
      },
      teamId: 'team-codex-claw',
    });
    expect(sendPrompt).toHaveBeenCalledOnce();
  });

  it('filters automation items by repository, state, assignee, and tag', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:00:00.000Z',
    });
    const automation = createAutomationInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: 'dina',
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
    });

    expect(automation).not.toBeNull();
    expect(matchingAutomationItems([
      workItem(12, 'Bug', ['bug'], ['dina']),
      { ...workItem(13, 'Closed', ['bug'], ['dina']), state: 'closed' },
      { ...workItem(14, 'Other repo', ['bug'], ['dina']), repositoryId: 'nbonamy/id8' },
      workItem(15, 'Feature', ['feature'], ['dina']),
      workItem(16, 'Unassigned bug', ['bug'], ['jesse']),
    ], automation!)).toStrictEqual([
      workItem(12, 'Bug', ['bug'], ['dina']),
    ]);
  });
});

function snapshotWithAutomation(automationId: string, options: { assigneeLogin?: string; tagName?: string } = {}) {
  const snapshot = createInitialSnapshot();
  snapshot.bench.push({
    id: 'bench-dina',
    name: 'Dina',
    folder: '/Users/nbonamy/src/codex-claw',
    backend: 'codex',
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  });
  createAutomationInSnapshot(snapshot, {
    source: {
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      ...(options.assigneeLogin ? { assigneeLogin: options.assigneeLogin } : {}),
      ...(options.tagName ? { tagName: options.tagName } : {}),
    },
    action: {
      type: 'create-agent-from-bench',
      benchTemplateId: 'bench-dina',
      teamTarget: {
        mode: 'existing',
        teamId: 'team-codex-claw',
      },
    },
  }, '2026-06-09T10:01:00.000Z', () => automationId);
  return snapshot;
}

function workItem(number: number, title: string, labels: string[], assignees: string[] = []): WorkItem {
  return {
    provider: 'github',
    id: `nbonamy/codex-claw#${number}`,
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number,
    title,
    url: `https://github.com/nbonamy/codex-claw/issues/${number}`,
    state: 'open',
    ...(assignees.length > 0 ? { assignees } : {}),
    labels: labels.map((name) => ({ name })),
    createdAt: '2026-06-09T09:00:00.000Z',
    updatedAt: '2026-06-09T09:30:00.000Z',
  };
}
