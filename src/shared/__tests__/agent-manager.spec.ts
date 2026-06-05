import { describe, expect, it } from 'vitest';
import {
  closeAgentInSnapshot,
  duplicateAgentInSnapshot,
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

  it('restarts an idle agent by clearing conversation and runtime state', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.codexThreadId = 'thread-old';
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

  it('rejects restart and close while an agent is busy', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };

    expect(() => restartAgentConversation(snapshot, 'agent-dina')).toThrow('Agent must be idle before restarting.');
    expect(() => closeAgentInSnapshot(snapshot, 'agent-dina')).toThrow('Agent must be idle before closing.');
  });

  it('returns null for missing agents', () => {
    const snapshot = createInitialSnapshot();

    expect(duplicateAgentInSnapshot(snapshot, 'missing-agent')).toBeNull();
    expect(saveAgentToBench(snapshot, 'missing-agent')).toBeNull();
    expect(restartAgentConversation(snapshot, 'missing-agent')).toBeNull();
    expect(closeAgentInSnapshot(snapshot, 'missing-agent')).toBeNull();
  });
});
