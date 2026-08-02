import { describe, expect, it } from 'vitest';
import type { Agent } from '../contracts';
import { formatConversationTitle } from '../conversation-title';

describe('conversation titles', () => {
  it('formats a stable English title from the agent and timestamp', () => {
    expect(formatConversationTitle(agent(), new Date(2026, 7, 2, 19, 7)))
      .toBe('Dina - Aug 2, 2026 7:07 PM');
  });
});

function agent(): Agent {
  return {
    id: 'agent-dina',
    teamId: 'team-claw',
    name: 'Dina',
    avatar: 'DI',
    folder: '/tmp/claw',
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'idle' },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}
