import { describe, expect, it } from 'vitest';
import {
  closeAgentInSnapshot,
  duplicateAgentInSnapshot,
  moveAgentToTeamInSnapshot,
  restartAgentConversation,
  saveAgentToBench,
} from '../agent-manager';
import { appendUserPrompt, createInitialSnapshot } from '../snapshot';

describe('agent-manager', () => {
  it('duplicates an agent in the same team and selects the copy', () => {
    const snapshot = createInitialSnapshot();
    const duplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    expect(duplicate).toStrictEqual({
      id: 'agent-dina-copy-20260605t101112000z',
      teamId: 'team-codex-claw',
      name: 'Dina (copy)',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.activeAgentId).toBe(duplicate?.id);
    expect(snapshot.teams[0].agentIds).toContain(duplicate?.id);
  });

  it('generates collision-safe ids for duplicated agents and bench templates', () => {
    const snapshot = createInitialSnapshot();

    const firstDuplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');
    const secondDuplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');
    const firstTemplate = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');
    const secondTemplate = saveAgentToBench(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

    expect(firstDuplicate?.id).toBe('agent-dina-copy-20260605t101112000z');
    expect(secondDuplicate?.id).toBe('agent-dina-copy-20260605t101112000z-2');
    expect(firstTemplate?.id).toBe('bench-dina-20260605t101112000z');
    expect(secondTemplate?.id).toBe('bench-dina-20260605t101112000z-2');
  });

  it('duplicates legacy agents into the active team when they have no team id', () => {
    const snapshot = createInitialSnapshot();
    delete snapshot.agents[0].teamId;

    const duplicate = duplicateAgentInSnapshot(snapshot, 'agent-dina', '2026-06-05T10:11:12.000Z');

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
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(snapshot.bench).toStrictEqual([template]);
    expect(snapshot.activeAgentId).toBe('agent-dina');
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

  it('restarts an idle agent by clearing conversation and runtime state', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.codexThreadId = 'thread-old';
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
    expect(snapshot.agents[0].codexThreadId).toBeUndefined();
    expect(snapshot.agents[0].contextUsage).toBeUndefined();
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

  it('closes a non-active idle agent without changing active selection', () => {
    const snapshot = createInitialSnapshot();

    expect(closeAgentInSnapshot(snapshot, 'agent-jesse')).toMatchObject({ id: 'agent-jesse' });

    expect(snapshot.activeAgentId).toBe('agent-dina');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.teams[0].agentIds).toStrictEqual(['agent-dina']);
  });

  it('rejects restart and close while an agent is busy', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };

    expect(() => restartAgentConversation(snapshot, 'agent-dina')).toThrow('Agent must be idle before restarting.');
    expect(() => closeAgentInSnapshot(snapshot, 'agent-dina')).toThrow('Agent must be idle before closing.');
    expect(() => moveAgentToTeamInSnapshot(snapshot, 'agent-dina', 'team-codex-claw')).toThrow('Agent must be idle before moving.');
  });

  it('returns null for missing agents', () => {
    const snapshot = createInitialSnapshot();

    expect(duplicateAgentInSnapshot(snapshot, 'missing-agent')).toBeNull();
    expect(saveAgentToBench(snapshot, 'missing-agent')).toBeNull();
    expect(moveAgentToTeamInSnapshot(snapshot, 'missing-agent', 'team-codex-claw')).toBeNull();
    expect(moveAgentToTeamInSnapshot(snapshot, 'agent-dina', 'missing-team')).toBeNull();
    expect(restartAgentConversation(snapshot, 'missing-agent')).toBeNull();
    expect(closeAgentInSnapshot(snapshot, 'missing-agent')).toBeNull();
  });
});
