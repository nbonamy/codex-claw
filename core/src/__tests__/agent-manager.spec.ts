import { describe, expect, it } from 'vitest';
import {
  assignWorkItemToAgentInSnapshot,
  closeAgentInSnapshot,
  completeWorkItemAssignmentInSnapshot,
  deployBenchTemplateInSnapshot,
  deployBenchTemplateToSnapshot,
  duplicateAgentInSnapshot,
  forkAgentInSnapshot,
  moveAgentToTeamInSnapshot,
  removeBenchTemplateFromSnapshot,
  removeWorkItemAssignmentFromSnapshot,
  reorderAgentInTeam,
  restartAgentConversation,
  resumeAgentConversationInSnapshot,
  saveAgentToBench,
  saveBenchTemplateToSnapshot,
  updateWorkItemAssignmentInSnapshot,
} from '../agent-manager';
import { appendUserPrompt, createInitialSnapshot } from '../snapshot';
import { createTeamInSnapshot } from '../team-manager';
import type { WorkItem } from '../contracts';
import { workItemAssignmentKey } from '../work-assignments';

describe('agent-manager', () => {
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

  it('generates collision-safe ids for duplicated agents and bench templates', () => {
    const snapshot = createInitialSnapshot();

    const duplicateIds = ['agent-duplicate-dina', 'agent-duplicate-dina', 'agent-duplicate-dina-2'];
    const firstDuplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => duplicateIds.shift() ?? 'agent-fallback');
    const secondDuplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => duplicateIds.shift() ?? 'agent-fallback');
    const firstTemplate = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');
    const secondTemplate = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    expect(firstDuplicate?.id).toBe('agent-duplicate-dina');
    expect(secondDuplicate?.id).toBe('agent-duplicate-dina-2');
    expect(firstTemplate?.id).toBe('bench-dina-20260605t101112000z');
    expect(secondTemplate?.id).toBe('bench-dina-20260605t101112000z-2');
  });

  it('forks an agent conversation directly below its source and selects it', () => {
    const snapshot = createInitialSnapshot();
    const sourceMessage = appendUserPrompt(snapshot, 'agent-dina', 'fork this conversation');
    const forked = forkAgentInSnapshot(
      snapshot,
      'agent-dina',
      { kind: 'codex', threadId: 'thread-forked' },
      [{ ...sourceMessage, id: 'message-forked' }],
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
    expect(snapshot.messages.find((message) => message.id === 'message-forked')?.agentId).toBe('agent-forked-dina');
    expect(snapshot.activeAgentId).toBe('agent-forked-dina');
  });

  it('duplicates legacy agents into the active team when they have no team id', () => {
    const snapshot = createInitialSnapshot();
    delete snapshot.agents[0].teamId;

    const duplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z', () => 'agent-duplicate-dina');

    expect(duplicate?.teamId).toBe('team-codex-claw');
    expect(snapshot.teams[0].agentIds).toContain(duplicate?.id);
  });

  it('saves an agent to Bench without changing the active agent', () => {
    const snapshot = createInitialSnapshot();
    const template = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    expect(template).toStrictEqual({
      id: 'bench-dina-20260605t101112000z',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.bench).toStrictEqual([template]);
    expect(snapshot.activeAgentId).toBe('agent-dina');
  });

  it('deploys a Bench template as a fresh selected agent in the active team', () => {
    const snapshot = createInitialSnapshot();
    const template = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    const agent = deployBenchTemplateInSnapshot(snapshot, template?.id ?? '', undefined, '2026-06-05T10:12:13.000Z', () => 'agent-bench-dina');

    expect(agent).toStrictEqual({
      id: 'agent-bench-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:12:13.000Z',
      updatedAt: '2026-06-05T10:12:13.000Z',
    });
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.activeAgentId).toBe(agent?.id);
    expect(snapshot.teams[0].agentIds).toContain(agent?.id);
  });

  it('deploys the same Bench template multiple times with distinct agent ids', () => {
    const snapshot = createInitialSnapshot();
    const template = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    const firstAgent = deployBenchTemplateInSnapshot(snapshot, template?.id ?? '', undefined, '2026-06-05T10:12:13.000Z', () => 'agent-bench-dina-1');
    const secondAgent = deployBenchTemplateInSnapshot(snapshot, template?.id ?? '', undefined, '2026-06-05T10:12:13.000Z', () => 'agent-bench-dina-2');

    expect(firstAgent?.id).toBe('agent-bench-dina-1');
    expect(secondAgent?.id).toBe('agent-bench-dina-2');
    expect(snapshot.agents.filter((agent) => agent.name === 'Dina')).toHaveLength(3);
    expect(new Set(snapshot.agents.map((agent) => agent.id)).size).toBe(snapshot.agents.length);
  });

  it('supports non-selecting Bench deploys and completed assignments for removed agents', () => {
    const snapshot = createInitialSnapshot();
    const generatedDuplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina');
    const template = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');
    snapshot.activeTeamId = 'team-codex-claw';
    snapshot.activeAgentId = 'agent-dina';

    const deployed = deployBenchTemplateInSnapshot(snapshot, template?.id ?? '', undefined, '2026-06-05T10:12:13.000Z', () => 'agent-bench-dina', {
      select: false,
    });

    const item = workItem(12, 'Fix cockpit drag target');
    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', item, '2026-06-09T13:00:00.000Z');
    snapshot.agents = snapshot.agents.filter((agent) => agent.id !== 'agent-dina');

    expect(generatedDuplicate?.id.startsWith('agent-')).toBe(true);
    expect(deployed?.id).toBe('agent-bench-dina');
    expect(snapshot.activeAgentId).toBe('agent-dina');
    expect(completeWorkItemAssignmentInSnapshot(snapshot, 'agent-dina', workItemAssignmentKey(item), '2026-06-09T13:15:00.000Z')).toMatchObject({
      agentId: 'agent-dina',
      status: 'completed',
    });
  });

  it('deploys a Bench template into an explicit target team', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });
    const template = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    const agent = deployBenchTemplateInSnapshot(snapshot, template?.id ?? '', 'team-skwad', '2026-06-05T10:12:13.000Z', () => 'agent-bench-dina');

    expect(agent?.teamId).toBe('team-skwad');
    expect(snapshot.teams[1].agentIds).toStrictEqual([agent?.id]);
    expect(snapshot.teams[1].activeAgentId).toBe(agent?.id);
    expect(snapshot.activeTeamId).toBe('team-skwad');
    expect(snapshot.activeAgentId).toBe(agent?.id);
  });

  it('saves and deploys Bench template payloads without requiring a local Bench entry', () => {
    const snapshot = createInitialSnapshot();
    const template = saveBenchTemplateToSnapshot(snapshot, {
      name: ' Remote Dina ',
      folder: ' /home/nicolas/src/codex-claw ',
      backend: 'codex',
      backendDefaults: { kind: 'codex', model: 'gpt-5-codex' },
    }, '2026-06-05T10:11:12.000Z');
    const targetSnapshot = createInitialSnapshot();

    const agent = deployBenchTemplateToSnapshot(targetSnapshot, template, 'team-codex-claw', '2026-06-05T10:12:13.000Z', () => 'agent-remote-bench');

    expect(template).toMatchObject({
      id: 'bench-remote-dina-20260605t101112000z',
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    });
    expect(targetSnapshot.bench).toStrictEqual([]);
    expect(agent).toMatchObject({
      id: 'agent-remote-bench',
      teamId: 'team-codex-claw',
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
      backendDefaults: { kind: 'codex', model: 'gpt-5-codex' },
    });
  });

  it('removes a Bench template without touching active agents', () => {
    const snapshot = createInitialSnapshot();
    const template = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    expect(removeBenchTemplateFromSnapshot(snapshot, template?.id ?? '')).toStrictEqual(template);

    expect(snapshot.bench).toStrictEqual([]);
    expect(snapshot.agents.map((agent) => agent.id)).toStrictEqual(['agent-dina', 'agent-jesse']);
    expect(snapshot.activeAgentId).toBe('agent-dina');
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

  it('moves an idle agent to another team and selects it there', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      avatar: 'SK',
      color: '#46A857',
      agentIds: [],
    });

    expect(moveAgentToTeamInSnapshot(snapshot, 'agent-dina', 'team-skwad', '2026-06-05T10:11:12.000Z')).toMatchObject({
      id: 'agent-dina',
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
    appendUserPrompt(snapshot, 'agent-dina', 'old prompt');
    appendUserPrompt(snapshot, 'agent-jesse', 'keep prompt');

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
    expect(snapshot.messages.map((message) => message.agentId)).toStrictEqual(['agent-jesse']);
  });

  it('resumes an idle agent by replacing its messages and preserving the selected backend session', () => {
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
    appendUserPrompt(snapshot, 'agent-dina', 'old prompt');
    appendUserPrompt(snapshot, 'agent-jesse', 'keep prompt');

    expect(resumeAgentConversationInSnapshot(snapshot, 'agent-dina', { kind: 'codex', threadId: 'thread-new' }, [{
      id: 'user-thread-new',
      agentId: 'agent-other',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T10:00:00.000Z',
      parts: [{ type: 'text', text: 'resumed prompt' }],
    }], '2026-06-05T10:11:12.000Z')).toMatchObject({
      id: 'agent-dina',
      backendSession: { kind: 'codex', threadId: 'thread-new' },
      status: { type: 'idle' },
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.agents[0].contextUsage).toBeUndefined();
    expect(snapshot.agents[0].plan).toBeUndefined();
    expect(snapshot.agents[0].isRegistered).toBeUndefined();
    expect(snapshot.messages.map((message) => [
      message.agentId,
      message.parts[0]?.type === 'text' ? message.parts[0].text : '',
    ])).toStrictEqual([
      ['agent-jesse', 'keep prompt'],
      ['agent-dina', 'resumed prompt'],
    ]);
  });

  it('closes an idle agent and selects the next available agent', () => {
    const snapshot = createInitialSnapshot();
    appendUserPrompt(snapshot, 'agent-dina', 'old prompt');
    appendUserPrompt(snapshot, 'agent-jesse', 'keep prompt');
    assignWorkItemToAgentInSnapshot(snapshot, 'agent-dina', workItem(12, 'Fix cockpit drag target'));

    expect(closeAgentInSnapshot(snapshot, 'agent-dina')).toMatchObject({ id: 'agent-dina' });

    expect(snapshot.agents.map((agent) => agent.id)).toStrictEqual(['agent-jesse']);
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-jesse']);
    expect(snapshot.activeAgentId).toBe('agent-jesse');
    expect(snapshot.messages.map((message) => message.agentId)).toStrictEqual(['agent-jesse']);
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

  it('rejects restart and move while an agent is busy but still allows close', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    appendUserPrompt(snapshot, 'agent-dina', 'busy prompt');

    expect(() => restartAgentConversation(snapshot, 'agent-dina')).toThrow('Agent must be idle before restarting.');
    expect(() => resumeAgentConversationInSnapshot(snapshot, 'agent-dina', { kind: 'codex', threadId: 'thread-new' }, [])).toThrow('Agent must be idle before resuming a conversation.');
    expect(() => moveAgentToTeamInSnapshot(snapshot, 'agent-dina', 'team-codex-claw')).toThrow('Agent must be idle before moving.');
    expect(closeAgentInSnapshot(snapshot, 'agent-dina')).toMatchObject({ id: 'agent-dina' });
    expect(snapshot.agents.map((agent) => agent.id)).toStrictEqual(['agent-jesse']);
    expect(snapshot.messages.map((message) => message.agentId)).toStrictEqual([]);
  });

  it('returns null for missing agents', () => {
    const snapshot = createInitialSnapshot();

    expect(duplicateAgentInSnapshot(snapshot, 'missing-agent')).toBeNull();
    expect(saveAgentToBench(snapshot, 'missing-agent')).toBeNull();
    expect(deployBenchTemplateInSnapshot(snapshot, 'missing-template')).toBeNull();
    expect(deployBenchTemplateInSnapshot(snapshot, 'bench-dina', 'missing-team')).toBeNull();
    expect(removeBenchTemplateFromSnapshot(snapshot, 'missing-template')).toBeNull();
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
