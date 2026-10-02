import { describe, expect, it } from 'vitest';
import type { AutomationExecutionLogEntry, CreateAutomationInput } from '../contracts';
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
import { createInitialSnapshot } from '../snapshot';

describe('automation manager', () => {
  it('normalizes and updates the simple automation contract', () => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
    const automation = createAutomationInSnapshot(
      snapshot,
      {
        enabled: true,
        repositories: [
          repository(' nbonamy/codex-claw ', ' /src/codex-claw '),
          repository('nbonamy/codex-claw', '/duplicate'),
          repository('nbonamy/witsy', '/src/witsy'),
        ],
        teamId: ' team-codex-claw ',
        selectionPrompt: ' Pick ready bugs. ',
        assignmentPrompt: ' Fix the issue and verify it. ',
        schedule: { intervalMinutes: 60.9 },
      },
      '2026-06-09T11:00:00.000Z',
      () => 'automation-github-work',
    );

    expect(automation).toStrictEqual({
      backend: 'codex',
      id: 'automation-github-work',
      name: 'nbonamy/codex-claw +1',
      enabled: true,
      repositories: [repository('nbonamy/codex-claw', '/src/codex-claw'), repository('nbonamy/witsy', '/src/witsy')],
      teamId: 'team-codex-claw',
      selectionPrompt: 'Pick ready bugs.',
      assignmentPrompt: 'Fix the issue and verify it.',
      schedule: { intervalMinutes: 60 },
      executionLog: [],
      createdAt: '2026-06-09T11:00:00.000Z',
      updatedAt: '2026-06-09T11:00:00.000Z',
    });

    expect(
      updateAutomationInSnapshot(
        snapshot,
        {
          ...automationInput(),
          id: 'automation-github-work',
          name: 'Nightly triage',
          enabled: false,
          selectionPrompt: ' ',
          assignmentPrompt: ' ',
          schedule: { intervalMinutes: 1_440 },
        },
        '2026-06-09T12:00:00.000Z',
      ),
    ).toMatchObject({
      name: 'Nightly triage',
      enabled: false,
      repositories: [repository('nbonamy/codex-claw', '/src/codex-claw')],
      teamId: 'team-codex-claw',
      schedule: { intervalMinutes: 1_440 },
      updatedAt: '2026-06-09T12:00:00.000Z',
    });
    expect(automation).not.toHaveProperty('selectionPrompt');
    expect(automation).not.toHaveProperty('assignmentPrompt');
  });

  it('rejects invalid repositories, teams, schedules, and missing updates', () => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
    expect(
      createAutomationInSnapshot(snapshot, {
        ...automationInput(),
        repositories: [],
      }),
    ).toBeNull();
    expect(
      createAutomationInSnapshot(snapshot, {
        ...automationInput(),
        repositories: [repository('', '/src/codex-claw')],
      }),
    ).toBeNull();
    expect(
      createAutomationInSnapshot(snapshot, {
        ...automationInput(),
        teamId: 'missing',
      }),
    ).toBeNull();
    expect(
      createAutomationInSnapshot(snapshot, {
        ...automationInput(),
        schedule: { intervalMinutes: 0 },
      }),
    ).toBeNull();
    expect(
      updateAutomationInSnapshot(snapshot, {
        ...automationInput(),
        id: 'missing',
      }),
    ).toBeNull();
    expect(deleteAutomationFromSnapshot(snapshot, 'missing')).toBeNull();
    expect(clearAutomationExecutionHistoryInSnapshot(snapshot, 'missing')).toBeNull();
  });

  it('records, completes, updates, deletes, and clears execution history', () => {
    const snapshot = createInitialSnapshot();
    snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
    const automation = createAutomationInSnapshot(snapshot, automationInput(), '2026-06-09T11:00:00.000Z', () => 'automation-backlog');

    expect(recordAutomationExecutionInSnapshot(snapshot, 'missing', execution('run-1'))).toBeNull();
    expect(recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', execution('run-1', 'other'))).toBeNull();

    const failed = execution('run-1', 'automation-backlog', 'failed');
    failed.error = 'GitHub failed';
    expect(recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', failed)?.lastError).toBe('GitHub failed');

    const working = execution('run-1', 'automation-backlog', 'working');
    expect(recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', working)).toMatchObject({
      lastRunAt: working.startedAt,
      lastCreatedCount: 1,
      executionLog: [{ id: 'run-1', status: 'working' }],
    });
    expect(automation).not.toHaveProperty('lastError');

    expect(
      updateAutomationExecutionAgentConversationInSnapshot(snapshot, 'automation-backlog', 'run-1', 'agent-dina', {
        conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        updatedAt: '2026-06-09T12:02:00.000Z',
      }),
    ).toMatchObject({
      executionLog: [
        {
          createdAgents: [{ conversationRef: { backend: 'codex', threadId: 'thread-dina' } }],
        },
      ],
    });
    expect(
      updateAutomationExecutionAgentConversationInSnapshot(snapshot, 'automation-backlog', 'missing', 'agent-dina', {
        conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        updatedAt: '2026-06-09T12:02:00.000Z',
      }),
    ).toBeNull();

    expect(completeAutomationExecutionInSnapshot(snapshot, 'automation-backlog', 'run-1', '2026-06-09T12:03:00.000Z')).toMatchObject({
      executionLog: [{ status: 'completed', completedAt: '2026-06-09T12:03:00.000Z' }],
    });
    expect(completeAutomationExecutionInSnapshot(snapshot, 'automation-backlog', 'missing')).toBeNull();

    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'automation-backlog', 'run-1', '2026-06-09T12:04:00.000Z')).toMatchObject({
      executionLog: [],
    });
    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'automation-backlog', 'missing')).toBeNull();

    recordAutomationExecutionInSnapshot(snapshot, 'automation-backlog', working);
    expect(clearAutomationExecutionHistoryInSnapshot(snapshot, 'automation-backlog', '2026-06-09T12:05:00.000Z')).toMatchObject({
      executionLog: [],
      updatedAt: '2026-06-09T12:05:00.000Z',
    });
    expect(automation).not.toHaveProperty('lastRunAt');
    expect(deleteAutomationFromSnapshot(snapshot, 'automation-backlog')?.id).toBe('automation-backlog');
  });
});

function automationInput(): CreateAutomationInput {
  return {
    repositories: [repository('nbonamy/codex-claw', '/src/codex-claw')],
    teamId: 'team-codex-claw',
    selectionPrompt: 'Pick ready bugs.',
    assignmentPrompt: 'Fix the issue.',
    schedule: { intervalMinutes: 60 },
  };
}

function repository(repositoryId: string, sourceRepositoryPath: string) {
  return { provider: 'github' as const, repositoryId, sourceRepositoryPath };
}

function execution(
  id: string,
  automationId = 'automation-backlog',
  status: AutomationExecutionLogEntry['status'] = 'completed',
): AutomationExecutionLogEntry {
  return {
    id,
    automationId,
    startedAt: '2026-06-09T12:01:00.000Z',
    status,
    createdCount: 1,
    createdAgents: [
      {
        agentId: 'agent-dina',
        agentName: 'Dina',
        workItemId: 'github:nbonamy/codex-claw#12',
        workItemTitle: 'Fix cockpit',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
      },
    ],
  };
}
