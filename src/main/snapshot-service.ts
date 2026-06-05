import type { Agent, AppSnapshot, CreateAgentInput } from '../shared/contracts';

const now = '2026-06-05T00:00:00.000Z';

export function createInitialSnapshot(): AppSnapshot {
  const agent = createSeedAgent();

  return {
    teams: [],
    agents: [agent],
    bench: [],
    activeAgentId: agent.id,
    messages: [
      {
        id: 'message-welcome',
        agentId: agent.id,
        role: 'assistant',
        status: 'complete',
        createdAt: now,
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
  };
}

export function createAgentFromInput(input: CreateAgentInput, createdAt = new Date().toISOString()): Agent {
  return {
    id: `agent-${slug(input.name)}-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    name: input.name.trim(),
    avatar: input.avatar,
    folder: input.folder,
    status: { type: 'idle' },
    createdAt,
    updatedAt: createdAt,
  };
}

function createSeedAgent(): Agent {
  return {
    id: 'agent-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '~/src/codex-claw',
    status: { type: 'idle' },
    createdAt: now,
    updatedAt: now,
  };
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || 'codex';
}
