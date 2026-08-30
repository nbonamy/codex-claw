import type { Agent } from './contracts';
import { agentDisplayName } from './agent-display';

export function formatConversationTitle(agent: Agent): string {
  return agentDisplayName(agent);
}

export function shouldSyncConversationTitleFromAgent(agent: Agent): boolean {
  return agent.sessionKind !== 'quickChat' || Boolean(agent.name?.trim());
}
