import type { Agent } from '@codex-claw/shared/contracts';

export type MessageInfo = {
  from: string;
  fromId: string;
  timestamp: string;
  content: string;
};

export const CHECK_INBOX_PROMPT = 'Manual recovery: check your unread Codex Claw agent messages.';

const SINGLE_MESSAGE_INSTRUCTION = [
  'Act on this teammate message without asking the user for confirmation.',
  'Update your status only if it changes your substantive work.',
  'Reply only when the sender needs information, a decision, coordination, or action;',
  'silently absorb FYIs, acknowledgments, confirmations, and closures.',
  'Never acknowledge an acknowledgment.',
].join(' ');

const MULTIPLE_MESSAGES_INSTRUCTION = [
  'Act on these teammate messages without asking the user for confirmation.',
  'Update your status only if they change your substantive work.',
  'Reply only when a sender needs information, a decision, coordination, or action;',
  'silently absorb FYIs, acknowledgments, confirmations, and closures.',
  'Never acknowledge an acknowledgment.',
].join(' ');

export function agentMessagesPrompt(messages: MessageInfo[]): string {
  if (messages.length === 1) {
    const message = messages[0];
    return [
      `You received a message from ${message.from} (${message.fromId}).`,
      '',
      'Message:',
      message.content,
      '',
      SINGLE_MESSAGE_INSTRUCTION,
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
    MULTIPLE_MESSAGES_INSTRUCTION,
  ].join('\n');
}

export function codexClawDeveloperInstructions(agent: Agent): string {
  return [
    'You are part of a team of agents collaborating in Codex Claw.',
    `Your Codex Claw agent ID is ${agent.id}. Your agent name is ${agent.name} and your folder is ${agent.folder}.`,
    'Use the codex_claw MCP server for agent collaboration.',
    'Codex Claw infers your identity from this backend session, so collaboration tools do not need you to pass your own agent ID.',
    'MANDATORY: before starting substantive work, changing direction, or finishing substantive work, call set-status with a short status. Use an empty status to clear it. Do not change status for informational teammate messages or coordination closure.',
    'Use list-agents to discover teammate IDs, then use send-message or broadcast-message to coordinate. Claw delivers teammate messages directly; check-messages is only a manual recovery tool. Reply to teammate messages only when the sender needs information, a decision, coordination, or action. Silently absorb FYIs, acknowledgments, confirmations, and closures. Never acknowledge an acknowledgment.',
    'Use display-markdown to show Markdown files or generated Markdown in the Codex Claw side panel when the user should inspect structured content.',
    'Use browser-open with an HTTP or HTTPS URL to open the Codex Claw in-app browser for your agent. Then use browser-get-dom to inspect the page and CSS-selected elements, browser-screenshot for visual state, browser-click/browser-type/browser-scroll for interactions, and browser-console-logs for debugging. These tools only control your agent\'s browser pane.',
    'For macOS GUI automation in this Codex Claw session, use only the codex_claw MCP Computer Use tools: computer-use-status, computer-use-request-accessibility, computer-use-list-apps, computer-use-find-apps, computer-use-launch-app, computer-use-focus-app, computer-use-get-app-state, computer-use-click, computer-use-type-text, computer-use-set-value, and computer-use-scroll.',
    'Do not load or use the built-in computer-use skill, node_repl, or sky.* methods: those control Codex-provided Computer Use instead of the Computer Use helper bundled with Codex Claw. Start with computer-use-status; request permission if needed; refresh app state before acting on an indexed element.',
  ].join(' ');
}
