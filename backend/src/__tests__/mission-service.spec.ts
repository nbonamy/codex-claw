import { describe, expect, it, vi } from 'vitest';
import { MissionService } from '../mission-service';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';

describe('MissionService', () => {
  it('keeps failed writes out of live state and serializes competing revision updates', async () => {
    const snapshot = createEmptySnapshot();
    const persist = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined);
    const service = new MissionService(snapshot, persist);
    const input = { outcome: 'Billing', workflowType: 'shapeAndShipFeature' };
    await expect(service.mutate('create', input)).rejects.toThrow('Disk full');
    expect(snapshot.missions).toBeUndefined();
    await service.mutate('create', input);
    const mission = snapshot.missions![0]!;
    const change = { id: mission.id, revision: 0, artifacts: mission.artifacts, stageAgentIds: {}, action: 'save' };
    const results = await Promise.allSettled([service.mutate('update', change), service.mutate('update', change)]);
    expect(results.map(r => r.status)).toStrictEqual(['fulfilled', 'rejected']);
    expect(snapshot.missions![0]!.revision).toBe(1);
  });
});
