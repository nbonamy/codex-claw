import { RRuleTemporal } from 'rrule-temporal';
import { toText } from 'rrule-temporal/totext';
import type { Automation, AutomationSchedule } from './contracts';

/** Calendar rules are deliberately separate from elapsed-time intervals. */
export function normalizeAutomationSchedule(value: unknown): AutomationSchedule | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if ('intervalMinutes' in input) {
    return !('rrule' in input) && !('timeZone' in input) && typeof input.intervalMinutes === 'number'
      && Number.isFinite(input.intervalMinutes) && input.intervalMinutes >= 1 && input.intervalMinutes <= 525_600
      ? { intervalMinutes: Math.floor(input.intervalMinutes) } : null;
  }
  if (typeof input.rrule !== 'string' || input.rrule.length > 1000 || typeof input.timeZone !== 'string') return null;
  const rrule = input.rrule.trim().replace(/^RRULE:/i, '').toUpperCase();
  const timeZone = input.timeZone.trim();
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(timeZone) && timeZone !== 'UTC') return null;
  // One rule only: no injected DTSTART/EXDATE, sub-minute runs, or duplicate fields.
  const parts = rrule.split(';').map(part => part.split('='));
  const keys = parts.map(([key]) => key);
  const ranges: Record<string, [number, number]> = { INTERVAL: [1, 525600], COUNT: [1, 10000], BYHOUR: [0, 23], BYMINUTE: [0, 59],
    BYSECOND: [0, 0], BYMONTH: [1, 12], BYMONTHDAY: [-31, 31], BYYEARDAY: [-366, 366], BYWEEKNO: [-53, 53], BYSETPOS: [-366, 366] };
  const allowed = new Set(['FREQ', 'BYDAY', 'WKST', 'UNTIL', ...Object.keys(ranges)]);
  if (parts.some(([key, value]) => !key || !allowed.has(key) || !value || (ranges[key] && value.split(',').some(token => {
    const number = Number(token), range = ranges[key]!;
    return !/^-?\d+$/.test(token) || number < range[0] || number > range[1] || (range[0] < 0 && number === 0);
  })))) return null;
  if (new Set(keys).size !== keys.length || parts.some(part => part.length !== 2)
    || !/^(MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(parts.find(([key]) => key === 'FREQ')?.[1] ?? '')
    || parts.some(([key, value]) => key === 'BYSECOND' && value !== '0') || /[\r\n]/.test(rrule)) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    calendarRule({ rrule, timeZone }, '2026-01-01T00:00:00.000Z');
    return { rrule, timeZone };
  } catch { return null; }
}

function calendarRule(schedule: Extract<AutomationSchedule, { rrule: string }>, anchor: string): RRuleTemporal {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(anchor));
  const field = (type: string) => parts.find(part => part.type === type)!.value;
  const start = `${field('year')}${field('month')}${field('day')}T${field('hour')}${field('minute')}${field('second')}`;
  return new RRuleTemporal({ rruleString: `DTSTART;TZID=${schedule.timeZone}:${start}\nRRULE:${schedule.rrule}`,
    strict: true, includeDtstart: false, maxIterations: 10_000, maxCandidateEvaluations: 10_000 });
}

/** Next unconsumed occurrence; an overdue result causes one catch-up, not a replay. */
export function nextAutomationRunAt(automation: Pick<Automation, 'schedule' | 'createdAt' | 'scheduleAnchorAt' | 'lastRunAt'>): string | null {
  const anchor = automation.scheduleAnchorAt ?? automation.createdAt;
  const after = new Date(Math.max(Date.parse(anchor), Date.parse(automation.lastRunAt ?? anchor)));
  if (!Number.isFinite(after.getTime())) return null;
  if ('intervalMinutes' in automation.schedule) return new Date(after.getTime() + automation.schedule.intervalMinutes * 60_000).toISOString();
  try {
    const next = calendarRule(automation.schedule, anchor).next(after, false);
    return next ? new Date(next.epochMilliseconds).toISOString() : null;
  } catch { return null; }
}

export function automationCalendarDescription(schedule: Extract<AutomationSchedule, { rrule: string }>, anchor: string): string {
  try { return toText(calendarRule(schedule, anchor), 'en', { excludeTzAbbreviation: true }); }
  catch { return schedule.rrule; }
}
