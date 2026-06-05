import { describe, expect, it } from 'vitest';
import { createAgentFromInput, createInitialSnapshot } from '../snapshot-service';

describe('snapshot service', () => {
  it('creates the phase zero app snapshot with an implicit single agent', () => {
    expect(createInitialSnapshot()).toStrictEqual({
      teams: [],
      agents: [
        {
          id: 'agent-dina',
          name: 'Dina',
          avatar: 'DI',
          folder: '~/src/codex-claw',
          status: { type: 'idle' },
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      ],
      bench: [],
      activeAgentId: 'agent-dina',
      messages: [
        {
          id: 'message-welcome',
          agentId: 'agent-dina',
          role: 'assistant',
          status: 'complete',
          createdAt: '2026-06-05T00:00:00.000Z',
          parts: [
            {
              type: 'text',
              text: 'Codex Claw is ready for the first native Codex agent.',
            },
            {
              type: 'status',
              text: 'app-server integration pending',
            },
          ],
        },
      ],
      appServer: {
        status: 'notConfigured',
        detail: 'Codex app-server is not connected yet.',
      },
      theme: {
        id: 'codex-claw-dark',
      },
    });
  });

  it('creates named agents from UI input', () => {
    expect(createAgentFromInput({
      name: ' Jules ',
      avatar: 'JU',
      folder: '/Users/nbonamy/src/id8',
    }, '2026-06-05T10:11:12.000Z')).toStrictEqual({
      id: 'agent-jules-20260605t101112000z',
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
