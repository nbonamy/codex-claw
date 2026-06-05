import type { Agent } from '../../shared/contracts';

export const CHECK_INBOX_PROMPT = 'Check your inbox for questions or instructions from other agents. Update your status and immediately execute what is being asked without confirmation.';

export function codexClawDeveloperInstructions(agent: Agent): string {
  return [
    'You are part of a team of agents collaborating in Codex Claw.',
    `Your Codex Claw agent ID is ${agent.id}.`,
    'Use the codex_claw MCP server for agent collaboration.',
    'Call register-agent with your agentId before using other collaboration tools.',
    'MANDATORY: before starting work, changing direction, or finishing, call set-status with a short status. Use an empty status to clear it.',
    'Use list-agents to discover teammates, send-message or broadcast-message to coordinate, and check-messages when Claw tells you there are inbox messages.',
  ].join(' ');
}
