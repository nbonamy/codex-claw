import { describe, expect, it, vi } from 'vitest';
import { registerMissionIpcHandlers } from '../mission-ipc';
import { createInitialSnapshot } from '@codex-claw/core/snapshot-construction';
import { createMission } from '@codex-claw/core/missions';

describe('mission IPC', () => {
  it('forwards mission writes to clawd and adopts the returned snapshots', async () => {
    const snapshot = createInitialSnapshot();
    const mission = createMission(snapshot, { outcome: 'Billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id });
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = { handle: (key: string, handler: (...args: unknown[]) => unknown) => handlers.set(key, handler) } as unknown as Parameters<typeof registerMissionIpcHandlers>[0];
    const request = vi.fn().mockResolvedValue(snapshot);
    const adopt = vi.fn(value => value);
    registerMissionIpcHandlers(ipc, () => ({ request }) as unknown as ReturnType<Parameters<typeof registerMissionIpcHandlers>[1]>, adopt);
    const input = { outcome: 'Billing', workflowType: 'shapeAndShipFeature', teamId: snapshot.teams[0]!.id, orchestratorMemberId: snapshot.agents[0]!.id };
    await expect(handlers.get('mission:create')!({}, input)).resolves.toBe(snapshot);
    expect(request).toHaveBeenLastCalledWith('mission/create', { input });
    const update = { id: mission.id, revision: 0, artifacts: mission.artifacts, stageAgentIds: {}, action: 'save' };
    await expect(handlers.get('mission:update')!({}, update)).resolves.toBe(snapshot);
    expect(request).toHaveBeenLastCalledWith('mission/update', { input: update });
    const execution = { id: mission.id, revision: 0, action: 'run' };
    await expect(handlers.get('mission:execute')!({}, execution)).resolves.toBe(snapshot);
    expect(request).toHaveBeenLastCalledWith('mission/execution/update', { input: execution });
    const deletion = { id: mission.id, revision: 0 };
    await expect(handlers.get('mission:delete')!({}, deletion)).resolves.toBe(snapshot);
    expect(request).toHaveBeenLastCalledWith('mission/delete', { input: deletion });
    expect(adopt).toHaveBeenCalledTimes(4);
    request.mockRejectedValueOnce(new Error('Stale revision'));
    await expect(handlers.get('mission:update')!({}, update)).rejects.toThrow('Stale revision');
    expect(adopt).toHaveBeenCalledTimes(4);
  });
});
