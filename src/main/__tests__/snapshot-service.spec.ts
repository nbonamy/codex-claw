import { describe, expect, it } from 'vitest';
import { createAgentFromInput, createInitialSnapshot, selectAgent } from '../snapshot-service';

describe('snapshot service', () => {
  it('creates the phase one app snapshot with two implicit agents', () => {
    expect(createInitialSnapshot()).toStrictEqual({
      teams: [
        {
          id: 'team-codex-claw',
          name: 'Codex Claw',
          avatar: 'CC',
          agentIds: ['agent-dina', 'agent-jesse'],
        },
      ],
      agents: [
        {
          id: 'agent-dina',
          teamId: 'team-codex-claw',
          name: 'Dina',
          avatar: 'DI',
          folder: '~/src/codex-claw',
          status: { type: 'idle' },
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
        {
          id: 'agent-jesse',
          teamId: 'team-codex-claw',
          name: 'Jesse',
          avatar: 'JE',
          folder: '~/src/codex-claw',
          status: { type: 'idle' },
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      ],
      bench: [],
      activeAgentId: 'agent-dina',
      messages: [],
      appServer: {
        status: 'notConfigured',
        detail: 'Codex app-server is not connected yet.',
      },
      theme: {
        id: 'codex-claw-dark',
      },
    });
  });

  it('selects an existing agent without disturbing agent state', () => {
    const snapshot = createInitialSnapshot();

    expect(selectAgent(snapshot, 'agent-jesse').activeAgentId).toBe('agent-jesse');
    expect(selectAgent(snapshot, 'missing-agent').activeAgentId).toBe('agent-jesse');
  });

  it('creates named agents from UI input', () => {
    expect(createAgentFromInput({
      name: ' Jules ',
      avatar: 'JU',
      folder: '/Users/nbonamy/src/id8',
    }, '2026-06-05T10:11:12.000Z')).toStrictEqual({
      id: 'agent-jules-20260605t101112000z',
      teamId: 'team-codex-claw',
      name: 'Jules',
      avatar: 'JU',
      folder: '/Users/nbonamy/src/id8',
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
  });

  it('uses a stable fallback slug for blank agent names', () => {
    expect(createAgentFromInput({
      name: ' ',
      folder: '/tmp/project',
    }, '2026-06-05T10:11:12.000Z').id).toBe('agent-codex-20260605t101112000z');
  });
});
