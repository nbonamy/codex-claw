import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { logMain, warnMain } from '../log';
import type { ClawMcpAgentCoordinator } from './agent-coordinator';
import { McpToolError } from './agent-coordinator';
import { CHECK_INBOX_PROMPT } from './agent-prompts';
import { errorToolResult, structuredToolResult } from './tool-result';
import { registerComputerUseTools, type ComputerUseClient } from './computer-use-tools';
import { registerInAppBrowserTools, type InAppBrowserClient } from './browser-tools';
import { registerReviewTools } from './review-tools';
import type { ReviewToolContext } from '../review/review-tool-registry';

export function createCodexClawMcpServer(
  coordinator: ClawMcpAgentCoordinator,
  callerAgentId: string,
  computerUse?: ComputerUseClient,
  browser?: InAppBrowserClient,
  reviewContext?: ReviewToolContext,
): McpServer {
  const server = new McpServer({
    name: 'codex-claw-mcp',
    version: '1.0.0',
  });

  server.registerTool('list-agents', {
    description: 'List all visible agents with their ID, status, name, and folder.',
    inputSchema: {},
  }, () => toolResult('list-agents', { callerAgentId }, () => coordinator.listAgents(callerAgentId)));

  server.registerTool('send-message', {
    description: 'Send a message to another visible agent by ID or unambiguous name.',
    inputSchema: {
      to: z.string().describe('Recipient agent ID, or agent name when names are unambiguous.'),
      content: z.string().describe('Message content'),
    },
  }, ({ to, content }) => toolResult('send-message', {
    from: callerAgentId,
    to,
    contentLength: content.length,
  }, () => coordinator.sendMessage(callerAgentId, to, content)));

  server.registerTool('check-messages', {
    description: `${CHECK_INBOX_PROMPT} Normal teammate messages are delivered directly as prompts, so only use this if explicitly asked to recover missed messages.`,
    inputSchema: {
      markAsRead: z.boolean().optional().describe('Mark messages as read (default: true)'),
    },
  }, ({ markAsRead }) => toolResult('check-messages', {
    agentId: callerAgentId,
    markAsRead: markAsRead ?? true,
  }, () => coordinator.checkMessages(callerAgentId, markAsRead ?? true)));

  server.registerTool('broadcast-message', {
    description: 'Send a message to all other connected visible agents.',
    inputSchema: {
      content: z.string().describe('Message content'),
    },
  }, ({ content }) => toolResult('broadcast-message', {
    from: callerAgentId,
    contentLength: content.length,
  }, () => coordinator.broadcastMessage(callerAgentId, content)));

  server.registerTool('set-status', {
    description: "MANDATORY: Set your status so other agents know what you are doing. Call before starting any task, after completing it, and when changing direction. Keep it short and specific (e.g. 'Implementing auth module', 'Running tests', 'Done - PR ready'). Use empty string to clear.",
    inputSchema: {
      status: z.string().describe('Short status text describing what you are currently doing. Use empty string to clear.'),
    },
  }, ({ status }) => toolResult('set-status', {
    agentId: callerAgentId,
    statusLength: status.length,
  }, () => coordinator.setStatus(callerAgentId, status)));

  server.registerTool('toggle_thread_flag', {
    description: 'Set or clear a predefined, typed thread flag that Codex Claw may present as a native affordance. Set delegate_to_worktree when implementation can be delegated to a dedicated worktree/co-agent; clear it when that is no longer appropriate. This flag takes no payload.',
    inputSchema: {
      id: z.enum(['delegate_to_worktree']).describe('Predefined semantic thread flag.'),
      value: z.boolean().describe('True sets the flag; false clears it.'),
      payload: z.unknown().optional().describe('Optional kind-specific payload. delegate_to_worktree does not accept one.'),
    },
  }, ({ id, value, payload }) => toolResult('toggle_thread_flag', {
    agentId: callerAgentId,
    id,
    value,
    hasPayload: payload !== undefined,
  }, () => coordinator.toggleThreadFlag(callerAgentId, { id, value, payload })));

  server.registerTool('celebrate', {
    description: 'Request a transient visual celebration in Codex Claw when celebrations are enabled by the user. Confetti, stars, and shapes fit ordinary wins, while schoolPride marks a major team achievement.',
    inputSchema: {
      kind: z.enum(['confetti', 'stars', 'shapes', 'schoolPride']).default('confetti').describe('Visual celebration style; choose deliberately and vary it across wins.'),
    },
  }, ({ kind }) => toolResult('celebrate', {
    agentId: callerAgentId,
    kind,
  }, () => coordinator.celebrate(callerAgentId, kind)));

  server.registerTool('announce', {
    description: 'Queue one brief spoken acknowledgment when spoken acknowledgments are enabled by the user. The text must be one short, natural sentence, never intermediate reasoning, command output, code, secrets, or the full answer. This is best-effort and returns as soon as playback is queued.',
    inputSchema: {
      phase: z.enum(['start', 'finish']).describe('Whether this acknowledges starting or genuinely finishing the user task.'),
      text: z.string().trim().min(1).max(160).describe('One brief natural phrase, at most 160 characters.'),
    },
  }, ({ phase, text }) => toolResult('announce', {
    agentId: callerAgentId,
    phase,
    textLength: text.length,
  }, () => coordinator.announce(callerAgentId, phase, text)));

  server.registerTool('update-work-item', {
    description: 'Update the lifecycle of a backlog work item assigned to you through Codex Claw. Use blocked with a note when you need help, inProgress when work resumes, readyForReview when the user can review the outcome, or completed when the assignment explicitly requires completion.',
    inputSchema: {
      workItemId: z.string().describe('Exact Work item ID from the assignment prompt, for example github:owner/repo#123.'),
      status: z.enum(['blocked', 'completed', 'inProgress', 'readyForReview']).describe('New Claw assignment lifecycle status.'),
      note: z.string().optional().describe('Concise context for the user. Required when status is blocked.'),
    },
  }, ({ workItemId, status, note }) => toolResult('update-work-item', {
    agentId: callerAgentId,
    status,
    workItemIdLength: workItemId.length,
  }, () => coordinator.updateWorkItem(callerAgentId, workItemId, status, note)));

  server.registerTool('list-repos', {
    description: 'List all git repositories in the configured source folder.',
    inputSchema: {},
  }, () => toolResult('list-repos', {
    agentId: callerAgentId,
  }, () => coordinator.listSourceRepositories(callerAgentId)));

  server.registerTool('list-worktrees', {
    description: 'List all discovered worktrees for a source repository.',
    inputSchema: {
      repoPath: z.string().describe('Path to the source repository.'),
    },
  }, ({ repoPath }) => toolResult('list-worktrees', {
    agentId: callerAgentId,
    repoPath,
  }, () => coordinator.listSourceWorktrees(callerAgentId, repoPath)));

  server.registerTool('create-worktree', {
    description: 'Create a new git worktree from a source repository and return the created folder.',
    inputSchema: {
      repoPath: z.string().describe('Path to the source repository.'),
      branchName: z.string().describe('Branch name for the new worktree.'),
      destinationPath: z.string().optional().describe('Optional destination path. Defaults to a sibling folder named <repo>-<branch>.'),
    },
  }, ({ repoPath, branchName, destinationPath }) => toolResult('create-worktree', {
    agentId: callerAgentId,
    repoPath,
    branchName,
  }, () => coordinator.createSourceWorktree(callerAgentId, { repoPath, branchName, destinationPath })));

  server.registerTool('create-agent', {
    description: 'Create a new Codex Claw co-agent in your team, optionally in an isolated worktree. Model and reasoning effort inherit from the caller when the backend matches unless explicitly overridden. Provide an initial prompt to start the co-agent immediately. Use list-repos to find another configured repository before delegating cross-repository work.',
    inputSchema: {
      name: z.string().optional().describe('Optional custom name. When omitted, the agent displays its branch or folder name.'),
      backend: z.enum(['codex', 'claude']).optional().describe('Backend: codex or claude. Defaults to codex.'),
      model: z.string().optional().describe('Optional model override. Inherits the caller model when the backend matches.'),
      reasoningEffort: z.string().optional().describe('Optional reasoning effort override. Inherits the caller effort when the backend matches.'),
      repoPath: z.string().describe('Repository or worktree folder path.'),
      createWorktree: z.boolean().optional().describe('If true, create a new worktree from repoPath before creating the agent.'),
      branchName: z.string().optional().describe('Branch name for the new worktree. Required when createWorktree is true.'),
      destinationPath: z.string().optional().describe('Optional destination path for the new worktree.'),
      prompt: z.string().optional().describe('Optional initial instructions. When provided, Claw starts the new agent immediately and waits until the handoff is accepted.'),
    },
  }, ({ name, backend, model, reasoningEffort, repoPath, createWorktree, branchName, destinationPath, prompt }) => toolResult('create-agent', {
    agentId: callerAgentId,
    repoPath,
    createWorktree: createWorktree === true,
  }, () => coordinator.createAgent(callerAgentId, {
    name,
    backend,
    model,
    reasoningEffort,
    repoPath,
    createWorktree,
    branchName,
    destinationPath,
    prompt,
  })));

  server.registerTool('display-markdown', {
    description: 'Display Markdown in the Codex Claw side panel. Provide exactly one of path or markdown. Use path for Markdown files in your agent folder; use markdown for inline generated content.',
    inputSchema: {
      path: z.string().optional().describe('Markdown file path relative to your agent folder, or an absolute path inside it.'),
      markdown: z.string().optional().describe('Inline Markdown content to display.'),
      title: z.string().optional().describe('Optional title for the side panel.'),
    },
  }, ({ path, markdown, title }) => toolResult('display-markdown', {
    agentId: callerAgentId,
    hasPath: Boolean(path),
    hasMarkdown: Boolean(markdown),
    titleLength: title?.length ?? 0,
  }, () => coordinator.displayMarkdown(callerAgentId, { path, markdown, title })));

  if (computerUse) {
    registerComputerUseTools(server, computerUse);
  }
  if (browser) registerInAppBrowserTools(server, callerAgentId, browser);
  if (reviewContext) registerReviewTools(server, reviewContext);

  return server;
}

async function toolResult(tool: string, details: Record<string, unknown>, run: () => unknown): Promise<CallToolResult> {
  logMain('mcp-tool', 'start', { tool, ...details });
  try {
    const result = structuredToolResult(await run());
    logMain('mcp-tool', 'success', {
      tool,
      structuredKeys: Object.keys(result.structuredContent ?? {}),
    });
    return result;
  } catch (error) {
    const message = error instanceof McpToolError || error instanceof Error ? error.message : String(error);
    warnMain('mcp-tool', 'error', { tool, message });
    return errorToolResult(message);
  }
}
