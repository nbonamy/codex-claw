import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '../snapshot';
import type { LoopExecutionLogEntry } from '../contracts';
import {
  clearLoopExecutionHistoryInSnapshot,
  completeLoopExecutionInSnapshot,
  createLoopInSnapshot,
  deleteLoopExecutionFromSnapshot,
  deleteLoopFromSnapshot,
  recordLoopExecutionInSnapshot,
  updateLoopExecutionAgentConversationInSnapshot,
  updateLoopInSnapshot,
} from '../loop-manager';

describe('loop manager', () => {
  it('creates, updates, records, and deletes loops', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:00:00.000Z',
    });

    const loop = createLoopInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: ' nbonamy/codex-claw ',
        assigneeLogin: ' nbonamy ',
        tagName: ' bug ',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: ' bench-dina ',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
      instructions: {
        assignment: ' Start by reproducing the issue. ',
        beforeCompletion: ' Remove the bug tag. ',
      },
    }, '2026-06-09T11:00:00.000Z', () => 'loop-github-bugs');

    expect(loop).toStrictEqual({
      id: 'loop-github-bugs',
      name: 'nbonamy/codex-claw / nbonamy / bug',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: 'nbonamy',
        tagName: 'bug',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
        cleanup: {
          deleteAgent: true,
        },
      },
      instructions: {
        assignment: 'Start by reproducing the issue.',
        beforeCompletion: 'Remove the bug tag.',
      },
      executionLog: [],
      createdAt: '2026-06-09T11:00:00.000Z',
      updatedAt: '2026-06-09T11:00:00.000Z',
    });

    expect(updateLoopInSnapshot(snapshot, {
      id: 'loop-github-bugs',
      name: 'Triage bugs',
      enabled: false,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'dedicated',
        },
      },
      instructions: {
        beforeCompletion: 'Close the issue.',
      },
    }, '2026-06-09T12:00:00.000Z')).toMatchObject({
      name: 'Triage bugs',
      enabled: false,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        teamTarget: {
          mode: 'dedicated',
        },
        cleanup: {
          deleteTeam: true,
        },
      },
      instructions: {
        beforeCompletion: 'Close the issue.',
      },
      updatedAt: '2026-06-09T12:00:00.000Z',
    });

    expect(recordLoopExecutionInSnapshot(snapshot, 'loop-github-bugs', {
      id: 'loop-execution-1',
      loopId: 'loop-github-bugs',
      startedAt: '2026-06-09T12:01:00.000Z',
      completedAt: '2026-06-09T12:02:00.000Z',
      status: 'failed',
      createdCount: 2,
      createdAgents: [{
        agentId: 'agent-dina',
        agentName: 'Dina',
        workItemId: 'github:nbonamy/codex-claw#12',
        workItemTitle: 'Fix cockpit',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
      }],
      error: 'GitHub failed',
    })).toMatchObject({
      lastRunAt: '2026-06-09T12:01:00.000Z',
      lastCreatedCount: 2,
      lastError: 'GitHub failed',
      executionLog: [{
        id: 'loop-execution-1',
        status: 'failed',
        createdAgents: [{
          agentId: 'agent-dina',
        }],
      }],
    });

    expect(updateLoopExecutionAgentConversationInSnapshot(snapshot, 'loop-github-bugs', 'loop-execution-1', 'agent-dina', {
      conversationRef: { backend: 'codex', threadId: 'thread-dina' },
      updatedAt: '2026-06-09T12:03:00.000Z',
    })).toMatchObject({
      updatedAt: '2026-06-09T12:03:00.000Z',
      executionLog: [{
        id: 'loop-execution-1',
        createdAgents: [{
          agentId: 'agent-dina',
          conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        }],
      }],
    });

    expect(deleteLoopFromSnapshot(snapshot, 'loop-github-bugs')?.id).toBe('loop-github-bugs');
    expect(snapshot.loops).toStrictEqual([]);
  });

  it('rejects loops with missing bench agents or teams', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push(createBenchTemplate());

    expect(createLoopInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'missing-bench',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
    })).toBeNull();

    expect(createLoopInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'missing-team',
        },
      },
    })).toBeNull();

    expect(createLoopInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: ' ',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'dedicated',
        },
      },
    })).toBeNull();
  });

  it('creates loops that create a new agent from a source repository', () => {
    const snapshot = createInitialSnapshot();

    expect(createLoopInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent',
        sourceRepositoryPath: ' /Users/nbonamy/src/codex-claw ',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
    }, '2026-06-09T11:00:00.000Z', () => 'loop-new-agent')).toMatchObject({
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
        cleanup: {
          deleteAgent: true,
        },
      },
    });

    expect(createLoopInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent',
        sourceRepositoryPath: ' ',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
    })).toBeNull();
  });

  it('ignores updates and deletes for missing or invalid loops', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push(createBenchTemplate());

    expect(updateLoopInSnapshot(snapshot, {
      id: 'missing-loop',
      name: 'Missing',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'dedicated',
        },
      },
    })).toBeNull();

    const loop = createLoopInSnapshot(snapshot, {
      name: 'Existing loop',
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'dedicated',
        },
      },
    }, '2026-06-09T11:00:00.000Z', () => '');

    expect(loop?.id).toBe('loop-existing-loop-20260609t110000000z');
    expect(updateLoopInSnapshot(snapshot, {
      id: loop?.id ?? '',
      name: 'Invalid loop',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: '',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'dedicated',
        },
      },
    })).toBeNull();
    expect(deleteLoopFromSnapshot(snapshot, 'missing-loop')).toBeNull();
    expect(clearLoopExecutionHistoryInSnapshot(snapshot, 'missing-loop')).toBeNull();
  });

  it('records successful executions, deduplicates entries, and clears history', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push(createBenchTemplate());
    const loop = createLoopInSnapshot(snapshot, {
      name: 'Backlog',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'dedicated',
        },
      },
    }, '2026-06-09T11:00:00.000Z', () => 'loop-backlog');

    expect(recordLoopExecutionInSnapshot(snapshot, 'missing-loop', createExecutionEntry('run-1', 'loop-backlog'))).toBeNull();
    expect(recordLoopExecutionInSnapshot(snapshot, 'loop-backlog', createExecutionEntry('run-1', 'other-loop'))).toBeNull();

    const failed = createExecutionEntry('run-1', 'loop-backlog', 'failed');
    failed.error = 'GitHub failed';
    expect(recordLoopExecutionInSnapshot(snapshot, 'loop-backlog', failed)?.lastError).toBe('GitHub failed');

    const working = createExecutionEntry('run-1', 'loop-backlog', 'working');
    const workingLoop = recordLoopExecutionInSnapshot(snapshot, 'loop-backlog', working);
    expect(workingLoop).toMatchObject({
      lastCreatedCount: 1,
      executionLog: [{
        id: 'run-1',
        status: 'working',
      }],
    });
    expect(workingLoop).not.toHaveProperty('lastError');
    expect(loop?.executionLog).toHaveLength(1);
    expect(loop?.executionLog[0]).not.toHaveProperty('completedAt');

    expect(completeLoopExecutionInSnapshot(snapshot, 'loop-backlog', 'run-1', '2026-06-09T12:03:00.000Z')).toMatchObject({
      updatedAt: '2026-06-09T12:03:00.000Z',
      executionLog: [{
        id: 'run-1',
        status: 'completed',
        completedAt: '2026-06-09T12:03:00.000Z',
      }],
    });
    expect(completeLoopExecutionInSnapshot(snapshot, 'loop-backlog', 'missing-run')).toBeNull();

    expect(deleteLoopExecutionFromSnapshot(snapshot, 'loop-backlog', 'run-1', '2026-06-09T12:03:30.000Z')).toMatchObject({
      executionLog: [],
      updatedAt: '2026-06-09T12:03:30.000Z',
    });
    expect(loop).not.toHaveProperty('lastRunAt');
    expect(loop).not.toHaveProperty('lastCreatedCount');
    expect(deleteLoopExecutionFromSnapshot(snapshot, 'loop-backlog', 'missing-run')).toBeNull();

    recordLoopExecutionInSnapshot(snapshot, 'loop-backlog', working);
    const loopWithConversation = updateLoopExecutionAgentConversationInSnapshot(snapshot, 'loop-backlog', 'run-1', 'agent-dina', {
      conversationRef: { backend: 'codex', threadId: 'thread-dina' },
      updatedAt: '2026-06-09T12:04:00.000Z',
    });
    expect(loopWithConversation).toMatchObject({
      executionLog: [{
        createdAgents: [{
          conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        }],
      }],
    });
    expect(loopWithConversation?.executionLog[0].createdAgents[0]).not.toHaveProperty('turnId');
    expect(updateLoopExecutionAgentConversationInSnapshot(snapshot, 'loop-backlog', 'missing-run', 'agent-dina', {
      conversationRef: { backend: 'codex', threadId: 'thread-dina' },
      updatedAt: '2026-06-09T12:05:00.000Z',
    })).toBeNull();

    expect(clearLoopExecutionHistoryInSnapshot(snapshot, 'loop-backlog', '2026-06-09T12:06:00.000Z')).toMatchObject({
      executionLog: [],
      updatedAt: '2026-06-09T12:06:00.000Z',
    });
  });
});

function createBenchTemplate() {
  return {
    id: 'bench-dina',
    name: 'Dina',
    folder: '/Users/nbonamy/src/codex-claw',
    backend: 'codex' as const,
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  };
}

function createExecutionEntry(
  id: string,
  loopId: string,
  status: LoopExecutionLogEntry['status'] = 'completed',
): LoopExecutionLogEntry {
  return {
    id,
    loopId,
    startedAt: '2026-06-09T12:01:00.000Z',
    status,
    createdCount: 1,
    createdAgents: [{
      agentId: 'agent-dina',
      agentName: 'Dina',
      workItemId: 'github:nbonamy/codex-claw#12',
      workItemTitle: 'Fix cockpit',
      workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
    }],
    ...(status === 'working' ? {} : { completedAt: '2026-06-09T12:02:00.000Z' }),
  };
}
