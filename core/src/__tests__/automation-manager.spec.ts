import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '../snapshot';
import type { AutomationExecutionLogEntry } from '../contracts';
import {
  clearAutomationExecutionHistoryInSnapshot,
  completeAutomationExecutionInSnapshot,
  createAutomationInSnapshot,
  deleteAutomationExecutionFromSnapshot,
  deleteAutomationFromSnapshot,
  recordAutomationExecutionInSnapshot,
  updateAutomationExecutionAgentConversationInSnapshot,
  updateAutomationInSnapshot,
} from '../automation-manager';

describe('automation manager', () => {
  it('creates, updates, records, and deletes automations', () => {
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
    }, '2026-06-09T11:00:00.000Z', () => 'automation-github-bugs');

    expect(automation).toStrictEqual({
      id: 'automation-github-bugs',
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

    expect(updateAutomationInSnapshot(snapshot, {
      id: 'automation-github-bugs',
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

    expect(recordAutomationExecutionInSnapshot(snapshot, 'automation-github-bugs', {
      id: 'automation-execution-1',
      automationId: 'automation-github-bugs',
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
        id: 'automation-execution-1',
        status: 'failed',
        createdAgents: [{
          agentId: 'agent-dina',
        }],
      }],
    });

    expect(updateAutomationExecutionAgentConversationInSnapshot(snapshot, 'automation-github-bugs', 'automation-execution-1', 'agent-dina', {
      conversationRef: { backend: 'codex', threadId: 'thread-dina' },
      updatedAt: '2026-06-09T12:03:00.000Z',
    })).toMatchObject({
      updatedAt: '2026-06-09T12:03:00.000Z',
      executionLog: [{
        id: 'automation-execution-1',
        createdAgents: [{
          agentId: 'agent-dina',
          conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        }],
      }],
    });

    expect(deleteAutomationFromSnapshot(snapshot, 'automation-github-bugs')?.id).toBe('automation-github-bugs');
    expect(snapshot.automations).toStrictEqual([]);
  });

  it('rejects automations with missing bench agents or teams', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push(createBenchTemplate());

    expect(createAutomationInSnapshot(snapshot, {
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

    expect(createAutomationInSnapshot(snapshot, {
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

    expect(createAutomationInSnapshot(snapshot, {
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

  it('creates automations that create a new agent from a source repository', () => {
    const snapshot = createInitialSnapshot();

    expect(createAutomationInSnapshot(snapshot, {
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent',
        sourceRepositoryPath: ' /Users/nbonamy/src/codex-claw ',
        backend: 'claude',
        backendDefaults: {
          kind: 'claude',
          model: ' claude-opus-4.1 ',
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
    }, '2026-06-09T11:00:00.000Z', () => 'automation-new-agent')).toMatchObject({
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
        cleanup: {
          deleteAgent: true,
        },
      },
    });

    expect(createAutomationInSnapshot(snapshot, {
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

  it('ignores updates and deletes for missing or invalid automations', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push(createBenchTemplate());

    expect(updateAutomationInSnapshot(snapshot, {
      id: 'missing-automation',
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

    const automation = createAutomationInSnapshot(snapshot, {
      name: 'Existing automation',
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

    expect(automation?.id).toBe('automation-existing-automation-20260609t110000000z');
    expect(updateAutomationInSnapshot(snapshot, {
      id: automation?.id ?? '',
      name: 'Invalid automation',
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
    expect(deleteAutomationFromSnapshot(snapshot, 'missing-automation')).toBeNull();
    expect(clearAutomationExecutionHistoryInSnapshot(snapshot, 'missing-automation')).toBeNull();
  });

  it('records successful executions, deduplicates entries, and clears history', () => {
    const snapshot = createInitialSnapshot();
    snapshot.bench.push(createBenchTemplate());
    const automation = createAutomationInSnapshot(snapshot, {
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
    }, '2026-06-09T11:00:00.000Z', () => 'automation-backlog');

    expect(recordAutomationExecutionInSnapshot(snapshot, 'missing-automation', createExecutionEntry('run-1', 'automation-backlog'))).toBeNull();
    expect(recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', createExecutionEntry('run-1', 'other-automation'))).toBeNull();

    const failed = createExecutionEntry('run-1', 'automation-backlog', 'failed');
    failed.error = 'GitHub failed';
    expect(recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', failed)?.lastError).toBe('GitHub failed');

    const working = createExecutionEntry('run-1', 'automation-backlog', 'working');
    const workingAutomation = recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', working);
    expect(workingAutomation).toMatchObject({
      lastCreatedCount: 1,
      executionLog: [{
        id: 'run-1',
        status: 'working',
      }],
    });
    expect(workingAutomation).not.toHaveProperty('lastError');
    expect(automation?.executionLog).toHaveLength(1);
    expect(automation?.executionLog[0]).not.toHaveProperty('completedAt');

    expect(completeAutomationExecutionInSnapshot(snapshot, 'automation-backlog', 'run-1', '2026-06-09T12:03:00.000Z')).toMatchObject({
      updatedAt: '2026-06-09T12:03:00.000Z',
      executionLog: [{
        id: 'run-1',
        status: 'completed',
        completedAt: '2026-06-09T12:03:00.000Z',
      }],
    });
    expect(completeAutomationExecutionInSnapshot(snapshot, 'automation-backlog', 'missing-run')).toBeNull();

    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'automation-backlog', 'run-1', '2026-06-09T12:03:30.000Z')).toMatchObject({
      executionLog: [],
      updatedAt: '2026-06-09T12:03:30.000Z',
    });
    expect(automation).not.toHaveProperty('lastRunAt');
    expect(automation).not.toHaveProperty('lastCreatedCount');
    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'automation-backlog', 'missing-run')).toBeNull();

    const olderCompleted = createExecutionEntry('run-old', 'automation-backlog', 'completed');
    olderCompleted.startedAt = '2026-06-09T12:00:00.000Z';
    olderCompleted.createdCount = 2;
    recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', olderCompleted);
    const latestFailed = createExecutionEntry('run-failed', 'automation-backlog', 'failed');
    latestFailed.startedAt = '2026-06-09T12:10:00.000Z';
    latestFailed.error = 'Latest failed';
    recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', latestFailed);
    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'automation-backlog', 'run-failed', '2026-06-09T12:10:30.000Z')).toMatchObject({
      lastRunAt: '2026-06-09T12:00:00.000Z',
      lastCreatedCount: 2,
      executionLog: [{
        id: 'run-old',
        status: 'completed',
      }],
    });
    expect(automation).not.toHaveProperty('lastError');
    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'automation-backlog', 'run-old')).toMatchObject({
      executionLog: [],
    });

    recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', working);
    const automationWithConversation = updateAutomationExecutionAgentConversationInSnapshot(snapshot, 'automation-backlog', 'run-1', 'agent-dina', {
      conversationRef: { backend: 'codex', threadId: 'thread-dina' },
      updatedAt: '2026-06-09T12:04:00.000Z',
    });
    expect(automationWithConversation).toMatchObject({
      executionLog: [{
        createdAgents: [{
          conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        }],
      }],
    });
    expect(automationWithConversation?.executionLog[0].createdAgents[0]).not.toHaveProperty('turnId');
    expect(updateAutomationExecutionAgentConversationInSnapshot(snapshot, 'automation-backlog', 'missing-run', 'agent-dina', {
      conversationRef: { backend: 'codex', threadId: 'thread-dina' },
      updatedAt: '2026-06-09T12:05:00.000Z',
    })).toBeNull();

    expect(clearAutomationExecutionHistoryInSnapshot(snapshot, 'automation-backlog', '2026-06-09T12:06:00.000Z')).toMatchObject({
      executionLog: [],
      updatedAt: '2026-06-09T12:06:00.000Z',
    });
    expect(automation).not.toHaveProperty('lastRunAt');
    expect(automation).not.toHaveProperty('lastCreatedCount');
    expect(automation).not.toHaveProperty('lastError');
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
  automationId: string,
  status: AutomationExecutionLogEntry['status'] = 'completed',
): AutomationExecutionLogEntry {
  return {
    id,
    automationId,
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
