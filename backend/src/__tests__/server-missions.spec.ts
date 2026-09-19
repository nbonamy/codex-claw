import { describe, expect, it, vi } from 'vitest';
import { ClawBackendServer } from '../server';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { persistedStateFromSnapshot, snapshotFromPersistedState } from '../state-persistence';
import type { AppSnapshot } from '@codex-claw/core/contracts';

describe('mission backend boundary', () => {
  it('creates, broadcasts, updates and reloads a mission independently of agents and navigation', async () => {
    const snapshot = createEmptySnapshot();
    let disk: unknown;
    const onEvent = vi.fn();
    const server = new ClawBackendServer({ version: 'test', pid: 1, snapshot, saveSnapshot: async value => { disk = persistedStateFromSnapshot(value); }, onEvent });
    const call = (method: string, input: unknown) => server.handleMessage({ jsonrpc: '2.0', id: 1, method, params: { input } });
    try {
      const created = await call('mission/create', { outcome: 'Add billing', workflowType: 'shapeAndShipFeature' });
      expect(created).toHaveProperty('result');
      const mission = (created as { result: AppSnapshot }).result.missions![0]!;
      const artifacts = { ...mission.artifacts, requirements: { problem: 'Billing', acceptance: 'Owner checkout' } };
      await call('mission/update', { id: mission.id, revision: 0, artifacts, stageAgentIds: {}, action: 'advance' });
      const restored = snapshotFromPersistedState(disk);
      expect(restored.missions?.[0]).toMatchObject({ id: mission.id, stage: 'tickets', revision: 1, artifacts });
      expect(restored.agents).toStrictEqual([]);
      expect(restored.activeAgentId).toBeNull();
      expect(onEvent.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'snapshot.updated', payload: { missions: restored.missions } });
      await expect(call('mission/update', { id: mission.id, revision: 0, artifacts, stageAgentIds: {}, action: 'save' })).rejects.toThrow('changed');
      expect(snapshotFromPersistedState(disk).missions).toStrictEqual(restored.missions);
      expect(snapshotFromPersistedState({ ...disk as object, missions: [{}] }).missions).toStrictEqual([]);
      expect(snapshotFromPersistedState({ teams: [] }).missions).toBeUndefined();
    } finally { await server.close(); }
  });
});
