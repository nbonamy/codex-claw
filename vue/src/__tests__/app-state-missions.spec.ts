import { describe, expect, it, vi } from 'vitest';
import { useAppState } from '../app-state';
import { stubElectronTestWindow } from '../test/client';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission, updateMission } from '@codex-claw/core/missions';

describe('mission client state', () => {
  it('adopts backend mission revisions without changing agent navigation and preserves state on failure', async () => {
    const backend = createEmptySnapshot();
    const api = {
      getSnapshot: vi.fn(async () => structuredClone(backend)),
      createMission: vi.fn(async input => { createMission(backend, input); return structuredClone(backend); }),
      updateMission: vi.fn(async input => { updateMission(backend, input); return structuredClone(backend); }),
    };
    stubElectronTestWindow({ codexClaw: api });
    const state = useAppState();
    await state.loadSnapshot();
    const mission = await state.createMission({ outcome: 'Billing', workflowType: 'shapeAndShipFeature' });
    const input = { id: mission.id, revision: 0, artifacts: JSON.parse(JSON.stringify(mission.artifacts)), stageAgentIds: {}, action: 'save' as const };
    await state.updateMission(input);
    expect(state.snapshot.value.missions?.[0]?.revision).toBe(1);
    expect(state.snapshot.value.activeAgentId).toBeNull();
    await expect(state.updateMission(input)).rejects.toThrow('changed');
    expect(state.snapshot.value.missions?.[0]?.revision).toBe(1);
  });
});
