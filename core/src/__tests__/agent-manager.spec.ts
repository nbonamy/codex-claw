import { describe, expect, it } from 'vitest';
import {
  assignWorkItemToAgentInSnapshot,
  closeAgentInSnapshot,
  completeWorkItemAssignmentInSnapshot,
  duplicateAgentInSnapshot,
  forkAgentInSnapshot,
  moveAgentToTeamInSnapshot,
  removeWorkItemAssignmentFromSnapshot,
  reorderAgentInTeam,
  reorderRepositoryInTeam,
  restartAgentConversation,
  resumeAgentConversationInSnapshot,
  updateWorkItemAssignmentInSnapshot,
  updateAgentFromInput,
} from '../agent-manager';
import { createInitialSnapshot } from '../snapshot';
import { createTeamInSnapshot } from '../team-manager';
import type { Agent, WorkItem } from '../contracts';
import { workItemAssignmentKey } from '../work-assignments';

describe('agent-manager', () => {
  it('switches a fresh agent without carrying model or permission settings across providers', () => {
    const snapshot = createInitialSnapshot();
    snapshot.general.claudeCodeEnabled = true;
    const agent = snapshot.agents[0]!;
    delete agent.backendSession;
    agent.status = { type: 'idle' };
    agent.backendDefaults = { kind: 'codex', model: 'codex-model', approvalPreset: 'full-access', userSelectedModel: true };
    updateAgentFromInput(snapshot, { id: agent.id, backend: 'claude' });
    expect(agent.backend).toBe('claude');
    expect(agent.backendDefaults).toStrictEqual({ kind: 'claude' });
    agent.status = { type: 'working' };
    expect(() => updateAgentFromInput(snapshot, { id: agent.id, backend: 'codex' })).toThrow('before the first prompt');
    agent.status = { type: 'idle' };
    agent.backendSession = { kind: 'claude', sessionId: 'history', transport: 'stdio' };
    expect(() => updateAgentFromInput(snapshot, { id: agent.id, backend: 'codex' })).toThrow('before the first prompt');
    delete agent.backendSession;
    updateAgentFromInput(snapshot, { id: agent.id, backend: 'codex' });
    agent.hasSubmittedPrompt = true;
    expect(() => updateAgentFromInput(snapshot, { id: agent.id, backend: 'claude' })).toThrow('before the first prompt');
    delete agent.hasSubmittedPrompt;
    snapshot.general.claudeCodeEnabled = false;
    expect(() => updateAgentFromInput(snapshot, { id: agent.id, backend: 'claude' })).toThrow('not enabled');
    expect(agent.backend).toBe('codex');
  });
  it('duplicates an agent in the same team and selects the copy', () => {
    const snapshot = createInitialSnapshot();
    const duplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => 'agent-duplicate-dina');

    expect(duplicate).toStrictEqual({
      id: 'agent-duplicate-dina',
      teamId: 'team-codex-claw',
      name: 'Dina (copy)',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.activeAgentId).toBe(duplicate?.id);
    expect(snapshot.teams[0].agentIds.slice(0, 2)).toStrictEqual(['agent-dina', duplicate?.id]);
    expect(snapshot.agents.slice(0, 2).map((agent) => agent.id)).toStrictEqual(['agent-dina', duplicate?.id]);
  });

  it('duplicates an agent without changing the active agent when selection is disabled', () => {
    const snapshot = createInitialSnapshot();
    const activeAgentId = snapshot.activeAgentId;
    const duplicate = duplicateAgentInSnapshot(
      snapshot,
      'agent-dina',
      '2026-06-05T10:11:12.000Z',
      () => 'agent-background-copy',
      { select: false },
    );

    expect(duplicate?.id).toBe('agent-background-copy');
    expect(snapshot.activeAgentId).toBe(activeAgentId);
    expect(snapshot.teams[0].agentIds.slice(0, 2)).toStrictEqual(['agent-dina', 'agent-background-copy']);
  });

  it('duplicates an agent with a caller-provided name', () => {
    const snapshot = createInitialSnapshot();
    const duplicate = duplicateAgentInSnapshot(
      snapshot,
      'agent-dina',
      '2026-06-05T10:11:12.000Z',
      () => 'agent-work-item',
      { name: '  Dina gh-24  ', select: false },
    );

    expect(duplicate?.name).toBe('Dina gh-24');
    expect(snapshot.activeAgentId).toBe('agent-dina');
  });

  it('generates collision-safe ids for duplicated agents', () => {
    const snapshot = createInitialSnapshot();

    const duplicateIds = ['agent-duplicate-dina', 'agent-duplicate-dina', 'agent-duplicate-dina-2'];
    const firstDuplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => duplicateIds.shift() ?? 'agent-fallback');
    const secondDuplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => duplicateIds.shift() ?? 'agent-fallback');
    expect(firstDuplicate?.id).toBe('agent-duplicate-dina');
    expect(secondDuplicate?.id).toBe('agent-duplicate-dina-2');
  });

  it('forks an agent conversation directly below its source and selects it', () => {
    const snapshot = createInitialSnapshot();
    const forked = forkAgentInSnapshot(
      snapshot,
      'agent-dina',
      { kind: 'codex', threadId: 'thread-forked' },
      '2026-06-05T10:11:12.000Z',
      () => 'agent-forked-dina',
    );

    expect(forked).toMatchObject({
      id: 'agent-forked-dina',
      name: 'Dina (fork)',
      backendSession: { kind: 'codex', threadId: 'thread-forked' },
      status: { type: 'idle' },
    });
    expect(snapshot.teams[0].agentIds.slice(0, 2)).toStrictEqual(['agent-dina', 'agent-forked-dina']);
    expect(snapshot.agents.slice(0, 2).map((agent) => agent.id)).toStrictEqual(['agent-dina', 'agent-forked-dina']);
    expect(snapshot.activeAgentId).toBe('agent-forked-dina');
  });

  it('duplicates legacy agents into the active team when they have no team id', () => {
    const snapshot = createInitialSnapshot();
    delete snapshot.agents[0].teamId;

    const duplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => 'agent-duplicate-dina');

    expect(duplicate?.teamId).toBe('team-codex-claw');
    expect(snapshot.teams[0].agentIds).toContain(duplicate?.id);
  });

  it('assigns each work item key to one agent at a time', () => {
    const snapshot = createInitialSnapshot();
    const firstItem = workItem(12, 'Fix cockpit drag target');
    const secondItem = workItem(13, 'Polish backlog panel');

    expect(assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', firstItem, '2026-06-09T13:00:00.000Z')).toMatchObject({
      id: 'agent-dina',
      updatedAt: '2026-06-09T13:00:00.000Z',
    });
    expect(snapshot.workBacklog.assignments[workItemAssignmentKey(firstItem)]).toStrictEqual({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#12',
      agentId: 'agent-dina',
      assignedAt: '2026-06-09T13:00:00.000Z',
      policy: 'review',
      status: 'inProgress',
    });

    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', secondItem, '2026-06-09T13:05:00.000Z');
    expect(Object.keys(snapshot.workBacklog.assignments).sort()).toStrictEqual([
      'github:nbonamy/codex-claw#12',
      'github:nbonamy/codex-claw#13',
    ]);

    assignWorkItemToAgentInSnapshot(snapshot, 'agent-jesse', firstItem, '2026-06-09T13:10:00.000Z');

    expect(snapshot.workBacklog.assignments[workItemAssignmentKey(firstItem)]).toStrictEqual({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#12',
      agentId: 'agent-jesse',
      assignedAt: '2026-06-09T13:10:00.000Z',
      policy: 'review',
      status: 'inProgress',
    });
  });

  it('marks assigned work items as completed by the owning agent', () => {
    const snapshot = createInitialSnapshot();
    const item = workItem(12, 'Fix cockpit drag target');
    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', item, '2026-06-09T13:00:00.000Z');

    expect(completeWorkItemAssignmentInSnapshot(snapshot, 'agent-jesse', workItemAssignmentKey(item), '2026-06-09T13:15:00.000Z')).toBeNull();
    expect(completeWorkItemAssignmentInSnapshot(snapshot, 'agent-dina', workItemAssignmentKey(item), '2026-06-09T13:15:00.000Z')).toStrictEqual({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#12',
      agentId: 'agent-dina',
      assignedAt: '2026-06-09T13:00:00.000Z',
      policy: 'review',
      status: 'completed',
      completedAt: '2026-06-09T13:15:00.000Z',
      updatedAt: '2026-06-09T13:15:00.000Z',
    });
    expect(snapshot.agents[0].updatedAt).toBe('2026-06-09T13:15:00.000Z');
  });

  it('updates assigned work through blocked, resumed, and review-ready states', () => {
    const snapshot = createInitialSnapshot();
    const item = workItem(12, 'Fix cockpit drag target');
    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', item, '2026-06-09T13:00:00.000Z');
    const workItemId = workItemAssignmentKey(item);

    expect(updateWorkItemAssignmentInSnapshot(snapshot, 'agent-dina', workItemId, 'blocked', '2026-06-09T13:05:00.000Z', 'Need a fixture')).toMatchObject({
      status: 'blocked',
      note: 'Need a fixture',
      updatedAt: '2026-06-09T13:05:00.000Z',
    });
    expect(updateWorkItemAssignmentInSnapshot(snapshot, 'agent-dina', workItemId, 'inProgress', '2026-06-09T13:10:00.000Z')).toMatchObject({
      status: 'inProgress',
    });
    expect(snapshot.workBacklog.assignments[workItemId]).not.toHaveProperty('note');
    expect(updateWorkItemAssignmentInSnapshot(snapshot, 'agent-dina', workItemId, 'readyForReview', '2026-06-09T13:20:00.000Z')).toMatchObject({
      status: 'readyForReview',
      updatedAt: '2026-06-09T13:20:00.000Z',
    });
  });

  it('removes assigned work item keys', () => {
    const snapshot = createInitialSnapshot();
    const firstItem = workItem(12, 'Fix cockpit drag target');
    const secondItem = workItem(13, 'Polish backlog panel');

    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', firstItem, '2026-06-09T13:00:00.000Z');
    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', secondItem, '2026-06-09T13:05:00.000Z');

    expect(removeWorkItemAssignmentFromSnapshot(snapshot, firstItem)).toBe(true);

    expect(snapshot.workBacklog.assignments).toStrictEqual({
      'github:nbonamy/codex-claw#13': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#13',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:05:00.000Z',
        policy: 'review',
        status: 'inProgress',
      },
    });
    expect(removeWorkItemAssignmentFromSnapshot(snapshot, secondItem)).toBe(true);
    expect(snapshot.workBacklog.assignments).toStrictEqual({});
    expect(removeWorkItemAssignmentFromSnapshot(snapshot, firstItem)).toBe(false);
  });

  it.each([
    { type: 'idle' },
    { type: 'working' },
    { type: 'awaitingInput' },
    { type: 'error', message: 'Turn failed' },
  ] satisfies Agent['status'][])('moves a $type agent to another team without changing its session or runtime state', (status) => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = status;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-running' };
    const before = structuredClone(snapshot.agents[0]);
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });

    expect(moveAgentToTeamInSnapshot(snapshot, 'agent-dina', 'team-skwad', '2026-06-05T10:11:12.000Z')).toStrictEqual({
      ...before,
      teamId: 'team-skwad',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-jesse']);
    expect(snapshot.teams[1].agentIds).toStrictEqual(['agent-dina']);
    expect(snapshot.teams[1].activeAgentId).toBe('agent-dina');
    expect(snapshot.activeTeamId).toBe('team-skwad');
    expect(snapshot.activeAgentId).toBe('agent-dina');
  });

  it('reorders agents within a team before a target or to the end', () => {
    const snapshot = createInitialSnapshot();
    const duplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => 'agent-abby');
    expect(duplicate?.id).toBe('agent-abby');
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-dina', 'agent-abby', 'agent-jesse']);

    expect(reorderAgentInTeam(snapshot, 'team-codex-claw', 'agent-abby', 'agent-dina')).toStrictEqual(duplicate);
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-abby', 'agent-dina', 'agent-jesse']);

    expect(reorderAgentInTeam(snapshot, 'team-codex-claw', 'agent-abby', null)).toStrictEqual(duplicate);
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-dina', 'agent-jesse', 'agent-abby']);
    expect(snapshot.activeAgentId).toBe('agent-abby');
  });

  it('keeps agent order unchanged when dropping an agent onto itself', () => {
    const snapshot = createInitialSnapshot();

    expect(reorderAgentInTeam(snapshot, 'team-codex-claw', 'agent-dina', 'agent-dina')).toStrictEqual(snapshot.agents[0]);
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-dina', 'agent-jesse']);
  });

  it('ignores agent reorders outside the requested team', () => {
    const snapshot = createInitialSnapshot();
    const otherTeam = createTeamInSnapshot(snapshot, {
      name: 'Skwad Core',
      color: '#46A857',
    }, '2026-06-05T10:11:12.000Z');

    expect(reorderAgentInTeam(snapshot, otherTeam.id, 'agent-dina', null)).toBeNull();
    expect(reorderAgentInTeam(snapshot, 'team-codex-claw', 'agent-dina', 'missing-agent')).toBeNull();
    expect(reorderAgentInTeam(snapshot, 'missing-team', 'agent-dina', null)).toBeNull();
    expect(reorderAgentInTeam(snapshot, 'team-codex-claw', 'missing-agent', null)).toBeNull();
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-dina', 'agent-jesse']);
  });

  it('keeps agent reorders inside their repository group', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.workspace = gitWorkspace('claw');
    snapshot.agents[1]!.workspace = gitWorkspace('sdk');
    const duplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => 'agent-abby');

    expect(reorderAgentInTeam(snapshot, 'team-codex-claw', duplicate!.id, 'agent-jesse')).toBeNull();
    expect(snapshot.teams[0]!.agentIds).toStrictEqual(['agent-dina', 'agent-abby', 'agent-jesse']);

    expect(reorderAgentInTeam(snapshot, 'team-codex-claw', 'agent-dina', null)).toStrictEqual(snapshot.agents[0]);
    expect(snapshot.teams[0]!.agentIds).toStrictEqual(['agent-abby', 'agent-dina', 'agent-jesse']);
  });

  it('reorders a repository as one block with all of its agents', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.workspace = gitWorkspace('claw');
    snapshot.agents[1]!.workspace = gitWorkspace('sdk');
    duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => 'agent-abby');
    const quickChat = duplicateAgentInSnapshot(snapshot, 'agent-jesse', '2026-06-05T10:11:13.000Z', () => 'quick-chat');
    quickChat!.sessionKind = 'quickChat';
    delete quickChat!.workspace;
    snapshot.teams[0]!.agentIds = ['agent-dina', 'agent-abby', 'quick-chat', 'agent-jesse'];

    expect(reorderRepositoryInTeam(snapshot, 'team-codex-claw', '/src/sdk', '/src/claw')?.map((agent) => agent.id))
      .toStrictEqual(['agent-jesse']);
    expect(snapshot.teams[0]!.agentIds).toStrictEqual(['agent-jesse', 'quick-chat', 'agent-dina', 'agent-abby']);

    expect(reorderRepositoryInTeam(snapshot, 'team-codex-claw', '/src/sdk', null)?.map((agent) => agent.id))
      .toStrictEqual(['agent-jesse']);
    expect(snapshot.teams[0]!.agentIds).toStrictEqual(['agent-dina', 'agent-abby', 'quick-chat', 'agent-jesse']);
    expect(reorderRepositoryInTeam(snapshot, 'team-codex-claw', '/src/missing', null)).toBeNull();
  });

  it('restarts an idle agent by clearing conversation and runtime state', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.backendSession = { kind: 'codex', threadId: 'thread-old' };
    agent.contextUsage = {
      totalTokens: 397_740,
      inputTokens: 320_000,
      cachedInputTokens: 80_000,
      outputTokens: 72_000,
      reasoningOutputTokens: 24_000,
      lastTotalTokens: 64_600,
      modelContextWindow: 258_400,
      usedPercent: 25,
    };
    agent.plan = {
      threadId: 'thread-old',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Old plan',
      steps: [{ step: 'Do old work', status: 'pending' }],
      markdown: 'Old plan\n- [ ] Do old work',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    agent.goal = {
      threadId: 'thread-old',
      objective: 'Old goal',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 100,
      timeUsedSeconds: 5,
      createdAt: 1,
      updatedAt: 2,
    };
    agent.isRegistered = true;
    agent.mcpSessionId = 'mcp-session';
    agent.statusText = 'Registered';
    agent.visualize = {
      id: 'visualize-old', conversationRef: { backend: 'codex', threadId: 'thread-old' }, isOpen: true,
      suggestions: [], visualizations: [], selectedVisualizationId: null,
      createdAt: '2026-06-05T00:00:00.000Z', updatedAt: '2026-06-05T00:00:00.000Z',
    };

    expect(restartAgentConversation(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z')).toMatchObject({
      id: 'agent-dina',
      status: { type: 'idle' },
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.agents[0].backendSession).toBeUndefined();
    expect(snapshot.agents[0].contextUsage).toBeUndefined();
    expect(snapshot.agents[0].plan).toBeUndefined();
    expect(snapshot.agents[0].goal).toBeUndefined();
    expect(snapshot.agents[0].isRegistered).toBeUndefined();
    expect(snapshot.agents[0].mcpSessionId).toBeUndefined();
    expect(snapshot.agents[0].statusText).toBeUndefined();
    expect(snapshot.agents[0].visualize).toBeUndefined();
  });

  it('resumes an idle agent with the selected provider session', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.backendSession = { kind: 'codex', threadId: 'thread-old' };
    agent.contextUsage = {
      totalTokens: 397_740,
      inputTokens: 320_000,
      cachedInputTokens: 80_000,
      outputTokens: 72_000,
      reasoningOutputTokens: 24_000,
      lastTotalTokens: 64_600,
      modelContextWindow: 258_400,
      usedPercent: 25,
    };
    agent.plan = {
      threadId: 'thread-old',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Old plan',
      steps: [{ step: 'Do old work', status: 'pending' }],
      markdown: 'Old plan\n- [ ] Do old work',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    agent.isRegistered = true;
    expect(resumeAgentConversationInSnapshot(snapshot, 'agent-dina', { kind: 'codex', threadId: 'thread-new' }, '2026-06-05T10:11:12.000Z')).toMatchObject({
      id: 'agent-dina',
      backendSession: { kind: 'codex', threadId: 'thread-new' },
      status: { type: 'idle' },
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.agents[0].contextUsage).toBeUndefined();
    expect(snapshot.agents[0].plan).toBeUndefined();
    expect(snapshot.agents[0].isRegistered).toBeUndefined();
  });

  it('closes an idle agent and selects the next available agent', () => {
    const snapshot = createInitialSnapshot();
    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', workItem(12, 'Fix cockpit drag target'));

    expect(closeAgentInSnapshot(snapshot, 'agent-dina')).toMatchObject({ id: 'agent-dina' });

    expect(snapshot.agents.map((agent) => agent.id)).toStrictEqual(['agent-jesse']);
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-jesse']);
    expect(snapshot.activeAgentId).toBe('agent-jesse');
    expect(snapshot.workBacklog.assignments).toStrictEqual({});
  });

  it('closes the last active team agent without selecting another team agent', () => {
    const snapshot = createInitialSnapshot();
    const otherTeam = createTeamInSnapshot(snapshot, {
      name: 'Skwad Core',
      color: '#46A857',
    }, '2026-06-05T10:11:12.000Z');
    moveAgentToTeamInSnapshot(snapshot, 'agent-jesse', otherTeam.id);
    snapshot.activeTeamId = 'team-codex-claw';
    snapshot.activeAgentId = 'agent-dina';
    snapshot.teams[0].activeAgentId = 'agent-dina';

    expect(closeAgentInSnapshot(snapshot, 'agent-dina')).toMatchObject({ id: 'agent-dina' });

    expect(snapshot.teams[0].agentIds).toStrictEqual([]);
    expect(snapshot.teams[0].activeAgentId).toBeUndefined();
    expect(snapshot.teams[1].agentIds).toStrictEqual(['agent-jesse']);
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.activeAgentId).toBeNull();
  });

  it('closes a non-active idle agent without changing active selection', () => {
    const snapshot = createInitialSnapshot();

    expect(closeAgentInSnapshot(snapshot, 'agent-jesse')).toMatchObject({ id: 'agent-jesse' });

    expect(snapshot.activeAgentId).toBe('agent-dina');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-dina']);
  });

  it('rejects restart and resume while an agent is busy but still allows close', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    expect(() => restartAgentConversation(snapshot, 'agent-dina')).toThrow('Agent must be idle before restarting.');
    expect(() => resumeAgentConversationInSnapshot(snapshot, 'agent-dina', { kind: 'codex', threadId: 'thread-new' })).toThrow('Agent must be idle before resuming a conversation.');
    expect(closeAgentInSnapshot(snapshot, 'agent-dina')).toMatchObject({ id: 'agent-dina' });
    expect(snapshot.agents.map((agent) => agent.id)).toStrictEqual(['agent-jesse']);
  });

  it('returns null for missing agents', () => {
    const snapshot = createInitialSnapshot();

    expect(duplicateAgentInSnapshot(snapshot, 'missing-agent')).toBeNull();
    expect(moveAgentToTeamInSnapshot(snapshot, 'missing-agent', 'team-codex-claw')).toBeNull();
    expect(moveAgentToTeamInSnapshot(snapshot, 'agent-dina', 'missing-team')).toBeNull();
    expect(restartAgentConversation(snapshot, 'missing-agent')).toBeNull();
    expect(closeAgentInSnapshot(snapshot, 'missing-agent')).toBeNull();
    expect(assignWorkItemToAgentInSnapshot(snapshot, 'missing-agent', workItem(12, 'Fix cockpit drag target'))).toBeNull();
    expect(removeWorkItemAssignmentFromSnapshot(snapshot, workItem(12, 'Fix cockpit drag target'))).toBe(false);
  });
});

function workItem(number: number, title: string): WorkItem {
  return {
    provider: 'github',
    id: `nbonamy/codex-claw#${number}`,
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number,
    title,
    url: `https://github.com/nbonamy/codex-claw/issues/${number}`,
    state: 'open',
    labels: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function gitWorkspace(repository: string): Extract<Agent['workspace'], { kind: 'git' }> {
  return {
    kind: 'git',
    folder: `/src/${repository}`,
    repositoryName: repository,
    repositoryRoot: `/src/${repository}`,
    primaryWorktreeRoot: `/src/${repository}`,
    branch: 'main',
    isLinkedWorktree: false,
    updatedAt: '2026-06-05T00:00:00.000Z',
  };
}
