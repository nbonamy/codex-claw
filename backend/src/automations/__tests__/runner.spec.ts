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

  it('selects overlapping Linear sources once and retains native identity through execution and repeated runs', async () => {
    const targets = ['linear:eng', 'linear:eng:project', 'linear:ops'].map(repositoryId => ({
      provider: 'linear' as const, sourceId: repositoryId, executionRepositoryPath: repositoryId.endsWith(':project') ? '/other-code' : '/remote/code',
    }));
    const snapshot = snapshotWithAutomation({ repositories: targets, selectionPrompt: 'Ready bugs', backend: 'claude' });
    const issue = (repositoryId: string): WorkItem => ({
      ...workItem(12, repositoryId), provider: 'linear', id: repositoryId === 'linear:ops' ? 'linear:ops-uuid' : 'linear:eng-uuid',
      identifier: repositoryId === 'linear:ops' ? 'OPS-12' : 'ENG-12', sourceName: repositoryId === 'linear:ops' ? 'Operations' : 'Engineering',
      url: `https://linear.app/acme/issue/${repositoryId === 'linear:ops' ? 'OPS-12' : 'ENG-12'}`, body: 'Reproduction steps',

    });
    const listItems = vi.fn(async (_provider, source) => [issue(source), { ...issue(source), id: 'closed', state: 'closed' as const }]);
    const createWorktree = vi.fn(async ({ branchName }) => ({ name: branchName, path: `/remote/code-${branchName}` }));
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const selectWorkItems = vi.fn(async (_automation, candidates) => candidates);
    const runner = new AutomationRunner({ getSnapshot: () => snapshot, listWorkItems: { listItems }, createWorktree,
      sendPrompt, selectWorkItems, saveSnapshot: async () => {}, notifySnapshotUpdated: () => {} });
    await runner.runAll();
    expect(selectWorkItems.mock.calls[0]?.[1].map((item: WorkItem) => item.identifier)).toEqual(['ENG-12', 'OPS-12']);
    expect(createWorktree.mock.calls.map(([input]) => input)).toEqual([
      { repoPath: '/remote/code', branchName: 'automation/eng-12', reuseExisting: true },
      { repoPath: '/remote/code', branchName: 'automation/ops-12', reuseExisting: true },
    ]);
    expect(snapshot.workBacklog.assignments['linear:linear:eng-uuid']).toMatchObject({
      provider: 'linear', status: 'inProgress', item: { identifier: 'ENG-12', body: 'Reproduction steps' },
    });
    expect(snapshot.agents.find(agent => agent.name === 'Linear ENG-12')).toMatchObject({ backend: 'claude', folder: '/remote/code-automation/eng-12' });
    expect(snapshot.automations[0]?.executionLog[0]?.createdAgents[0]).toMatchObject({
      workItemId: 'linear:linear:eng-uuid', workItemIdentifier: 'ENG-12', workItemUrl: 'https://linear.app/acme/issue/ENG-12',
    });
    expect(sendPrompt.mock.calls[0]?.[1]).toContain('ENG-12');
    expect(sendPrompt.mock.calls[0]?.[1]).toContain('https://linear.app/acme/issue/ENG-12');
    await runner.runAutomation(snapshot.automations[0]!.id);
    expect(createWorktree).toHaveBeenCalledTimes(2);
    expect(sendPrompt).toHaveBeenCalledTimes(2);
  });

  it.each(['Linear source is inaccessible', 'Code repository missing'])(
    'records a failed Linear run without assigning or dispatching when %s', async message => {
      const snapshot = snapshotWithAutomation({ repositories: [{ provider: 'linear', sourceId: 'linear:eng', executionRepositoryPath: '/missing' }] });
      const prepareFailure = message === 'Code repository missing';
      const sendPrompt = vi.fn();
      const initialAgents = snapshot.agents.length;
      const runner = new AutomationRunner({ getSnapshot: () => snapshot,
        listWorkItems: { listItems: prepareFailure ? async () => [{ ...workItem(12, 'linear:eng'), provider: 'linear' }] : async () => { throw new Error(message); } },
        createWorktree: async () => { throw new Error(message); }, sendPrompt,
        saveSnapshot: async () => {}, notifySnapshotUpdated: () => {},
      });
      await runner.runAll();
      expect(snapshot.automations[0]?.executionLog).toEqual([expect.objectContaining({ status: 'failed', createdCount: 0, error: message })]);
      expect(snapshot.agents).toHaveLength(initialAgents);
      expect(snapshot.workBacklog.assignments).toEqual({});
      expect(sendPrompt).not.toHaveBeenCalled();
    },
  );

  it('does not duplicate Linear work when manual and scheduled runs overlap during preparation', async () => {
    const snapshot = snapshotWithAutomation({ repositories: [{ provider: 'linear', sourceId: 'linear:eng', executionRepositoryPath: '/code' }] });
    let finish!: (worktree: { name: string; path: string }) => void;
    const createWorktree = vi.fn(() => new Promise<{ name: string; path: string }>(resolve => { finish = resolve; }));
    const sendPrompt = vi.fn().mockRejectedValue(new Error('Agent could not start'));
    const runner = new AutomationRunner({ getSnapshot: () => snapshot,
      listWorkItems: { listItems: async () => [{ ...workItem(12, 'linear:eng'), provider: 'linear', id: 'linear:uuid', identifier: 'ENG-12' }] },
      createWorktree, sendPrompt, saveSnapshot: async () => {}, notifySnapshotUpdated: () => {},
    });
    const scheduled = runner.runAll();
    await vi.waitFor(() => expect(createWorktree).toHaveBeenCalledOnce());
    await runner.runAutomation(snapshot.automations[0]!.id);
    finish({ name: 'automation/eng-12', path: '/code-worktree' });
    await scheduled;
    expect(createWorktree).toHaveBeenCalledOnce();
    expect(sendPrompt).toHaveBeenCalledOnce();
    expect(snapshot.automations[0]?.executionLog).toEqual([expect.objectContaining({ status: 'failed', createdCount: 1, error: 'Agent could not start' })]);
  });

  it('checks every selected repository and creates isolated agents in the selected team', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
    createAutomationInSnapshot(
      snapshot,
      {
        repositories: [repository('nbonamy/codex-claw', '/src/codex-claw'), repository('nbonamy/witsy', '/src/witsy')],
        teamId: 'team-codex-claw',
        backend: 'claude',
        selectionPrompt: 'Only actionable bugs.',
        assignmentPrompt: 'Run the focused tests.',
        schedule: { intervalMinutes: 60 },
      },
      '2026-06-09T10:00:00.000Z',
      () => 'automation-work',
    );
    const items = [workItem(12), workItem(13, 'nbonamy/witsy')];
    const listItems = vi.fn((_provider: string, repositoryId: string) =>
      Promise.resolve(items.filter((item) => item.sourceId === repositoryId)),
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
      backend: 'claude',
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
    expect(selectWorkItems.mock.calls[0]?.[0].backend).toBe('claude');
    expect(sendPrompt.mock.calls[0]?.[1]).toContain('Assignment instructions:\nRun the focused tests.');
    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(notifySnapshotUpdated).toHaveBeenCalledOnce();
  });

  it('does not provision work or fall back when the stored engine disconnects', async () => {
    const snapshot = snapshotWithAutomation({ backend: 'claude' });
    const requireConnectedEngine = vi.fn().mockRejectedValue(new Error('Claude Code is not connected.'));
    const listItems = vi.fn();
    const selectWorkItems = vi.fn();
    const createWorktree = vi.fn();
    const sendPrompt = vi.fn();
    const runner = new AutomationRunner({
      getSnapshot: () => snapshot,
      requireConnectedEngine,
      listWorkItems: { listItems }, selectWorkItems, createWorktree, sendPrompt,
      saveSnapshot: vi.fn().mockResolvedValue(undefined), notifySnapshotUpdated: vi.fn(),
      now: () => new Date('2026-06-09T11:00:00.000Z'),
    });
    await runner.runAll();
    expect(requireConnectedEngine).toHaveBeenCalledExactlyOnceWith('claude');
    expect(listItems).not.toHaveBeenCalled();
    expect(selectWorkItems).not.toHaveBeenCalled();
    expect(createWorktree).not.toHaveBeenCalled();
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(snapshot.automations[0]).toMatchObject({ backend: 'claude', lastError: 'Claude Code is not connected.' });
  });

  it('refuses to prepare local work if the automation team has moved to a remote host', async () => {
    const snapshot = snapshotWithAutomation();
    snapshot.teams[0]!.remoteConnectionId = 'devbox';
    const createWorktree = vi.fn();
    const runner = new AutomationRunner({ getSnapshot: () => snapshot, listWorkItems: { listItems: async () => [workItem(12)] },
      createWorktree, sendPrompt: vi.fn(), saveSnapshot: async () => {}, notifySnapshotUpdated: () => {} });
    await runner.runAll();
    expect(createWorktree).not.toHaveBeenCalled();
    expect(snapshot.automations[0]?.executionLog[0]).toMatchObject({ status: 'failed', createdCount: 0 });
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
  snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
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

function repository(repositoryId: string, executionRepositoryPath: string) {
  return { provider: 'github' as const, sourceId: repositoryId, executionRepositoryPath };
}

function workItem(number: number, repositoryId = 'nbonamy/codex-claw'): WorkItem {
  return {
    provider: 'github',
    id: `${repositoryId}#${number}`,
    sourceId: repositoryId,
    sourceName: repositoryId,
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
