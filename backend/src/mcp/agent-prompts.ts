import type { Agent, AppPluginSettings } from '@codex-claw/core/contracts';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { defaultPluginSettings } from '@codex-claw/core/settings';
import {
  collaborationInstructionsEnd,
  collaborationInstructionsStart,
  formatCollaborationMessageEnvelope,
} from '@codex-claw/core/collaboration-message-envelope';

export type MessageInfo = {
  from: string;
  fromId: string;
  timestamp: string;
  content: string;
};

export const CHECK_INBOX_PROMPT = 'Manual recovery: check your unread Codex Claw agent messages.';

const COLLABORATION_BOUNDARY = [
  'Do not proactively message other agents.',
  'Use list-agents, send-message, or broadcast-message only when the user explicitly requests coordination or a concrete cross-repository contract blocker requires a decision or action from a specific agent.',
  'Never send FYIs, progress reports, acknowledgments, commit/hash notices, or "no action needed" messages.',
].join(' ');

const SINGLE_MESSAGE_INSTRUCTION = [
  'Handle this teammate message directly without asking the user for confirmation.',
  'Reply only if the sender needs information, a decision, coordination, or action.',
  'Otherwise do not reply or change status.',
].join(' ');

const MULTIPLE_MESSAGES_INSTRUCTION = [
  'Handle these teammate messages directly without asking the user for confirmation.',
  'Reply only to senders who need information, a decision, coordination, or action.',
  'Otherwise do not reply or change status.',
].join(' ');

export function agentMessagesPrompt(messages: MessageInfo[]): string {
  return [
    formatCollaborationMessageEnvelope(messages.map((message) => ({
      senderName: message.from,
      senderId: message.fromId,
      sentAt: message.timestamp,
      content: message.content,
    }))),
    '',
    collaborationInstructionsStart,
    messages.length === 1 ? SINGLE_MESSAGE_INSTRUCTION : MULTIPLE_MESSAGES_INSTRUCTION,
    collaborationInstructionsEnd,
  ].join('\n');
}

export function codexClawDeveloperInstructions(agent: Agent, settings: AppPluginSettings = defaultPluginSettings): string {
  const workspaceIdentity = agent.folder
    ? `Your Codex Claw agent ID is ${agent.id}. Your agent name is ${agentDisplayName(agent)} and your folder is ${agent.folder}.`
    : `Your Codex Claw agent ID is ${agent.id}. Your agent name is ${agentDisplayName(agent)}. This is a workspace-free Quick chat and has no project folder.`;
  const browserInstructions = agent.folder
    ? 'Use browser-open with an HTTP, HTTPS, or workspace-local file URL to open the Codex Claw in-app browser for your agent. File URLs must resolve inside your agent folder. Then use browser-get-dom to inspect the page and CSS-selected elements, browser-screenshot for visual state, browser-click/browser-type/browser-scroll for interactions, and browser-console-logs for debugging. These tools only control your agent\'s browser pane.'
    : 'Use browser-open with an HTTP or HTTPS URL to open the Codex Claw in-app browser for your agent. Workspace-local file URLs are unavailable in this Quick chat. Then use browser-get-dom to inspect the page and CSS-selected elements, browser-screenshot for visual state, browser-click/browser-type/browser-scroll for interactions, and browser-console-logs for debugging. These tools only control your agent\'s browser pane.';
  const instructions = [
    'You are part of a team of agents collaborating in Codex Claw.',
    workspaceIdentity,
    'Use the codex_claw MCP server for agent collaboration.',
    'Codex Claw infers your identity from this backend session, so collaboration tools do not need you to pass your own agent ID.',
    'MANDATORY: before starting substantive work, changing direction, or finishing substantive work, call set-status with a short status. Use an empty status to clear it. Do not change status for informational teammate messages or coordination closure.',
    `Claw delivers teammate messages directly; check-messages is only a manual recovery tool. Reply to teammate messages only when the sender needs information, a decision, coordination, or action. Silently absorb FYIs, acknowledgments, confirmations, and closures. Never acknowledge an acknowledgment. ${COLLABORATION_BOUNDARY}`,
    'Use display-markdown to show Markdown files or generated Markdown in the Codex Claw side panel when the user should inspect structured content.',
    browserInstructions,
  ];
  if (settings.computerUseEnabled) {
    instructions.push(
      'For macOS GUI automation in this Codex Claw session, use only the codex_claw MCP Computer Use tools: computer-use-status, computer-use-request-accessibility, computer-use-request-screen-recording, computer-use-list-apps, computer-use-find-apps, computer-use-launch-app, computer-use-focus-app, computer-use-get-app-state, computer-use-screenshot, computer-use-click, computer-use-move, computer-use-type-text, computer-use-set-value, and computer-use-scroll.',
      'Do not load or use the built-in computer-use skill or sky.* methods: those control Codex-provided Computer Use instead of the Computer Use helper bundled with Codex Claw. Start with computer-use-status; request permission if needed; refresh app state before acting on an indexed element.',
      'Coordinate actions use absolute macOS logical screen points from the top-left of the main display, not window-relative positions or screenshot pixels. Read the screenshot result\'s absolute bounds and scale factor before converting an image point. Use a screen screenshot when interacting with the menu bar.',
      'Computer Use clicks default to AXPress. Use physical=true only for a visible Electron/web control known to require real mouse input, or after AXPress reports success but refreshed state confirms the UI did not change. A physical click requires the target app to be frontmost and unobstructed.',
      'Use computer-use-move only for hover behavior or native menu tracking. It intentionally moves the user\'s real pointer; physical clicks restore the pointer after clicking.',
    );
  } else {
    instructions.push('Computer Use is disabled for this Codex Claw session. Do not attempt macOS GUI automation or use computer-use tools.');
  }
  if (settings.chromeEnabled) {
    instructions.push(
      'When the user explicitly asks for Chrome, an external browser, existing Chrome tabs, or Chrome login state, use the bundled chrome:control-chrome skill. Do not substitute the Claw in-app browser tools for an explicit Chrome request. The Chrome skill owns its host bridge and browser safety checks; do not invoke its raw bridge manually.',
    );
  } else {
    instructions.push('Chrome integration is disabled for this Codex Claw session. Do not attempt to use the Chrome plugin.');
  }
  return instructions.join(' ');
}
