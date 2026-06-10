import { describe, expect, it } from 'vitest';
import { createAgentFromInput, createInitialSnapshot, selectAgent } from '../snapshot-service';
import { defaultGeneralSettings, defaultSourceFolderState, defaultThemeSettings } from '../../shared/settings';

describe('snapshot service', () => {
  it('creates the phase one app snapshot with two implicit agents', () => {
    expect(createInitialSnapshot()).toStrictEqual({
      teams: [
        {
          id: 'team-codex-claw',
          name: 'Codex Claw',
          avatar: 'CC',
          color: '#1B4FB2',
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
          backend: 'codex',
          backendDefaults: { kind: 'codex' },
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
          backend: 'codex',
          backendDefaults: { kind: 'codex' },
          status: { type: 'idle' },
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      ],
      bench: [],
      loops: [],
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-dina',
      messages: [],
      backendRuntimes: [{
        backend: 'codex',
        status: 'notConfigured',
        detail: 'Codex backend is not connected yet.',
      }, {
        backend: 'claude',
        status: 'notConfigured',
        detail: 'Claude backend has not been started yet.',
      }],
      workBacklog: {
        connections: [{
          provider: 'github',
          status: 'disconnected',
        }],
        providerConfigurations: {},
        providerSettings: {},
        assignments: {},
      },
      general: defaultGeneralSettings,
      sourceFolder: defaultSourceFolderState,
      theme: defaultThemeSettings,
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
    }, '2026-06-05T10:11:12.000Z', 'team-codex-claw', 'agent-new-jules')).toStrictEqual({
      id: 'agent-new-jules',
      teamId: 'team-codex-claw',
      name: 'Jules',
      avatar: 'JU',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
  });

  it('creates Claude agents from UI input', () => {
    expect(createAgentFromInput({
      name: ' Claude Pal ',
      folder: '/Users/nbonamy/src/id8',
      backend: 'claude',
    }, '2026-06-05T10:11:12.000Z', 'team-codex-claw', 'agent-new-claude')).toMatchObject({
      id: 'agent-new-claude',
      backend: 'claude',
      backendDefaults: { kind: 'claude' },
    });
  });

  it('uses the provided id for blank agent names', () => {
    expect(createAgentFromInput({
      name: ' ',
      folder: '/tmp/project',
    }, '2026-06-05T10:11:12.000Z', 'team-codex-claw', 'agent-new-project').id).toBe('agent-new-project');
  });
});
