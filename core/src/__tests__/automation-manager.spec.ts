import { describe, expect, it } from 'vitest';
import type { AutomationExecutionLogEntry, CreateAutomationInput } from '../contracts';
import { clearAutomationExecutionHistoryInSnapshot, createAutomationInSnapshot, deleteAutomationExecutionFromSnapshot,
  deleteAutomationFromSnapshot, recordAutomationExecutionInSnapshot, updateAutomationInSnapshot } from '../automation-manager';
import { createInitialSnapshot } from '../snapshot';
import { createQuickChatInSnapshot } from '../agent-manager';

function setup() {
  const snapshot = createInitialSnapshot();
  snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
  return snapshot;
}
const input: CreateAutomationInput = { prompt: ' Check tasks. ', target: { kind: 'newQuickChat', teamId: 'team-app', backend: 'codex' }, schedule: { intervalMinutes: 60.9 } };
function execution(id: string, status: AutomationExecutionLogEntry['status'] = 'completed'): AutomationExecutionLogEntry {
  return { id, automationId: 'auto', status, startedAt: '2026-10-06T12:00:00Z', agentId: 'agent-dina', agentName: 'Dina' };
}
describe('prompt automation configuration', () => {
  it('reanchors changed or re-enabled schedules but keeps timing when editing just the prompt', () => {
    const snapshot = setup();
    const schedule = { rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0', timeZone: 'America/Chicago' };
    const automation = createAutomationInSnapshot(snapshot, { ...input, schedule, enabled: false }, '2026-10-06T12:00:00Z', () => 'auto')!;
    updateAutomationInSnapshot(snapshot, { ...input, schedule, id: 'auto', enabled: true }, '2026-10-06T14:00:00Z');
    expect(automation.scheduleAnchorAt).toBe('2026-10-06T14:00:00Z');
    updateAutomationInSnapshot(snapshot, { ...input, schedule, id: 'auto', prompt: 'Changed' }, '2026-10-07T14:00:00Z');
    expect(automation.scheduleAnchorAt).toBe('2026-10-06T14:00:00Z');
  });
  it('creates without a repository and edits configuration without losing run history', () => {
    const snapshot = setup();
    const automation = createAutomationInSnapshot(snapshot, input, 'now', () => 'auto')!;
    expect(automation).toStrictEqual({ id: 'auto', name: 'Check tasks.', enabled: true, prompt: 'Check tasks.',
      target: input.target, schedule: { intervalMinutes: 60 }, executionLog: [], createdAt: 'now', updatedAt: 'now' });
    recordAutomationExecutionInSnapshot(snapshot, 'auto', execution('run'));
    updateAutomationInSnapshot(snapshot, { ...input, id: 'auto', name: 'Nightly', enabled: false,
      target: { kind: 'agent', agentId: 'agent-dina' } }, 'later');
    expect(automation).toMatchObject({ name: 'Nightly', enabled: false, target: { kind: 'agent', agentId: 'agent-dina' },
      executionLog: [execution('run')], updatedAt: 'later' });
    expect(deleteAutomationFromSnapshot(snapshot, 'auto')).toBe(automation);
    expect(snapshot.automations).toEqual([]);
  });

  it('validates target identity, target kind, local ownership, prompt, and schedule', () => {
    const snapshot = setup();
    for (const bad of [
      { ...input, prompt: '' }, { ...input, target: { kind: 'agent', agentId: 'missing' } },
      { ...input, target: { kind: 'quickChat', agentId: 'agent-dina' } },
      { ...input, schedule: { intervalMinutes: 0 } }, { ...input, schedule: { intervalMinutes: NaN } },
      { ...input, target: { kind: 'newQuickChat', teamId: 'missing', backend: 'codex' } },
      { ...input, target: undefined },
    ]) expect(createAutomationInSnapshot(snapshot, bad as CreateAutomationInput)).toBeNull();
    createQuickChatInSnapshot(snapshot, { teamId: 'team-app', backend: 'claude' }, 'now', 'quick');
    expect(createAutomationInSnapshot(snapshot, { ...input, target: { kind: 'quickChat', agentId: 'quick' } })).not.toBeNull();
    snapshot.teams[0]!.remoteConnectionId = 'remote';
    expect(createAutomationInSnapshot(snapshot, input)).toBeNull();
    expect(createAutomationInSnapshot(snapshot, { ...input, target: { kind: 'agent', agentId: 'agent-dina' } })).toBeNull();
    expect(updateAutomationInSnapshot(snapshot, { ...input, id: 'missing' })).toBeNull();
  });

  it('preserves active runs and schedule timing when clearing history', () => {
    const snapshot = setup();
    const automation = createAutomationInSnapshot(snapshot, input, 'now', () => 'auto')!;
    recordAutomationExecutionInSnapshot(snapshot, 'auto', execution('done'));
    recordAutomationExecutionInSnapshot(snapshot, 'auto', execution('active', 'awaitingInput'));
    const lastRunAt = automation.lastRunAt;
    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'auto', 'active')).toBeNull();
    clearAutomationExecutionHistoryInSnapshot(snapshot, 'auto');
    expect(automation.executionLog).toEqual([execution('active', 'awaitingInput')]);
    expect(automation.lastRunAt).toBe(lastRunAt);
    automation.executionLog[0]!.status = 'completed';
    expect(deleteAutomationExecutionFromSnapshot(snapshot, 'auto', 'active')?.executionLog).toEqual([]);
    expect(recordAutomationExecutionInSnapshot(snapshot, 'missing', execution('run'))).toBeNull();
    expect(recordAutomationExecutionInSnapshot(snapshot, 'auto', { ...execution('run'), automationId: 'other' })).toBeNull();
  });
});
