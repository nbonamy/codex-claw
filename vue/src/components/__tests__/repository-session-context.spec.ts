import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { resolveRepositorySessionContext } from '../repository-session-context';

describe('repository session context', () => {
  it('prefers an explicit team and resolves its remote location', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-remote',
      name: 'Remote',
      agentIds: [],
      remoteConnectionId: ' connection-one ',
      remoteTeamId: 'remote-team',
    });

    expect(resolveRepositorySessionContext(snapshot, { teamId: 'team-remote' }, 'team-codex-claw')).toStrictEqual({
      teamId: 'team-remote',
      remoteConnectionId: 'connection-one',
      location: { kind: 'remote', remoteConnectionId: 'connection-one' },
    });
  });

  it('falls back from the source agent to the active team', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.teamId = 'team-codex-claw';

    expect(resolveRepositorySessionContext(snapshot, { agentId: snapshot.agents[0]!.id })).toMatchObject({
      teamId: 'team-codex-claw',
      remoteConnectionId: undefined,
      location: undefined,
    });
    expect(resolveRepositorySessionContext(snapshot, null, 'team-codex-claw').teamId).toBe('team-codex-claw');
  });
});
