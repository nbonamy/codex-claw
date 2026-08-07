import type { Agent } from './contracts';

export function formatConversationTitle(agent: Agent, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes): string => (
    parts.find((entry) => entry.type === type)?.value ?? ''
  );

  return `${agent.name} - ${part('month')} ${part('day')}, ${part('year')} ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}
