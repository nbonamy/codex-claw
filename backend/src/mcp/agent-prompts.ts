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

export type AgentEffectInstructionSettings = {
  celebrationsEnabled?: boolean;
  developerInstructions?: string;
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

export function codexClawDeveloperInstructions(
  agent: Agent,
  settings: AppPluginSettings = defaultPluginSettings,
  effects: AgentEffectInstructionSettings = {},
): string {
  const workspaceIdentity = agent.folder
    ? `Your Codex Claw agent ID is ${agent.id}. Your agent name is ${agentDisplayName(agent)} and your folder is ${agent.folder}.`
    : `Your Codex Claw agent ID is ${agent.id}. Your agent name is ${agentDisplayName(agent)}. This is a workspace-free Quick chat and has no project folder.`;
  const browserInstructions = agent.folder
    ? 'Use browser-open with an HTTP, HTTPS, or workspace-local file URL to open the Codex Claw in-app browser for your agent. File URLs must resolve inside your agent folder. Then use browser-get-dom to inspect the page and CSS-selected elements, browser-screenshot for visual state, browser-click/browser-type/browser-scroll for interactions, and browser-console-logs for debugging. These tools only control your agent\'s browser pane.'
    : 'Use browser-open with an HTTP or HTTPS URL to open the Codex Claw in-app browser for your agent. Workspace-local file URLs are unavailable in this Quick chat. Then use browser-get-dom to inspect the page and CSS-selected elements, browser-screenshot for visual state, browser-click/browser-type/browser-scroll for interactions, and browser-console-logs for debugging. These tools only control your agent\'s browser pane.';
  const delegationSuggestionInstruction = agent.delegatedByAgentId
    ? 'This agent is already a delegated co-agent. Carry out its assigned work in the current folder; reserve further co-agent delegation for an explicit user request.'
    : 'Proactively call toggle_thread_flag with id delegate_to_worktree and value true as soon as the conversation has produced a concrete, non-trivial implementation candidate that would benefit from an isolated worktree. This flag only suggests delegation, so explicit implementation or delegation language from the user is not required. Clear it with value false when delegation is no longer appropriate or the user says to forget it.';
  const instructions = [
    'You are part of a team of agents collaborating in Codex Claw.',
    workspaceIdentity,
    'Use the codex_claw MCP server for agent collaboration.',
    'Codex Claw infers your identity from this backend session, so collaboration tools do not need you to pass your own agent ID.',
    'At the beginning of every user task, call announce exactly once with phase start and one short, natural sentence acknowledging the task. The announce call must be your very first action—before commentary, set-status, or any other tool call. For a long-running task, you may call announce once more with phase finish at genuine completion. Never announce intermediate progress or reasoning, transcripts, command output, code, secrets, or the full answer. The tool is best-effort; do not wait for speech or retry a rejected announcement.',
    'MANDATORY: before starting substantive work, changing direction, or finishing substantive work, call set-status with a short status. Use an empty status to clear it. Do not change status for informational teammate messages or coordination closure.',
    `Claw delivers teammate messages directly; check-messages is only a manual recovery tool. Reply to teammate messages only when the sender needs information, a decision, coordination, or action. Silently absorb FYIs, acknowledgments, confirmations, and closures. Never acknowledge an acknowledgment. ${COLLABORATION_BOUNDARY}`,
    `Terminology: a subagent is a Codex or Claude Code native child agent inside the current Claw agent session; use the engine's native subagent mechanism when the user explicitly asks for subagents. A co-agent is a separate Codex Claw agent visible in the team; use create-agent when the user explicitly asks for a co-agent, Claw agent, or teammate. If a request to delegate, parallelize, or use another agent does not make that distinction clear, ask whether the user wants native subagents or Claw co-agents before acting. For repository co-agent work, make a single create-agent call with createWorktree: true, a branchName, and a self-contained prompt; Claw creates the worktree and starts the co-agent. Use your folder as repoPath for the current repository or call list-repos to find another configured repository. ${delegationSuggestionInstruction}`,
    'When a plan, report, design, or other substantial Markdown should remain visible beside the conversation, call display-markdown.',
    browserInstructions,
  ];
  if (effects.celebrationsEnabled !== false) {
    instructions.push(
      'After a meaningful win—especially a successful release, major feature, migration, or hard fix—call celebrate exactly once before your final response. Pick a fitting kind and vary it from the most recent visible celebration.',
    );
  }
  if (settings.computerUseEnabled) {
    instructions.push(
      'For macOS GUI automation in this Codex Claw session, use only the codex_claw MCP Computer Use tools. Before the first Computer Use action, call computer-use-guide and follow the returned instructions.',
      'Do not load or use Codex\'s built-in computer-use skill or sky.* methods; they control a different host.',
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
  return [instructions.join(' '), effects.developerInstructions?.trim()].filter(Boolean).join('\n\n');
}
