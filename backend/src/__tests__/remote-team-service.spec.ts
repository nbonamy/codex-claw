import { describe, expect, it, vi } from 'vitest';
import { snapshotMetadata } from '@codex-claw/core/snapshot';
import { RemoteTeamService } from '../connections/remote-team-service';
import {
  createRemoteAgent,
  createRemoteTeamSnapshot,
  createTestSnapshot,
  createTextMessage,
  readyRemoteConnection,
} from './server-test-fixtures';

describe('RemoteTeamService', () => {
  it('classifies full and metadata events while rejecting malformed snapshot payloads', async () => {
    const snapshot = createTestSnapshot();
    snapshot.remoteConnections.connections = [readyRemoteConnection()];
    snapshot.teams = [{
      id: 'team-pointer',
      name: 'Remote Core',
      remoteConnectionId: 'connection-devbox',
      remoteTeamId: 'team-remote',
      agentIds: [],
    }];
    const remoteAgent = createRemoteAgent();
    const initialRemoteSnapshot = createRemoteTeamSnapshot([remoteAgent]);
    const fullSnapshot = structuredClone(initialRemoteSnapshot);
    fullSnapshot.messages = [createTextMessage('message-remote-event', remoteAgent.id, 'Remote event')];
    const metadata = snapshotMetadata(structuredClone(initialRemoteSnapshot));
    metadata.agents[0]!.name = 'Metadata event update';
    const malformedFullSnapshot = structuredClone(initialRemoteSnapshot);
    malformedFullSnapshot.agents[0]!.name = 'Malformed event update';
    (malformedFullSnapshot as unknown as Record<string, unknown>).messages = {};
    const onProjectedSnapshotChanged = vi.fn();
    const clients = {
      request: vi.fn(async (_connection, _method, _params, onEvent?: (event: unknown) => void) => {
        onEvent?.({
          seq: 1,
          type: 'snapshot.updated',
          payload: fullSnapshot,
          occurredAt: '2026-06-13T00:00:00.000Z',
        });
        onEvent?.({
          seq: 2,
          type: 'snapshot.updated',
          payload: metadata,
          occurredAt: '2026-06-13T00:00:01.000Z',
        });
        onEvent?.({
          seq: 3,
          type: 'snapshot.updated',
          payload: malformedFullSnapshot,
          occurredAt: '2026-06-13T00:00:02.000Z',
        });
        return null;
      }),
    };
    const service = new RemoteTeamService({
      clients: clients as never,
      getSnapshot: () => snapshot,
      onForwardedEvent: vi.fn(),
      onProjectedSnapshotChanged,
      recordProjectedWorkRouting: vi.fn(),
    });
    service.rememberSnapshot('connection-devbox', initialRemoteSnapshot);

    await service.request('connection-devbox', 'test');

    const rememberedSnapshot = service.knownSnapshot('connection-devbox');
    expect(rememberedSnapshot).toBe(fullSnapshot);
    expect(rememberedSnapshot?.messages).toBe(fullSnapshot.messages);
    expect(rememberedSnapshot?.messages).toStrictEqual([expect.objectContaining({ id: 'message-remote-event' })]);
    expect(rememberedSnapshot?.agents[0]?.name).toBe('Metadata event update');
    expect(onProjectedSnapshotChanged).toHaveBeenCalledTimes(3);
  });
});
