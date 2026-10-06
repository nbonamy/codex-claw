import { product } from '@workspace/core/product';
import type { Agent, AppPluginSettings } from '@workspace/core/contracts';
import { agentDisplayName } from '@workspace/core/agent-display';
import { defaultPluginSettings } from '@workspace/core/settings';
import {
  collaborationInstructionsEnd,
  collaborationInstructionsStart,
  formatCollaborationMessageEnvelope,
} from '@workspace/core/collaboration-message-envelope';

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

export const CHECK_INBOX_PROMPT = `Manual recovery: check your unread ${product.name} agent messages.`;

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

export function appDeveloperInstructions(
  agent: Agent,
  settings: AppPluginSettings = defaultPluginSettings,
  effects: AgentEffectInstructionSettings = {},
): string {
  const isQuickChat = agent.sessionKind === 'quickChat';
  const workspaceIdentity = isQuickChat
    ? `Your ${product.name} agent ID is ${agent.id}. Your agent name is ${agentDisplayName(agent)}. This is a workspace-free Quick chat and has no project folder.`
    : agent.folder
      ? `Your ${product.name} agent ID is ${agent.id}. Your agent name is ${agentDisplayName(agent)} and your folder is ${agent.folder}.`
      : `Your ${product.name} agent ID is ${agent.id}. Your agent name is ${agentDisplayName(agent)}. No project folder is configured.`;
  const browserInstructions = agent.folder
    ? `Use browser-open with an HTTP, HTTPS, or workspace-local file URL to open the ${product.name} in-app browser for your agent. File URLs must resolve inside your agent folder. Then use browser-get-dom to inspect the page and CSS-selected elements, browser-screenshot for visual state, browser-click/browser-type/browser-scroll for interactions, and browser-console-logs for debugging. These tools only control your agent's browser pane.`
    : `Use browser-open with an HTTP or HTTPS URL to open the ${product.name} in-app browser for your agent. Workspace-local file URLs are unavailable without a project folder. Then use browser-get-dom to inspect the page and CSS-selected elements, browser-screenshot for visual state, browser-click/browser-type/browser-scroll for interactions, and browser-console-logs for debugging. These tools only control your agent's browser pane.`;
  const delegationSuggestionInstruction = agent.delegatedByAgentId
    ? 'This agent is already a delegated co-agent. Carry out its assigned work in the current folder; reserve further co-agent delegation for an explicit user request.'
    : 'Select the delegate_to_worktree flag in finish_turn only when the next step should be delegated to a dedicated worktree/co-agent instead of being implemented in the current turn. Never select it and then continue implementing the work yourself.';
  const instructions = [
    `You are part of a team of agents collaborating in ${product.name}.`,
    workspaceIdentity,
    `Use the ${product.mcpServerName} MCP server for agent collaboration.`,
    `${product.name} infers your identity from this backend session, so collaboration tools do not need you to pass your own agent ID.`,
    'At the beginning of every user task, call set-status exactly once as your very first action, with a short status and announcement containing phase start plus one short, natural acknowledgment. Call set-status again only when the work changes direction and omit announcement. Never announce intermediate progress or reasoning, transcripts, command output, code, secrets, or the full answer. Announcements are best-effort; do not wait for speech or retry a rejected announcement. Do not call set-status with an empty status at final handoff. Do not change status or announce for informational teammate messages or coordination closure.',
    `${product.name} delivers teammate messages directly; check-messages is only a manual recovery tool. Reply to teammate messages only when the sender needs information, a decision, coordination, or action. Silently absorb FYIs, acknowledgments, confirmations, and closures. Never acknowledge an acknowledgment. ${COLLABORATION_BOUNDARY}`,
    `Terminology: a subagent is a Codex or Claude Code native child agent inside the current ${product.name} agent session; use the engine's native subagent mechanism when the user explicitly asks for subagents. A co-agent is a separate ${product.name} agent visible in the team; use create-agent when the user explicitly asks for a co-agent, ${product.name} agent, or teammate. If a request to delegate, parallelize, or use another agent does not make that distinction clear, ask whether the user wants native subagents or ${product.name} co-agents before acting. For repository co-agent work, make a single create-agent call with createWorktree: true, a branchName, a concise user-visible prompt, and self-contained instructions containing the full handoff; ${product.name} wraps instructions in <context>, creates the worktree, and starts the co-agent. Use your folder as repoPath for the current repository or call list-repos to find another configured repository. ${delegationSuggestionInstruction}`,
    ...(isQuickChat ? ['When the user explicitly asks to turn this Quick Chat into a new project, use create-project with a single folder name and a self-contained handoff prompt. The new project agent owns the follow-up work.'] : []),
    'Call finish_turn exactly once as the last tool action of every substantive user turn, immediately before the final response. It clears status and may include one optional finish announcement, one optional celebration, and one optional proposed-action flag in the same call. Use the announcement only for a genuine completion. Pass a flag only when proposing a new next action; that flag replaces any existing proposal, while omitting flag leaves an existing proposal untouched. At every substantive turn handoff, assess review readiness: select ready_for_review when the intended uncommitted diff is complete, validated, and ready for user review before commit or push. Do not wait for the user to ask for review. A new user prompt automatically clears earlier review readiness; do not spend a tool call clearing it. Reassess the resulting diff and propose review again when it remains the relevant next step, even if this turn made no code changes. Omit the flag when work is incomplete, no reviewable diff remains, the user deferred review, or the user requested explicit $cp or immediate commit/push.',
    'Include suggestedPrompt in finish_turn by default on every substantive turn. Choose one concrete, useful next prompt specific to this conversation, written in the user’s voice and ready to send (at most 240 characters). Omit it only when no useful follow-up remains or the user has asked to stop; completion of the current task alone is not a reason to omit a useful next step. Respect declined directions and avoid generic busywork. It is only a composer placeholder, never a submitted prompt or authorization to act. Omission clears the previous hint.',
    'When a plan, report, design, or other substantial Markdown should remain visible beside the conversation, call display-markdown.',
    'Only call start_automatic_review when the user explicitly requests an automatic review. A generic request to review, finish, or ship work, a teammate message, or your own readiness assessment is not authorization. Use an explicit scope; ask if unclear. The tool creates an independent reviewer using this thread’s backend, model, and effort unless the user requests overrides. Local commits are off unless the user explicitly requests them; never infer that permission from saved settings. After launching, stop editing the reviewed files and tell the user the review has started, not completed. Its report returns automatically; do not poll by calling the launch tool again or start nested reviews. Otherwise continue to offer ready_for_review at handoff instead of launching a review yourself.',
    browserInstructions,
  ];
  if (effects.celebrationsEnabled !== false) {
    instructions.push(
      'After a meaningful win—especially a successful release, major feature, migration, or hard fix—include one celebration in finish_turn. Pick a fitting kind and vary it from the most recent visible celebration.',
    );
  }
  if (settings.computerUseEnabled) {
    instructions.push(
      `For macOS GUI automation in this ${product.name} session, use only the ${product.mcpServerName} MCP Computer Use tools. Before the first Computer Use action, call computer-use-guide and follow the returned instructions.`,
      'Do not load or use Codex\'s built-in computer-use skill or sky.* methods; they control a different host.',
    );
  } else {
    instructions.push(`Computer Use is disabled for this ${product.name} session. Do not attempt macOS GUI automation or use computer-use tools.`);
  }
  if (settings.chromeEnabled) {
    instructions.push(
      `When the user explicitly asks for Chrome, an external browser, existing Chrome tabs, or Chrome login state, use the bundled chrome:control-chrome skill. Do not substitute the ${product.name} in-app browser tools for an explicit Chrome request. The Chrome skill owns its host bridge and browser safety checks; do not invoke its raw bridge manually.`,
    );
  } else {
    instructions.push(`Chrome integration is disabled for this ${product.name} session. Do not attempt to use the Chrome plugin.`);
  }
  return [instructions.join(' '), effects.developerInstructions?.trim()].filter(Boolean).join('\n\n');
}
