import type { Agent } from './contracts';

export function formatConversationTitle(agent: Agent): string {
  return agent.name;
}
