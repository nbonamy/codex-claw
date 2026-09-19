import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '../snapshot-construction';
import { createMission, deleteMission, updateMission, isMission, type UpdateMissionInput } from '../missions';
import { decodeAppSnapshot } from '../snapshot-guards';

describe('missions', () => {
  it('persists a separate outcome through four explicit artifact gates without creating agents', () => {
    const snapshot = createEmptySnapshot();
    const mission = createMission(snapshot, { outcome: ' Add team billing ', workflowType: 'shapeAndShipFeature' });
    expect(mission.outcome).toBe('Add team billing');
    expect(snapshot.agents).toStrictEqual([]);
    const update = (action: UpdateMissionInput['action']) => updateMission(snapshot, { id: mission.id, revision: mission.revision, artifacts, stageAgentIds: {}, action });
    const artifacts = structuredClone(mission.artifacts);
    expect(() => update('advance')).toThrow('required stage');
    artifacts.requirements = { problem: 'Teams need billing', acceptance: 'An owner can pay' };
    update('save'); expect(mission.stage).toBe('requirements');
    update('advance'); expect(mission.stage).toBe('tickets');
    expect(() => update('advance')).toThrow('required stage');
    artifacts.tickets = [{ title: 'Add owner checkout', done: false }];
    update('advance'); expect(mission.stage).toBe('implementation');
    artifacts.implementation = { changes: 'commit abc', tests: 'Checkout tests pass' };
    expect(() => update('advance')).toThrow('required stage');
    artifacts.tickets[0]!.done = true;
    update('advance'); expect(mission.stage).toBe('review');
    expect(() => update('advance')).toThrow('required stage');
    artifacts.review.summary = 'Reviewed acceptance; ready to deliver';
    update('advance'); expect(mission.status).toBe('completed');
    expect(() => update('save')).toThrow('completed');
    expect(decodeAppSnapshot(snapshot)?.value.missions).toStrictEqual([mission]);
  });
  it('rejects malformed input, stale writers, dangling agents, and invalidated earlier gates without mutation', () => {
    const snapshot = createEmptySnapshot();
    for (const input of [null, { outcome: ' ', workflowType: 'shapeAndShipFeature' }, { outcome: 'x', workflowType: 'unknown' }]) expect(() => createMission(snapshot, input)).toThrow();
    const mission = createMission(snapshot, { outcome: 'Billing', workflowType: 'shapeAndShipFeature' });
    const input: UpdateMissionInput = { id: mission.id, revision: 0, artifacts: structuredClone(mission.artifacts), stageAgentIds: {}, action: 'save' };
    const before = structuredClone(mission);
    expect(() => updateMission(snapshot, { ...input, revision: 9 })).toThrow('changed');
    expect(() => updateMission(snapshot, { ...input, id: 'missing' })).toThrow('not found');
    expect(() => updateMission(snapshot, { ...input, artifacts: {} })).toThrow('Invalid');
    expect(() => updateMission(snapshot, { ...input, stageAgentIds: { requirements: 'missing' } })).toThrow('agent not found');
    expect(mission).toStrictEqual(before);
    expect(isMission({ ...mission, stage: 'unknown' })).toBe(false);
    expect(decodeAppSnapshot({ ...snapshot, missions: [{}] })).toBeNull();
    input.artifacts.requirements = { problem: 'Billing', acceptance: 'Payment' };
    updateMission(snapshot, { ...input, action: 'advance' });
    input.artifacts.requirements.problem = '';
    expect(() => updateMission(snapshot, { ...input, revision: 1 })).toThrow('required stage');
  });

  it('deletes only the current mission revision', () => {
    const snapshot = createEmptySnapshot();
    const first = createMission(snapshot, { outcome: 'Billing', workflowType: 'shapeAndShipFeature' });
    const second = createMission(snapshot, { outcome: 'Invitations', workflowType: 'shapeAndShipFeature' });

    expect(() => deleteMission(snapshot, { id: first.id, revision: 1 })).toThrow('changed');
    expect(() => deleteMission(snapshot, { id: 'missing', revision: 0 })).toThrow('not found');
    expect(deleteMission(snapshot, { id: first.id, revision: 0 })).toBe(first);
    expect(snapshot.missions).toStrictEqual([second]);
  });
});
