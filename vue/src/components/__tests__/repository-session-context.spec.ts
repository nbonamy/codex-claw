import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@workspace/core/snapshot';
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

    expect(resolveRepositorySessionContext(snapshot, { teamId: 'team-remote' }, 'team-app')).toStrictEqual({
      teamId: 'team-remote',
      remoteConnectionId: 'connection-one',
      location: { kind: 'remote', remoteConnectionId: 'connection-one' },
    });
  });

  it('falls back from the source agent to the active team', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.teamId = 'team-app';

    expect(resolveRepositorySessionContext(snapshot, { agentId: snapshot.agents[0]!.id })).toMatchObject({
      teamId: 'team-app',
      remoteConnectionId: undefined,
      location: undefined,
    });
    expect(resolveRepositorySessionContext(snapshot, null, 'team-app').teamId).toBe('team-app');
  });
});
