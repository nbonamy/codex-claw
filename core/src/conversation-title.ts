import type { Agent } from './contracts';
import { agentDisplayName } from './agent-display';

export function formatConversationTitle(agent: Agent): string {
  return agentDisplayName(agent);
}
