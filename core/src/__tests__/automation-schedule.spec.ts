import { describe, expect, it } from 'vitest';
import { nextAutomationRunAt, normalizeAutomationSchedule } from '../automation-schedule';
import type { Automation } from '../contracts';

function automation(rrule: string, createdAt: string, lastRunAt?: string): Automation {
  return { id: 'a', name: 'Calendar', prompt: 'Refresh', enabled: true, target: { kind: 'agent', agentId: 'a' },
    schedule: { rrule, timeZone: 'America/Chicago' }, createdAt, updatedAt: createdAt, executionLog: [], lastRunAt };
}
describe('automation recurrence', () => {
  it.each([
    ['2026-03-07T14:00:00Z', '2026-03-08T13:00:00.000Z'],
    ['2026-10-31T13:00:00Z', '2026-11-01T14:00:00.000Z'],
  ])('keeps 08:00 Chicago across DST after %s', (last, expected) => {
    expect(nextAutomationRunAt(automation('FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0', last, last))).toBe(expected);
  });
  it('starts at the next matching time, skips weekends, and preserves the every-two-weeks phase', () => {
    expect(nextAutomationRunAt(automation('FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0', '2026-10-06T13:01:00Z'))).toBe('2026-10-07T13:00:00.000Z');
    expect(nextAutomationRunAt(automation('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8;BYMINUTE=0;BYSECOND=0', '2026-10-09T14:00:00Z'))).toBe('2026-10-12T13:00:00.000Z');
    expect(nextAutomationRunAt(automation('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=8;BYMINUTE=0;BYSECOND=0', '2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z'))).toBe('2026-10-19T13:00:00.000Z');
  });
  it('skips nonexistent spring times and runs only once at an ambiguous fall time', () => {
    expect(nextAutomationRunAt(automation('FREQ=DAILY;BYHOUR=2;BYMINUTE=30;BYSECOND=0', '2026-03-07T08:30:00Z'))).toBe('2026-03-09T07:30:00.000Z');
    const rule = automation('FREQ=DAILY;BYHOUR=1;BYMINUTE=30;BYSECOND=0', '2026-10-31T07:00:00Z');
    expect(nextAutomationRunAt(rule)).toBe('2026-11-01T06:30:00.000Z');
    rule.lastRunAt = '2026-11-01T06:30:00Z';
    expect(nextAutomationRunAt(rule)).toBe('2026-11-02T07:30:00.000Z');
  });
  it('retains advanced rules and rejects malformed, unsafe or ambiguous schedules', () => {
    const schedule = { rrule: 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=8;BYMINUTE=0;BYSECOND=0', timeZone: 'America/Chicago' };
    expect(normalizeAutomationSchedule(schedule)).toEqual(schedule);
    for (const bad of [
      { ...schedule, timeZone: 'Chicago' }, { ...schedule, rrule: 'FREQ=BOGUS' },
      { ...schedule, rrule: 'FREQ=SECONDLY' }, { ...schedule, rrule: 'FREQ=DAILY;BYHOUR=99' },
      { ...schedule, intervalMinutes: 60 }, { intervalMinutes: 0 },
    ]) expect(normalizeAutomationSchedule(bad)).toBeNull();
  });
});
