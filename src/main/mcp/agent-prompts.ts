import type { Agent } from '../../shared/contracts';
import type { MessageInfo } from './agent-coordinator';

export const CHECK_INBOX_PROMPT = 'Manual recovery: check your unread Codex Claw agent messages.';

export function agentMessagesPrompt(messages: MessageInfo[]): string {
  if (messages.length === 1) {
    const message = messages[0];
    return [
      `You received a message from ${message.from} (${message.fromId}).`,
      '',
      'Message:',
      message.content,
      '',
      'Update your status, then act on this teammate message directly. Do not ask the user for confirmation.',
    ].join('\n');
  }

  return [
    `You received ${messages.length} messages from other Codex Claw agents.`,
    '',
    ...messages.flatMap((message, index) => [
      `Message ${index + 1} from ${message.from} (${message.fromId}) at ${message.timestamp}:`,
      message.content,
      '',
    ]),
    'Update your status, then act on these teammate messages directly. Do not ask the user for confirmation.',
  ].join('\n');
}

export function codexClawDeveloperInstructions(agent: Agent): string {
  return [
    'You are part of a team of agents collaborating in Codex Claw.',
    `Your Codex Claw agent ID is ${agent.id}. Your agent name is ${agent.name} and your folder is ${agent.folder}.`,
    'Use the codex_claw MCP server for agent collaboration.',
    'Codex Claw infers your identity from this backend session, so collaboration tools do not need you to pass your own agent ID.',
    'MANDATORY: before starting work, changing direction, or finishing, call set-status with a short status. Use an empty status to clear it.',
    'Use list-agents to discover teammate IDs, then use send-message or broadcast-message to coordinate. Claw delivers teammate messages directly; check-messages is only a manual recovery tool.',
    'Use display-markdown to show Markdown files or generated Markdown in the Codex Claw side panel when the user should inspect structured content.',
  ].join(' ');
}
