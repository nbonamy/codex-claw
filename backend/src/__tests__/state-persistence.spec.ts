import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStatePersistence, persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
import { appendUserPrompt, createEmptySnapshot, createInitialSnapshot } from '@codex-claw/core/snapshot';
import { defaultPluginSettings, defaultThemeSettings } from '@codex-claw/core/settings';
import type { RemoteConnection } from '@codex-claw/core/contracts';

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('AppStatePersistence', () => {
  it('loads the default team with no agents when no state file exists', async () => {
    const persistence = new AppStatePersistence(await tempStatePath());

    await expect(persistence.load()).resolves.toStrictEqual(createEmptySnapshot());
  });

  it('coalesces overlapping saves and writes the latest pending snapshot', async () => {
    const filePath = await tempStatePath();
    const persistence = new AppStatePersistence(filePath);
    const first = createInitialSnapshot();
    first.general.agentListCompact = false;
    const second = createInitialSnapshot();
    second.general.agentListCompact = true;
    const third = createInitialSnapshot();
    third.general.agentListCompact = false;

    const firstSave = persistence.save(first);
    first.general.agentListCompact = true;
    const secondSave = persistence.save(second);
    const thirdSave = persistence.save(third);
    await Promise.all([firstSave, secondSave, thirdSave]);

    const written = JSON.parse(await readFile(filePath, 'utf8')) as { general: { agentListCompact: boolean } };
    expect(written.general.agentListCompact).toBe(false);
  });

  it('keeps persisted empty agents empty while defaulting missing teams', () => {
    const restored = snapshotFromPersistedState({
      teams: [],
      agents: [],
      bench: [],
      activeTeamId: null,
      activeAgentId: 'agent-dina',
      theme: defaultThemeSettings,
    });

    expect(restored.teams).toStrictEqual(createEmptySnapshot().teams);
    expect(restored.agents).toStrictEqual([]);
    expect(restored.activeTeamId).toBe('team-codex-claw');
    expect(restored.activeAgentId).toBeNull();
  });

  it('restores valid per-agent Open In choices and drops unsupported values', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].openInApplication = 'ghostty';
    const persisted = persistedStateFromSnapshot(snapshot) as unknown as {
      agents: Array<Record<string, unknown>>;
    };

    expect(snapshotFromPersistedState(persisted).agents[0].openInApplication).toBe('ghostty');
    persisted.agents[0].openInApplication = 'unknown-editor';
    expect(snapshotFromPersistedState(persisted).agents[0].openInApplication).toBeUndefined();
  });

  it('round-trips workspace identity and ignores invalid legacy metadata', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].name = null;
    snapshot.agents[0].workspace = {
      kind: 'git',
      folder: '/Users/nbonamy/src/codex-claw-feature',
      repositoryName: 'codex-claw',
      repositoryRoot: '/Users/nbonamy/src/codex-claw-feature',
      branch: 'feat/work-routing',
      isLinkedWorktree: true,
      primaryWorktreeRoot: '/Users/nbonamy/src/codex-claw',
      originUrl: 'git@github.com:nbonamy/codex-claw.git',
      updatedAt: '2026-08-27T12:00:00.000Z',
    };
    const persisted = persistedStateFromSnapshot(snapshot) as unknown as {
      agents: Array<Record<string, unknown>>;
    };

    expect(snapshotFromPersistedState(persisted).agents[0]).toMatchObject({
      name: null,
      workspace: snapshot.agents[0].workspace,
    });
    persisted.agents[0].workspace = { kind: 'git', repositoryName: 42 };
    expect(snapshotFromPersistedState(persisted).agents[0].workspace).toBeUndefined();
  });

  it('persists the observed subagent tree for backend and renderer reloads', () => {
    const snapshot = createInitialSnapshot();
    const agentId = snapshot.agents[0].id;
    snapshot.subagentTrees[agentId] = {
      rootConversationId: 'thread-root',
      nodes: {
        'thread-child': {
          conversationId: 'thread-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-05T00:00:01.000Z',
          status: 'completed',
          agentPath: '/root/scout',
          agentNickname: 'Harvey',
          agentRole: 'worker',
          updatedAt: '2026-06-05T00:00:02.000Z',
        },
      },
      operations: {
        'spawn-1': {
          id: 'spawn-1',
          lifecycle: 'completed',
          kind: 'spawnAgent',
          status: 'completed',
          senderConversationId: 'thread-root',
          receiverConversationIds: ['thread-child'],
          occurredAt: '2026-06-05T00:00:01.000Z',
        },
      },
      activities: {},
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.subagentTrees).toStrictEqual(snapshot.subagentTrees);

    const legacyPersisted = persistedStateFromSnapshot(snapshot) as unknown as {
      subagentTrees: Record<string, { nodes: Record<string, { createdAt?: string }> }>;
    };
    delete legacyPersisted.subagentTrees[agentId]?.nodes['thread-child']?.createdAt;
    expect(snapshotFromPersistedState(legacyPersisted).subagentTrees[agentId]?.nodes['thread-child']?.createdAt)
      .toBe('2026-06-05T00:00:02.000Z');

    snapshot.subagentTrees[agentId]!.nodes['thread-root'] = {
      conversationId: 'thread-root',
      parentConversationId: 'thread-child',
      createdAt: '2026-06-05T00:00:03.000Z',
      status: 'running',
      agentPath: '/root',
      updatedAt: '2026-06-05T00:00:03.000Z',
    };
    snapshot.subagentTrees[agentId]!.activities['activity-root'] = {
      id: 'activity-root',
      lifecycle: 'completed',
      kind: 'interacted',
      conversationId: 'thread-root',
      agentPath: '/root',
      occurredAt: '2026-06-05T00:00:03.000Z',
    };
    const cleaned = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));
    expect(cleaned.subagentTrees[agentId]?.nodes['thread-root']).toBeUndefined();
    expect(cleaned.subagentTrees[agentId]?.activities['activity-root']).toBeUndefined();
  });

  it('saves metadata, backend session, context usage, and collaboration status without transcripts or runtime state', async () => {
    const filePath = await tempStatePath();
    const persistence = new AppStatePersistence(filePath);
    const snapshot = createInitialSnapshot();
    snapshot.backendRuntimes = [{ backend: 'codex', status: 'running', detail: 'connected' }];
    snapshot.accountRateLimits = {
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 62,
        windowDurationMins: 300,
        resetsAt: 1_780_756_682,
      },
      secondary: {
        usedPercent: 50,
        windowDurationMins: 10_080,
        resetsAt: 1_781_140_878,
      },
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };
    snapshot.agents[0] = {
      ...snapshot.agents[0],
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
      backendDefaults: {
        kind: 'codex',
        approvalPreset: 'approve-for-me',
        approvalPolicy: 'on-request',
        approvalsReviewer: 'auto_review',
        sandboxMode: 'workspace-write',
        serviceTier: 'fast',
      },
      openInApplication: 'xcode',
      contextUsage: {
        totalTokens: 1200,
        inputTokens: 900,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 80,
        lastTotalTokens: 300,
        modelContextWindow: 10000,
        usedPercent: 12,
      },
      plan: {
        threadId: 'thread-dina',
        turnId: 'turn-plan',
        kind: 'execution',
        status: 'inProgress',
        explanation: 'Current plan',
        steps: [
          { step: 'Inspect composer', status: 'completed' },
          { step: 'Wire preview', status: 'inProgress' },
        ],
        markdown: 'Current plan\n- [x] Inspect composer\n- [ ] Wire preview',
        updatedAt: '2026-06-05T10:11:12.000Z',
      },
      goal: {
        threadId: 'thread-dina',
        objective: 'Ship the goal shelf',
        status: 'active',
        tokenBudget: null,
        tokensUsed: 1200,
        timeUsedSeconds: 30,
        createdAt: 1_780_000_000,
        updatedAt: 1_780_000_030,
      },
      isRegistered: true,
      mcpSessionId: 'mcp-session',
      statusText: 'Registered',
      status: { type: 'working', detail: 'busy' },
    };
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        policy: 'review',
        status: 'completed',
        completedAt: '2026-06-09T13:30:00.000Z',
      },
    };
    appendUserPrompt(snapshot, 'agent-dina', 'do not persist this', '2026-06-05T10:11:12.000Z');

    await persistence.save(snapshot);

    const written = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    expect(written).not.toHaveProperty('messages');
    expect(written).not.toHaveProperty('backendRuntimes');
    expect(written).not.toHaveProperty('appServer');
    expect(written.accountRateLimits).toStrictEqual(snapshot.accountRateLimits);
    expect(written.activeTeamId).toBe('team-codex-claw');
    const writtenAgent = (written.agents as Array<Record<string, unknown>>)[0];
    expect(writtenAgent.backend).toBe('codex');
    expect(writtenAgent.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-dina' });
    expect(writtenAgent.openInApplication).toBe('xcode');
    expect(writtenAgent).not.toHaveProperty('codexThreadId');
    expect(writtenAgent.contextUsage).toStrictEqual({
      totalTokens: 1200,
      inputTokens: 900,
      cachedInputTokens: 100,
      outputTokens: 300,
      reasoningOutputTokens: 80,
      lastTotalTokens: 300,
      modelContextWindow: 10000,
      usedPercent: 12,
    });
    expect(writtenAgent.plan).toStrictEqual({
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Current plan',
      steps: [
        { step: 'Inspect composer', status: 'completed' },
        { step: 'Wire preview', status: 'inProgress' },
      ],
      markdown: 'Current plan\n- [x] Inspect composer\n- [ ] Wire preview',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(writtenAgent.goal).toStrictEqual({
      threadId: 'thread-dina',
      objective: 'Ship the goal shelf',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 1200,
      timeUsedSeconds: 30,
      createdAt: 1_780_000_000,
      updatedAt: 1_780_000_030,
    });
    expect(writtenAgent).not.toHaveProperty('assignedWorkItems');
    expect((written.workBacklog as Record<string, unknown>).assignments).toStrictEqual({
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
    expect(writtenAgent).not.toHaveProperty('isRegistered');
    expect(writtenAgent).not.toHaveProperty('mcpSessionId');
    expect(writtenAgent.statusText).toBe('Registered');
    expect(writtenAgent).not.toHaveProperty('status');
  });

  it('resets transient agent fields while preserving metadata, status text, and backend session on load', () => {
    const snapshot = createInitialSnapshot();
    snapshot.accountRateLimits = {
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 62,
        windowDurationMins: 300,
        resetsAt: 1_780_756_682,
      },
      secondary: {
        usedPercent: 50,
        windowDurationMins: 10_080,
        resetsAt: 1_781_140_878,
      },
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };
    snapshot.agents[0] = {
      ...snapshot.agents[0],
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
      backendDefaults: {
        kind: 'codex',
        approvalPreset: 'approve-for-me',
        approvalPolicy: 'on-request',
        approvalsReviewer: 'auto_review',
        sandboxMode: 'workspace-write',
        serviceTier: 'fast',
      },
      contextUsage: {
        totalTokens: 1200,
        inputTokens: 900,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 80,
        lastTotalTokens: 300,
        modelContextWindow: 10000,
        usedPercent: 12,
      },
      plan: {
        threadId: 'thread-dina',
        turnId: 'turn-plan',
        kind: 'execution',
        status: 'inProgress',
        explanation: 'Current plan',
        steps: [
          { step: 'Inspect composer', status: 'completed' },
          { step: 'Wire preview', status: 'inProgress' },
        ],
        markdown: 'Current plan\n- [x] Inspect composer\n- [ ] Wire preview',
        updatedAt: '2026-06-05T10:11:12.000Z',
      },
      goal: {
        threadId: 'thread-dina',
        objective: 'Ship the goal shelf',
        status: 'active',
        tokenBudget: null,
        tokensUsed: 1200,
        timeUsedSeconds: 30,
        createdAt: 1_780_000_000,
        updatedAt: 1_780_000_030,
      },
      isRegistered: true,
      mcpSessionId: 'mcp-session',
      statusText: 'Registered',
      status: { type: 'working', detail: 'busy' },
    };

    const persisted = persistedStateFromSnapshot(snapshot);
    (persisted.agents[0] as Record<string, unknown>).assignedWorkItems = [
      {
        provider: 'github',
        id: 'nbonamy/codex-claw#12',
        repositoryId: 'nbonamy/codex-claw',
        repositoryFullName: 'nbonamy/codex-claw',
        number: 12,
        title: 'Fix cockpit drag target',
        url: 'https://github.com/nbonamy/codex-claw/issues/12',
        assignedAt: '2026-06-09T13:00:00.000Z',
      },
      {
        provider: 'github',
        id: 'nbonamy/codex-claw#12',
        repositoryId: 'nbonamy/codex-claw',
        repositoryFullName: 'nbonamy/codex-claw',
        number: 12,
        title: 'Duplicate should be dropped',
        url: 'https://github.com/nbonamy/codex-claw/issues/12',
        assignedAt: '2026-06-09T13:01:00.000Z',
      },
      {
        provider: 'jira',
        id: 'TEAM-1',
        repositoryId: 'TEAM',
        repositoryFullName: 'TEAM',
        number: 1,
        title: 'Invalid provider',
        url: 'https://example.com/TEAM-1',
        assignedAt: '2026-06-09T13:02:00.000Z',
      },
    ];
    const restored = snapshotFromPersistedState(persisted);

    expect(restored.agents[0]).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: {
        kind: 'codex',
        approvalPreset: 'approve-for-me',
        approvalPolicy: 'on-request',
        approvalsReviewer: 'auto_review',
        sandboxMode: 'workspace-write',
        serviceTier: 'fast',
      },
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
      contextUsage: {
        totalTokens: 1200,
        inputTokens: 900,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 80,
        lastTotalTokens: 300,
        modelContextWindow: 10000,
        usedPercent: 12,
      },
      plan: {
        threadId: 'thread-dina',
        turnId: 'turn-plan',
        kind: 'execution',
        status: 'inProgress',
        explanation: 'Current plan',
        steps: [
          { step: 'Inspect composer', status: 'completed' },
          { step: 'Wire preview', status: 'inProgress' },
        ],
        markdown: 'Current plan\n- [x] Inspect composer\n- [ ] Wire preview',
        updatedAt: '2026-06-05T10:11:12.000Z',
      },
      goal: {
        threadId: 'thread-dina',
        objective: 'Ship the goal shelf',
        status: 'active',
        tokenBudget: null,
        tokensUsed: 1200,
        timeUsedSeconds: 30,
        createdAt: 1_780_000_000,
        updatedAt: 1_780_000_030,
      },
      statusText: 'Registered',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    expect(restored.messages).toStrictEqual([]);
    expect(restored.backendRuntimes).toStrictEqual(createEmptySnapshot().backendRuntimes);
    expect(restored.accountRateLimits).toStrictEqual(snapshot.accountRateLimits);
    expect(restored.workBacklog.assignments).toStrictEqual({
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        policy: 'review',
        status: 'inProgress',
      },
    });
  });

  it('persists work integration metadata without token material', () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog = {
      connections: [{
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
        connectedAt: '2026-06-09T12:00:00.000Z',
      }],
      providerConfigurations: {
        github: {
          repositoryId: 'nbonamy/codex-claw',
          assigneeLogin: 'nbonamy',
          tagName: 'bug',
        },
      },
      providerSettings: {
        github: {
          oauthClientId: 'client-id',
        },
      },
      assignments: {
        'github:nbonamy/codex-claw#12': {
          provider: 'github',
          itemId: 'nbonamy/codex-claw#12',
          agentId: 'agent-dina',
          assignedAt: '2026-06-09T13:00:00.000Z',
          policy: 'complete',
          status: 'completed',
          completedAt: '2026-06-09T13:30:00.000Z',
          loopId: 'loop-bugs',
          loopExecutionId: 'loop-exec-1',
          completionInstructionsDeliveredAt: '2026-06-09T13:20:00.000Z',
        },
      },
    };

    const persisted = persistedStateFromSnapshot(snapshot);

    expect(persisted.workBacklog).toStrictEqual({
      connections: [{
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
        connectedAt: '2026-06-09T12:00:00.000Z',
      }],
      providerConfigurations: {
        github: {
          repositoryId: 'nbonamy/codex-claw',
          assigneeLogin: 'nbonamy',
          tagName: 'bug',
        },
      },
      providerSettings: {
        github: {
          oauthClientId: 'client-id',
        },
      },
      assignments: {
        'github:nbonamy/codex-claw#12': {
          provider: 'github',
          itemId: 'nbonamy/codex-claw#12',
          agentId: 'agent-dina',
          assignedAt: '2026-06-09T13:00:00.000Z',
          policy: 'complete',
          status: 'completed',
          completedAt: '2026-06-09T13:30:00.000Z',
          loopId: 'loop-bugs',
          loopExecutionId: 'loop-exec-1',
          completionInstructionsDeliveredAt: '2026-06-09T13:20:00.000Z',
        },
      },
    });
    expect(JSON.stringify(persisted)).not.toContain('accessToken');
    expect(JSON.stringify(persisted)).not.toContain('encryptedAccessToken');

    const restored = snapshotFromPersistedState(persisted);
    expect(restored.workBacklog).toStrictEqual(snapshot.workBacklog);
  });

  it('persists remote backend connections', () => {
    const snapshot = createInitialSnapshot();
    snapshot.remoteConnections.connections = [{
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      hostName: 'devbox.internal',
      user: 'nicolas',
      port: 2222,
      status: 'ready',
      detail: 'Ready (clawd 0.1.0)',
      sourceFolderPath: '~/src',
      transport: {
        type: 'ssh-stdio',
        command: 'ssh',
        args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
      },
      installedAt: '2026-06-14T10:00:00.000Z',
      lastCheckedAt: '2026-06-14T10:00:00.000Z',
      createdAt: '2026-06-14T09:59:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];

    const persisted = persistedStateFromSnapshot(snapshot);
    const restored = snapshotFromPersistedState(persisted);

    expect(persisted.remoteConnections).toStrictEqual(snapshot.remoteConnections);
    expect(restored.remoteConnections).toStrictEqual(snapshot.remoteConnections);
  });

  it('drops every work assignment when none of its assigned agents exist', () => {
    const restored = snapshotFromPersistedState({
      teams: [],
      agents: [],
      bench: [],
      activeTeamId: null,
      activeAgentId: null,
      theme: defaultThemeSettings,
      workBacklog: {
        connections: [],
        providerConfigurations: {},
        providerSettings: {},
        assignments: {
          'github:nbonamy/codex-claw#12': {
            provider: 'github',
            itemId: 'nbonamy/codex-claw#12',
            agentId: 'agent-closed',
            assignedAt: '2026-06-09T13:00:00.000Z',
            status: 'completed',
            completedAt: '2026-06-09T13:30:00.000Z',
          },
          'github:nbonamy/codex-claw#13': {
            provider: 'github',
            itemId: 'nbonamy/codex-claw#13',
            agentId: 'agent-working-gone',
            assignedAt: '2026-06-09T13:00:00.000Z',
            status: 'working',
          },
        },
      },
    });

    expect(restored.workBacklog.assignments).toStrictEqual({});
  });

  it('persists and restores loops', () => {
    const snapshot = createInitialSnapshot();
    snapshot.loops = [{
      id: 'loop-bugs',
      name: 'GitHub bugs',
      enabled: true,
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
          mode: 'dedicated',
        },
        cleanup: {
          deleteTeam: true,
        },
      },
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:01:00.000Z',
      lastRunAt: '2026-06-09T10:02:00.000Z',
      lastCreatedCount: 1,
      instructions: {
        assignment: 'Start by reproducing the issue.',
        beforeCompletion: 'Remove the bug tag before completing.',
      },
      executionLog: [{
        id: 'loop-exec-1',
        loopId: 'loop-bugs',
        startedAt: '2026-06-09T10:02:00.000Z',
        completedAt: '2026-06-09T10:03:00.000Z',
        status: 'completed',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-dina',
          agentName: 'Dina',
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
          conversationRef: { backend: 'codex', threadId: 'thread-dina' },
        }],
      }, {
        id: 'loop-exec-2',
        loopId: 'loop-bugs',
        startedAt: '2026-06-09T10:04:00.000Z',
        status: 'working',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-jesse',
          agentName: 'Jesse',
          workItemId: 'github:nbonamy/codex-claw#13',
          workItemTitle: 'Fix loop timestamps',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/13',
        }],
      }],
    }];

    const persisted = persistedStateFromSnapshot(snapshot);
    const restored = snapshotFromPersistedState(persisted);

    expect(persisted.loops).toStrictEqual(snapshot.loops);
    expect(restored.loops).toStrictEqual(snapshot.loops);

    const legacyPersisted = JSON.parse(JSON.stringify(persisted)) as Record<string, unknown>;
    legacyPersisted.loops = [{
      ...snapshot.loops[0],
      processedWorkItemIds: ['github:nbonamy/codex-claw#12'],
    }];
    expect(snapshotFromPersistedState(legacyPersisted).loops[0]).not.toHaveProperty('processedWorkItemIds');
  });

  it('sanitizes invalid work integration metadata', () => {
    const restored = snapshotFromPersistedState({
      teams: [],
      agents: [],
      bench: [],
      activeTeamId: null,
      activeAgentId: null,
      theme: defaultThemeSettings,
      workBacklog: {
        connections: [
          { provider: 'github', status: 'connected', accountLabel: 'nbonamy' },
          { provider: 'jira', status: 'connected', accountLabel: 'example' },
          { provider: 'github', status: 'done' },
        ],
        providerConfigurations: {
          github: {
            repositoryId: ' nbonamy/codex-claw ',
            assigneeLogin: ' nbonamy ',
            tagName: ' bug ',
          },
          jira: {
            repositoryId: 'TEAM-1',
          },
        },
        providerSettings: {
          github: { oauthClientId: ' client-id ' },
          jira: { oauthClientId: 'jira-client-id' },
        },
        assignments: {
          'github:nbonamy/codex-claw#12': {
            provider: 'github',
            itemId: 'nbonamy/codex-claw#12',
            agentId: 'missing-agent',
            assignedAt: '2026-06-09T13:00:00.000Z',
          },
          'jira:TEAM-1': {
            provider: 'jira',
            itemId: 'TEAM-1',
            agentId: 'missing-agent',
            assignedAt: '2026-06-09T13:00:00.000Z',
          },
        },
      },
    });

    expect(restored.workBacklog).toStrictEqual({
      connections: [{
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
      }],
      providerConfigurations: {
        github: {
          repositoryId: 'nbonamy/codex-claw',
          assigneeLogin: 'nbonamy',
          tagName: 'bug',
        },
      },
      providerSettings: {
        github: {
          oauthClientId: 'client-id',
        },
      },
      assignments: {},
    });
  });

  it('drops invalid persisted plan state', () => {
    const restored = snapshotFromPersistedState({
      teams: [{ id: 'team-codex-claw', name: 'Codex Claw', agentIds: ['agent-dina'] }],
      agents: [{
        id: 'agent-dina',
        teamId: 'team-codex-claw',
        name: 'Dina',
        folder: '~/src/codex-claw',
        backend: 'codex',
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        plan: {
          threadId: 'thread-dina',
          turnId: 'turn-plan',
          explanation: 'Current plan',
          steps: [{ step: 'Inspect composer', status: 'done' }],
          markdown: 'Current plan',
          updatedAt: '2026-06-05T10:11:12.000Z',
        },
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      }],
      bench: [],
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-dina',
      theme: defaultThemeSettings,
    });

    expect(restored.agents[0].plan).toMatchObject({
      kind: 'execution',
      status: 'incomplete',
      steps: [],
    });
  });

  it('drops invalid persisted context usage', () => {
    const restored = snapshotFromPersistedState({
      teams: [{ id: 'team-codex-claw', name: 'Codex Claw', agentIds: ['agent-dina'] }],
      agents: [{
        id: 'agent-dina',
        teamId: 'team-codex-claw',
        name: 'Dina',
        folder: '~/src/codex-claw',
        backend: 'codex',
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        contextUsage: {
          totalTokens: 1200,
          inputTokens: 900,
          cachedInputTokens: 100,
          outputTokens: 300,
          reasoningOutputTokens: 80,
          lastTotalTokens: 300,
          modelContextWindow: '10000',
          usedPercent: 12,
        },
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      }],
      bench: [],
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-dina',
      theme: defaultThemeSettings,
    });

    expect(restored.agents[0].contextUsage).toBeUndefined();
  });

  it('drops backend sessions and defaults that do not match the agent backend', () => {
    const restored = snapshotFromPersistedState({
      teams: [{ id: 'team-codex-claw', name: 'Codex Claw', agentIds: ['agent-dina'] }],
      agents: [{
        id: 'agent-dina',
        teamId: 'team-codex-claw',
        name: 'Dina',
        folder: '~/src/codex-claw',
        backend: 'claude',
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        backendDefaults: { kind: 'codex', model: 'gpt-5.1-codex' },
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      }],
      bench: [],
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-dina',
      theme: defaultThemeSettings,
    });

    expect(restored.agents[0].backend).toBe('claude');
    expect(restored.agents[0].backendSession).toBeUndefined();
    expect(restored.agents[0].backendDefaults).toBeUndefined();
  });

  it('persists Claude thread and fallback model selections', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0] = {
      ...snapshot.agents[0],
      backend: 'claude',
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-1',
        transport: 'stdio',
        transcriptSessionId: 'claude-session-1',
        model: 'claude-sonnet-5',
        reasoningEffort: 'xhigh',
      },
      backendDefaults: {
        kind: 'claude',
        model: 'sonnet',
        reasoningEffort: 'high',
        permissionMode: 'acceptEdits',
      },
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.agents[0].backendSession).toStrictEqual(snapshot.agents[0].backendSession);
    expect(restored.agents[0].backendDefaults).toStrictEqual(snapshot.agents[0].backendDefaults);
  });

  it('repairs team membership and selected agent when persisted ids drift', async () => {
    const filePath = await tempStatePath();
    await writeFile(filePath, JSON.stringify({
      teams: [{ id: 'team-codex-claw', name: 'Codex Claw', agentIds: [] }],
      agents: [{ id: 'agent-jules', teamId: 'team-codex-claw', name: 'Jules', folder: '/tmp/jules', createdAt: 'now', updatedAt: 'now' }],
      bench: [],
      activeTeamId: 'missing-team',
      activeAgentId: 'missing-agent',
      theme: defaultThemeSettings,
    }), 'utf8');

    const restored = await new AppStatePersistence(filePath).load();

    expect(restored.activeAgentId).toBe('agent-jules');
    expect(restored.activeTeamId).toBe('team-codex-claw');
    expect(restored.teams[0].color).toBe('#1B4FB2');
    expect(restored.teams[0].agentIds).toStrictEqual(['agent-jules']);
  });

  it('persists and restores normalized appearance settings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.theme = {
      id: 'github-dark',
      mode: 'dark',
      uiFontSize: 15,
      chatFontSize: 17,
      codeFontSize: 14,
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.theme).toStrictEqual(snapshot.theme);
  });

  it('persists and restores normalized general settings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.general = {
      preventSleepWhenAgentsRun: false,
      preventSleepWhenRemoteAccessEnabled: true,
      codexBinaryPath: '/opt/homebrew/bin/codex',
      claudeCodeEnabled: true,
      agentListCompact: true,
      shareCodexSkillsAndPlugins: false,
      repositoryIcons: { '/src/codex-claw': '🦞' },
      appshots: {
        hotkey: 'option',
        destination: 'active-agent',
        playSound: false,
      },
      plugins: { ...defaultPluginSettings },
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.general).toStrictEqual(snapshot.general);
  });

  it('persists and restores source folder settings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder = {
      path: '~/src',
      initialized: true,
      recentRepoNames: ['codex-claw', 'skwad'],
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.sourceFolder).toStrictEqual(snapshot.sourceFolder);
  });

  it('drops persisted work assignments whose local agent no longer exists', () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-14T10:00:00.000Z',
        policy: 'review',
        status: 'inProgress',
      },
      'github:nbonamy/codex-claw#13': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#13',
        agentId: 'agent-closed',
        assignedAt: '2026-06-14T11:00:00.000Z',
        policy: 'review',
        status: 'completed',
      },
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.workBacklog.assignments).toStrictEqual({
      'github:nbonamy/codex-claw#12': snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12'],
    });
  });

  it('restores remote teams as pointer-only state when the connection exists', () => {
    const snapshot = createInitialSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';
    snapshot.teams[0].remoteTeamId = 'team-remote';
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-14T10:00:00.000Z',
        policy: 'review',
        status: 'inProgress',
      },
    };

    const restored = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));

    expect(restored.teams[0].remoteConnectionId).toBe('connection-devbox');
    expect(restored.teams[0].remoteTeamId).toBe('team-remote');
    expect(restored.teams[0].agentIds).toStrictEqual([]);
    expect(restored.teams[0].activeAgentId).toBeUndefined();
    expect(restored.agents).toStrictEqual([]);
    expect(restored.activeAgentId).toBeNull();
    expect(restored.workBacklog.assignments).toStrictEqual({});
  });

  it('does not treat a remote team id collision as local team membership', () => {
    const restored = snapshotFromPersistedState({
      teams: [
        {
          id: 'team-remote-pointer',
          name: 'Remote Pointer',
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-codex-claw',
          agentIds: ['agent-stale-remote'],
          activeAgentId: 'agent-stale-remote',
        },
        {
          id: 'team-codex-claw',
          name: 'Local',
          agentIds: ['agent-local'],
          activeAgentId: 'agent-local',
        },
      ],
      agents: [
        {
          id: 'agent-stale-remote',
          teamId: 'team-remote-pointer',
          name: 'Stale Remote',
          folder: '/home/nicolas/src/remote',
          backend: 'codex',
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        },
        {
          id: 'agent-local',
          teamId: 'team-codex-claw',
          name: 'Local',
          folder: '/Users/nicolas/src/local',
          backend: 'codex',
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        },
      ],
      bench: [],
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-local',
      remoteConnections: { connections: [readyRemoteConnection()] },
      theme: defaultThemeSettings,
    });

    expect(restored.teams.find((team) => team.id === 'team-remote-pointer')?.agentIds).toStrictEqual([]);
    expect(restored.teams.find((team) => team.id === 'team-codex-claw')?.agentIds).toStrictEqual(['agent-local']);
    expect(restored.agents.map((agent) => agent.id)).toStrictEqual(['agent-local']);
    expect(restored.activeTeamId).toBe('team-codex-claw');
    expect(restored.activeAgentId).toBe('agent-local');
  });

  it('repairs orphaned local agents to a local team instead of a remote pointer', () => {
    const restored = snapshotFromPersistedState({
      teams: [
        {
          id: 'team-remote-pointer',
          name: 'Remote Pointer',
          remoteConnectionId: 'connection-devbox',
          remoteTeamId: 'team-remote',
          agentIds: [],
        },
        {
          id: 'team-local',
          name: 'Local',
          agentIds: [],
        },
      ],
      agents: [{
        id: 'agent-orphan',
        teamId: 'team-missing',
        name: 'Orphan',
        folder: '/Users/nicolas/src/local',
        backend: 'codex',
        createdAt: '2026-06-14T10:00:00.000Z',
        updatedAt: '2026-06-14T10:00:00.000Z',
      }],
      bench: [],
      activeTeamId: 'team-local',
      activeAgentId: 'agent-orphan',
      remoteConnections: { connections: [readyRemoteConnection()] },
      theme: defaultThemeSettings,
    });

    expect(restored.teams.find((team) => team.id === 'team-remote-pointer')?.agentIds).toStrictEqual([]);
    expect(restored.teams.find((team) => team.id === 'team-local')?.agentIds).toStrictEqual(['agent-orphan']);
    expect(restored.agents[0].teamId).toBe('team-local');
    expect(restored.activeTeamId).toBe('team-local');
    expect(restored.activeAgentId).toBe('agent-orphan');
  });

  it('drops remote team connection ids when the connection is missing', () => {
    const restored = snapshotFromPersistedState({
      teams: [{
        id: 'team-remote',
        name: 'Remote',
        remoteConnectionId: 'missing-connection',
        remoteTeamId: 'team-remote',
        agentIds: ['agent-remote'],
      }],
      agents: [{
        id: 'agent-remote',
        name: 'Remote',
        folder: '/home/nicolas/src/codex-claw',
        backend: 'codex',
        createdAt: '2026-06-14T10:00:00.000Z',
        updatedAt: '2026-06-14T10:00:00.000Z',
      }],
      bench: [],
      activeTeamId: null,
      activeAgentId: 'agent-remote',
      theme: defaultThemeSettings,
      remoteConnections: { connections: [] },
    });

    expect(restored.teams[0].remoteConnectionId).toBeUndefined();
    expect(restored.teams[0].remoteTeamId).toBeUndefined();
  });

  it('sanitizes invalid source folder settings', () => {
    const restored = snapshotFromPersistedState({
      teams: [],
      agents: [],
      bench: [],
      activeTeamId: null,
      activeAgentId: null,
      theme: defaultThemeSettings,
      sourceFolder: {
        path: 42,
        initialized: 'yes',
        recentRepoNames: [' codex-claw ', '', 12, 'skwad', 'codex-claw'],
      },
    });

    expect(restored.sourceFolder).toStrictEqual({
      path: '',
      initialized: false,
      recentRepoNames: ['codex-claw', 'skwad'],
    });
  });
});

async function tempStatePath(): Promise<string> {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-state-'));
  return path.join(tempDir, 'state.json');
}

function readyRemoteConnection(): RemoteConnection {
  return {
    id: 'connection-devbox',
    kind: 'ssh' as const,
    name: 'devbox',
    host: 'devbox',
    status: 'ready' as const,
    transport: {
      type: 'ssh-stdio' as const,
      command: 'ssh',
      args: ['devbox', 'node ~/.codex-claw/clawd.mjs --stdio'],
    },
    createdAt: '2026-06-14T10:00:00.000Z',
    updatedAt: '2026-06-14T10:00:00.000Z',
  };
}
