import { describe, expect, it } from 'vitest';
import {
  applyMainEventToSnapshot,
  createInitialSnapshot,
  snapshotMetadata,
} from '../snapshot';

describe('snapshot reducer', () => {

  it('records thread starts and backend runtime status updates', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.started',
      payload: { cwd: '/Users/nbonamy/src/codex-claw' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'backend.statusChanged',
      backend: 'codex',
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
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-1' });
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
      backendSessionId: 'claude-session-1',
      type: 'thread.started',
      payload: {
        sessionId: 'claude-session-1',
        transport: 'stdio',
        model: 'haiku',
        reasoningEffort: 'low',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({
      kind: 'claude',
      sessionId: 'claude-session-1',
      transport: 'stdio',
      model: 'haiku',
      reasoningEffort: 'low',
    });
    expect(snapshot.agents[0].backendDefaults).toStrictEqual({
      kind: 'claude',
      model: 'haiku',
      reasoningEffort: 'low',
    });
  });

  it('records thread settings updates as durable agent thread mappings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.settingsUpdated',
      payload: {
        threadSettings: {
          cwd: '/Users/nbonamy/src/codex-claw',
          model: 'gpt-5.5',
          reasoningEffort: 'high',
          serviceTier: 'fast',
          approvalPolicy: 'on-request',
          approvalsReviewer: 'auto_review',
          sandboxPolicy: {
            type: 'workspaceWrite',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-1' });
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
  });

  it('records thread goal updates and clears them from agent metadata', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.goalUpdated',
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
      type: 'thread.goalCleared',
      payload: {},
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].goal).toBeUndefined();
  });

  it('records token usage updates as transient agent context usage', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'thread.tokenUsageUpdated',
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
  });

  it('records account rate-limit updates as global app state', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'account.rateLimitsUpdated',
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

  it('updates metadata without replacing cached conversation transcripts', () => {
    const snapshot = createInitialSnapshot();
    const messages = snapshot.messages;
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
      payload: snapshotMetadata(nextSnapshot),
      occurredAt: '2026-06-09T10:00:00.000Z',
    });

    expect(snapshot.automations).toStrictEqual(nextSnapshot.automations);
    expect(snapshot.messages).toBe(messages);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'snapshot.updated',
      payload: nextSnapshot,
      occurredAt: '2026-06-09T10:00:01.000Z',
    });

    expect(snapshot.messages).toBe(messages);
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

  it('removes an agent status text when collaboration explicitly clears it', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.statusText = 'Reviewing MCP shape';

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.updated',
      payload: {
        id: 'agent-dina',
        statusText: null,
        updatedAt: '2026-06-05T00:00:02.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0]!.statusText).toBeUndefined();
  });

  it('applies work backlog assignment updates from MCP tools', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'workBacklog.assignmentUpdated',
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
});
