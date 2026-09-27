import { describe, expect, it, vi } from 'vitest';
import { decodeClawBackendEvent } from '../backend-protocol/events';
import type { SnapshotEventOwnedBy } from '../snapshot-event-ownership';
import {
  createInitialSnapshot,
} from '../snapshot';
import { applyRuntimeEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-runtime-reducer';

describe('snapshot runtime reducer', () => {

  it('records opaque conversation attachments and payload-owned backend runtime status updates', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      conversationId: 'thread-1',
      backend: 'codex',
      type: 'agent.conversationAttached',
      payload: { cwd: '/Users/nbonamy/src/codex-claw' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as SnapshotEventOwnedBy<'runtime'>);
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'backend.statusChanged',
      backend: 'claude',
      payload: {
        backend: 'codex',
        status: 'running',
        detail: 'connected',
        capabilities: {
          approvalPresets: ['ask-for-approval', 'not-a-preset'],
          permissionModes: [
            { id: 'default', label: 'Default', description: 'Ask when needed.' },
            { id: 123, label: 'Invalid', description: 'Dropped.' },
          ],
          conversationFork: true,
          reasoningEffort: true,
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    } as unknown as SnapshotEventOwnedBy<'runtime'>);

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-1' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(snapshot.backendRuntimes).toContainEqual({
      backend: 'codex',
      status: 'running',
      detail: 'connected',
      capabilities: {
        approvalPresets: ['ask-for-approval'],
        permissionModes: [{ id: 'default', label: 'Default', description: 'Ask when needed.' }],
        conversationFork: true,
        reasoningEffort: true,
      },
    });
  });

  it('records Claude session starts without requiring a Codex thread id', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backend = 'claude';
    snapshot.agents[0].backendDefaults = { kind: 'claude' };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'claude',
      conversationId: 'claude-session-1',
      type: 'agent.conversationAttached',
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({
      kind: 'claude',
      sessionId: 'claude-session-1',
      transport: 'stdio',
    });
    expect(snapshot.agents[0].backendDefaults).toStrictEqual({
      kind: 'claude',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'claude',
      conversationId: 'claude-session-2',
      type: 'agent.conversationAttached',
      payload: {},
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].backendDefaults).toStrictEqual({
      kind: 'claude',
    });
  });

  it('records common conversation settings without changing the conversation binding', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      conversationId: 'thread-old',
      type: 'conversation.settingsUpdated',
      payload: {
        settings: {
          model: 'gpt-5.5',
          reasoningEffort: 'high',
          serviceTier: 'fast',
          approvalPreset: 'approve-for-me',
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-old' });
    expect(snapshot.agents[0].backendDefaults).toStrictEqual({
      kind: 'codex',
      model: 'gpt-5.5',
      approvalPreset: 'approve-for-me',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandboxMode: 'workspace-write',
      reasoningEffort: 'high',
      serviceTier: 'fast',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      conversationId: 'thread-old',
      type: 'conversation.settingsUpdated',
      payload: {
        settings: {
          serviceTier: null,
          approvalPreset: 'full-access',
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].backendDefaults).toMatchObject({
      kind: 'codex',
      approvalPreset: 'full-access',
      serviceTier: null,
    });
  });

  it('does not overwrite an explicit next-prompt model choice with current-thread settings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    snapshot.agents[0].backendDefaults = {
      kind: 'codex', model: 'sol', reasoningEffort: 'high', serviceTier: null, userSelectedModel: true,
    };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      conversationId: 'thread-old',
      type: 'conversation.settingsUpdated',
      payload: { settings: { model: 'astra', reasoningEffort: 'medium', serviceTier: 'fast', approvalPreset: 'full-access' } },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].backendDefaults).toMatchObject({
      model: 'sol', reasoningEffort: 'high', serviceTier: null, userSelectedModel: true, approvalPreset: 'full-access',
    });
  });

  it('records thread goal updates and clears them from agent metadata', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'conversation.goalUpdated',
      payload: {
        goal: {
          threadId: 'thread-1',
          objective: 'Ship the goal shelf',
          status: 'active',
          tokenBudget: null,
          tokensUsed: 1200,
          timeUsedSeconds: 30,
          createdAt: 1_780_000_000,
          updatedAt: 1_780_000_030,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].goal).toStrictEqual({
      threadId: 'thread-1',
      objective: 'Ship the goal shelf',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 1200,
      timeUsedSeconds: 30,
      createdAt: 1_780_000_000,
      updatedAt: 1_780_000_030,
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'conversation.goalCleared',
      payload: {},
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].goal).toBeUndefined();

    const flatGoal = {
      threadId: 'thread-2',
      objective: 'Preserve flat goal compatibility',
      status: 'paused' as const,
      tokenBudget: 10_000,
      tokensUsed: 2_000,
      timeUsedSeconds: 45,
      createdAt: 1_780_000_100,
      updatedAt: 1_780_000_145,
    };
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-2',
      type: 'conversation.goalUpdated',
      payload: { goal: flatGoal },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    expect(snapshot.agents[0].goal).toStrictEqual(flatGoal);
  });

  it('records token usage updates as transient agent context usage', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'conversation.contextUsageUpdated',
      payload: {
        contextUsage: {
          totalTokens: 50_000,
          inputTokens: 40_000,
          cachedInputTokens: 10_000,
          outputTokens: 8_000,
          reasoningOutputTokens: 2_000,
          lastTotalTokens: 3_000,
          modelContextWindow: 200_000,
          usedPercent: 25,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].contextUsage).toStrictEqual({
      totalTokens: 50_000,
      inputTokens: 40_000,
      cachedInputTokens: 10_000,
      outputTokens: 8_000,
      reasoningOutputTokens: 2_000,
      lastTotalTokens: 3_000,
      modelContextWindow: 200_000,
      usedPercent: 25,
    });

    const flatContextUsage = {
      totalTokens: 60_000,
      inputTokens: 45_000,
      cachedInputTokens: 12_000,
      outputTokens: 10_000,
      reasoningOutputTokens: 3_000,
      lastTotalTokens: 4_000,
      modelContextWindow: null,
      usedPercent: null,
    };
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      type: 'conversation.contextUsageUpdated',
      payload: { contextUsage: flatContextUsage },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.agents[0].contextUsage).toStrictEqual(flatContextUsage);
  });

  it('records account rate-limit updates as global app state', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'account.rateLimitsUpdated',
      backend: 'codex',
      payload: {
        rateLimits: {
          limitId: 'codex',
          limitName: 'Codex',
          primary: {
            usedPercent: 25,
            windowDurationMins: 15,
            resetsAt: 1_780_000_000,
          },
          secondary: null,
          credits: {
            hasCredits: true,
            unlimited: false,
            balance: '10.00',
          },
          individualLimit: null,
          planType: 'pro',
          rateLimitReachedType: null,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.accountRateLimits).toStrictEqual({
      limitId: 'codex',
      limitName: 'Codex',
      primary: {
        usedPercent: 25,
        windowDurationMins: 15,
        resetsAt: 1_780_000_000,
      },
      secondary: null,
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: '10.00',
      },
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    });
  });

  it('rejects legacy flat account rate-limit payloads', () => {
    const decode = () => decodeClawBackendEvent({
      seq: 1,
      type: 'account.rateLimitsUpdated',
      backend: 'codex',
      payload: {
        limitId: 'codex',
        limitName: 'Codex',
        primary: {
          usedPercent: 25,
          windowDurationMins: 15,
          resetsAt: 1_780_000_000,
        },
        secondary: null,
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: '10.00',
        },
        individualLimit: null,
        planType: 'pro',
        rateLimitReachedType: null,
        rateLimits: 42,
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    expect(decode).toThrow('$.payload.rateLimits');
  });

  it('applies complete snapshots from snapshot update events', () => {
    const snapshot = createInitialSnapshot();
    const nextSnapshot = createInitialSnapshot();
    nextSnapshot.automations = [{
      id: 'automation-bugs',
      name: 'GitHub bugs',
      enabled: true,
      repositories: [{
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
      }],
      teamId: 'team-codex-claw',
      schedule: { intervalMinutes: 60 },
      executionLog: [],
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:00:00.000Z',
    }];

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'snapshot.updated',
      payload: nextSnapshot,
      occurredAt: '2026-06-09T10:00:00.000Z',
    });

    expect(snapshot.automations).toStrictEqual(nextSnapshot.automations);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'snapshot.updated',
      payload: nextSnapshot,
      occurredAt: '2026-06-09T10:00:01.000Z',
    });

  });

  it('ignores deeply malformed snapshot payloads without downgrading full snapshots', () => {
    const snapshot = createInitialSnapshot();
    const teams = snapshot.teams;
    const agents = snapshot.agents;
    const malformedMetadata = createInitialSnapshot();
    (malformedMetadata.general.plugins as unknown as Record<string, unknown>).computerUseEnabled = 'yes';

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'snapshot.updated',
      payload: malformedMetadata,
      occurredAt: '2026-06-09T10:00:00.000Z',
    });

    const malformedFullSnapshot = createInitialSnapshot();
    malformedFullSnapshot.agents[0]!.name = 42 as never;
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'snapshot.updated',
      payload: malformedFullSnapshot,
      occurredAt: '2026-06-09T10:00:01.000Z',
    });

    expect(snapshot.teams).toStrictEqual(teams);
    expect(snapshot.agents).toStrictEqual(agents);
  });

  it('merges agent updates from main-process collaboration tools', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.updated',
      payload: {
        id: 'agent-dina',
        statusText: 'Reviewing MCP shape',
        isRegistered: true,
        mcpSessionId: 'mcp-session-1',
        updatedAt: '2026-06-05T00:00:02.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0]).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      isRegistered: true,
      mcpSessionId: 'mcp-session-1',
      statusText: 'Reviewing MCP shape',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:02.000Z',
    });
  });

  it('removes nullable agent collaboration state when explicitly cleared', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.statusText = 'Reviewing MCP shape';
    snapshot.agents[0]!.threadFlags = { delegate_to_worktree: true };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.updated',
      payload: {
        id: 'agent-dina',
        threadFlags: null,
        statusText: null,
        updatedAt: '2026-06-05T00:00:02.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0]!.statusText).toBeUndefined();
    expect(snapshot.agents[0]!.threadFlags).toBeUndefined();
  });

  it('applies work backlog assignment updates from MCP tools', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'workItem.assignmentUpdated',
      payload: {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        policy: 'review',
        status: 'completed',
        completedAt: '2026-06-09T13:30:00.000Z',
      },
      occurredAt: '2026-06-09T13:30:00.000Z',
    });

    expect(snapshot.workBacklog.assignments).toStrictEqual({
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        policy: 'review',
        status: 'completed',
        completedAt: '2026-06-09T13:30:00.000Z',
      },
    });
  });

  it('stores runtime git status for an agent', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'git.statusUpdated',
      payload: {
        folder: '/Users/nbonamy/src/codex-claw',
        branch: 'main',
        ahead: 1,
        behind: 0,
        changedFiles: 3,
        addedLines: 12,
        removedLines: 4,
        hasUntracked: true,
        state: 'dirty',
        updatedAt: '2026-06-05T00:00:03.000Z',
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agentGitStatuses['agent-dina']).toStrictEqual({
      folder: '/Users/nbonamy/src/codex-claw',
      branch: 'main',
      ahead: 1,
      behind: 0,
      changedFiles: 3,
      addedLines: 12,
      removedLines: 4,
      hasUntracked: true,
      state: 'dirty',
      updatedAt: '2026-06-05T00:00:03.000Z',
    });
  });

  it('preserves wall-clock status timestamps and git status for unknown agents', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-05T01:00:00.000Z'));
      const snapshot = createInitialSnapshot();

      applyMainEventToSnapshot(snapshot, {
        seq: 1,
        agentId: 'agent-dina',
        type: 'agent.statusChanged',
        payload: { type: 'working', detail: 'Reviewing' },
        occurredAt: '2026-06-05T00:00:01.000Z',
      });
      applyMainEventToSnapshot(snapshot, {
        seq: 2,
        agentId: 'unknown-agent',
        type: 'git.statusUpdated',
        payload: {
          folder: '/tmp/unknown',
          branch: null,
          ahead: 0,
          behind: 0,
          changedFiles: 0,
          addedLines: 0,
          removedLines: 0,
          hasUntracked: false,
          state: 'clean',
          updatedAt: '2026-06-05T00:00:02.000Z',
        },
        occurredAt: '2026-06-05T00:00:02.000Z',
      } as unknown as SnapshotEventOwnedBy<'runtime'>);

      expect(snapshot.agents[0].updatedAt).toBe('2026-06-05T01:00:00.000Z');
      expect(snapshot.agents[0].lastActivityAt).toBe('2026-06-05T00:00:01.000Z');
      expect(snapshot.agentGitStatuses['unknown-agent']).toStrictEqual({
        folder: '/tmp/unknown',
        branch: null,
        ahead: 0,
        behind: 0,
        changedFiles: 0,
        addedLines: 0,
        removedLines: 0,
        hasUntracked: false,
        state: 'clean',
        updatedAt: '2026-06-05T00:00:02.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not treat an idle startup status as agent activity', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].lastActivityAt = '2026-06-04T20:00:00.000Z';

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: snapshot.agents[0].id,
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
      occurredAt: '2026-06-05T08:00:00.000Z',
    });

    expect(snapshot.agents[0].lastActivityAt).toBe('2026-06-04T20:00:00.000Z');
  });

  it('records when an agent finishes meaningful activity', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    snapshot.agents[0].lastActivityAt = '2026-06-05T07:00:00.000Z';

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: snapshot.agents[0].id,
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
      occurredAt: '2026-06-05T08:00:00.000Z',
    });

    expect(snapshot.agents[0].lastActivityAt).toBe('2026-06-05T08:00:00.000Z');
  });

  it('processes backlog updates without an envelope agent id', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'workItem.assignmentUpdated',
      payload: {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#global',
        agentId: 'agent-dina',
        assignedAt: '2026-06-05T00:00:02.000Z',
        status: 'working',
        automationId: ' automation-global ',
        automationExecutionId: ' execution-global ',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      type: 'workItem.assignmentUpdated',
      payload: {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#review',
        agentId: 'agent-dina',
        assignedAt: '2026-06-05T00:00:03.000Z',
        status: 'readyForReview',
        note: ' Waiting for review ',
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#global']).toStrictEqual({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#global',
      agentId: 'agent-dina',
      assignedAt: '2026-06-05T00:00:02.000Z',
      policy: 'complete',
      status: 'inProgress',
      automationId: 'automation-global',
      automationExecutionId: 'execution-global',
    });
    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#review']).toStrictEqual({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#review',
      agentId: 'agent-dina',
      assignedAt: '2026-06-05T00:00:03.000Z',
      policy: 'review',
      status: 'readyForReview',
      note: 'Waiting for review',
    });
  });

  it('preserves missing thread guards and rejects malformed payloads at the decoder boundary', () => {
    const snapshot = createInitialSnapshot();
    const backendRuntimes = snapshot.backendRuntimes;

    expect(() => decodeClawBackendEvent({
      seq: 1,
      backend: 'codex',
      type: 'backend.statusChanged',
      payload: { backend: 'invalid', status: 'running' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    })).toThrow();
    expect(snapshot.backendRuntimes).toBe(backendRuntimes);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'conversation.settingsUpdated',
      payload: { settings: { model: 'ignored-without-thread' } },
      occurredAt: '2026-06-05T00:00:03.000Z',
    } as unknown as SnapshotEventOwnedBy<'runtime'>);
    expect(snapshot.agents[0].backendSession).toBeUndefined();

    const goal = snapshot.agents[0].goal;
    const contextUsage = snapshot.agents[0].contextUsage;
    expect(() => decodeClawBackendEvent({
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'conversation.goalUpdated',
      payload: { goal: { objective: 'missing fields' } },
      occurredAt: '2026-06-05T00:00:04.000Z',
    })).toThrow();
    expect(() => decodeClawBackendEvent({
      seq: 5,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      type: 'conversation.contextUsageUpdated',
      payload: { contextUsage: { totalTokens: 10 } },
      occurredAt: '2026-06-05T00:00:05.000Z',
    })).toThrow();
    expect(snapshot.agents[0].goal).toBe(goal);
    expect(snapshot.agents[0].contextUsage).toBe(contextUsage);
  });

  it('rejects malformed backlog payloads at the decoder boundary', () => {
    const snapshot = createInitialSnapshot();
    const assignments = snapshot.workBacklog.assignments;

    expect(() => decodeClawBackendEvent({
      seq: 3,
      type: 'workItem.assignmentUpdated',
      payload: {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#malformed',
        agentId: 'agent-dina',
        assignedAt: '2026-06-05T00:00:03.000Z',
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    })).toThrow();
    expect(snapshot.workBacklog.assignments).toBe(assignments);
  });
});
