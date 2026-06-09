import { describe, expect, it } from 'vitest';
import {
  assignWorkItemToAgentInSnapshot,
  closeAgentInSnapshot,
  deployBenchTemplateInSnapshot,
  duplicateAgentInSnapshot,
  moveAgentToTeamInSnapshot,
  removeBenchTemplateFromSnapshot,
  removeWorkItemAssignmentFromSnapshot,
  reorderAgentInTeam,
  restartAgentConversation,
  saveAgentToBench,
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
    expect(snapshot.teams[0].agentIds).toContain(duplicate?.id);
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
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-dina', 'agent-jesse', 'agent-abby']);

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

  it('closes an idle agent and selects the next available agent', () => {
    const snapshot = createInitialSnapshot();
    appendUserPrompt(snapshot, 'agent-dina', 'old prompt');
    appendUserPrompt(snapshot, 'agent-jesse', 'keep prompt');

    expect(closeAgentInSnapshot(snapshot, 'agent-dina')).toMatchObject({ id: 'agent-dina' });

    expect(snapshot.agents.map((agent) => agent.id)).toStrictEqual(['agent-jesse']);
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-jesse']);
    expect(snapshot.activeAgentId).toBe('agent-jesse');
    expect(snapshot.messages.map((message) => message.agentId)).toStrictEqual(['agent-jesse']);
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
