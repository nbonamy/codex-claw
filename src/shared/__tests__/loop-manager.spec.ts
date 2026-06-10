import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '../snapshot';
import {
  createLoopInSnapshot,
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
    }, '2026-06-09T11:00:00.000Z', () => 'loop-github-bugs');

    expect(loop).toStrictEqual({
      id: 'loop-github-bugs',
      name: 'nbonamy/codex-claw / bug',
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
      processedWorkItemIds: ['github:nbonamy/codex-claw#12'],
      executionLog: [{
        id: 'loop-execution-1',
        status: 'failed',
        createdAgents: [{
          agentId: 'agent-dina',
        }],
      }],
    });

    expect(updateLoopExecutionAgentConversationInSnapshot(snapshot, 'loop-github-bugs', 'loop-execution-1', 'agent-dina', {
      conversationId: 'thread-dina',
      turnId: 'turn-dina',
      updatedAt: '2026-06-09T12:03:00.000Z',
    })).toMatchObject({
      updatedAt: '2026-06-09T12:03:00.000Z',
      executionLog: [{
        id: 'loop-execution-1',
        createdAgents: [{
          agentId: 'agent-dina',
          conversationId: 'thread-dina',
          turnId: 'turn-dina',
        }],
      }],
    });

    expect(deleteLoopFromSnapshot(snapshot, 'loop-github-bugs')?.id).toBe('loop-github-bugs');
    expect(snapshot.loops).toStrictEqual([]);
  });

  it('rejects loops with missing bench agents or teams', () => {
    const snapshot = createInitialSnapshot();

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
  });
});
