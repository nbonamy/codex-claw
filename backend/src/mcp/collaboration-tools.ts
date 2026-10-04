import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { threadFlagIds } from '@codex-claw/core/thread-flags';
import type { ClawMcpAgentCoordinator } from './agent-coordinator';
import { CHECK_INBOX_PROMPT } from './agent-prompts';
import { loggedToolResult, type ClawMcpToolModuleProvider } from './tool-modules';
import { taskContractSchema } from '../persistence/task-schema';

export function createCollaborationToolModuleProvider(
  coordinator: ClawMcpAgentCoordinator,
): ClawMcpToolModuleProvider {
  return {
    id: 'collaboration',
    resolve: ({ agentId }) => ({
      id: 'collaboration',
      register: (server, surface) => registerCollaborationTools(
        server,
        coordinator,
        agentId,
        surface.proposedActions,
      ),
    }),
  };
}

function registerCollaborationTools(
  server: McpServer,
  coordinator: ClawMcpAgentCoordinator,
  callerAgentId: string,
  allowProposedActions: boolean,
): void {
  server.registerTool('list-agents', {
    description: 'List all visible agents with their ID, status, name, and folder.',
    inputSchema: {},
  }, () => loggedToolResult('list-agents', { callerAgentId }, () => coordinator.listAgents(callerAgentId)));

  server.registerTool('send-message', {
    description: 'Send a message to another visible agent by ID or unambiguous name.',
    inputSchema: {
      to: z.string().describe('Recipient agent ID, or agent name when names are unambiguous.'),
      content: z.string().describe('Message content'),
    },
  }, ({ to, content }) => loggedToolResult('send-message', {
    from: callerAgentId,
    to,
    contentLength: content.length,
  }, () => coordinator.sendMessage(callerAgentId, to, content)));

  server.registerTool('check-messages', {
    description: `${CHECK_INBOX_PROMPT} Normal teammate messages are delivered directly as prompts, so only use this if explicitly asked to recover missed messages.`,
    inputSchema: {
      markAsRead: z.boolean().optional().describe('Mark messages as read (default: true)'),
    },
  }, ({ markAsRead }) => loggedToolResult('check-messages', {
    agentId: callerAgentId,
    markAsRead: markAsRead ?? true,
  }, () => coordinator.checkMessages(callerAgentId, markAsRead ?? true)));

  server.registerTool('broadcast-message', {
    description: 'Send a message to all other connected visible agents.',
    inputSchema: {
      content: z.string().describe('Message content'),
    },
  }, ({ content }) => loggedToolResult('broadcast-message', {
    from: callerAgentId,
    contentLength: content.length,
  }, () => coordinator.broadcastMessage(callerAgentId, content)));

  server.registerTool('set-status', {
    description: 'MANDATORY: Set your status so other agents know what you are doing. At the start of a user task, include one short spoken acknowledgment in announcement. Call again only when changing direction and omit announcement. Keep status short and specific; finish_turn owns completion effects.',
    inputSchema: {
      status: z.string().describe('Short status text describing what you are currently doing. finish_turn or the provider turn lifecycle clears it.'),
      announcement: z.object({
        phase: z.literal('start').describe('Marks the acknowledgment as the start of the user task.'),
        text: z.string().trim().min(1).max(160).describe('One brief natural phrase, at most 160 characters.'),
      }).optional().describe('Optional spoken start acknowledgment for the first status update of each user task.'),
    },
  }, ({ status, announcement }) => loggedToolResult('set-status', {
    agentId: callerAgentId,
    statusLength: status.length,
    ...(announcement ? {
      announcementPhase: announcement.phase,
      announcementTextLength: announcement.text.length,
    } : {}),
  }, () => coordinator.setStatus(callerAgentId, status, announcement)));

  const finishTurnDescription = 'MANDATORY final tool action for a substantive user turn. Call exactly once immediately before the final response. It clears the current status and can atomically request one finish announcement, one celebration, and one proposed-action flag. Omitted options leave those effects absent and preserve any existing proposal. Select delegate_to_worktree only when work should be delegated instead of continued here, or ready_for_review only for a complete validated uncommitted diff.';
  const finishTurnEffectsSchema = {
    announcement: z.object({
      text: z.string().trim().min(1).max(160).describe('One brief natural completion phrase, at most 160 characters.'),
    }).optional().describe('Optional spoken completion acknowledgment. The finish phase is implied.'),
    celebration: z.object({
      kind: z.enum(['confetti', 'stars', 'shapes', 'schoolPride']).default('confetti'),
    }).optional().describe('Optional visual celebration for a meaningful win.'),
  };
  if (allowProposedActions) {
    server.registerTool('finish_turn', {
      description: finishTurnDescription,
      inputSchema: {
        flag: z.enum(threadFlagIds).optional().describe('Optional single proposed action to show after this turn. Omit to leave any existing proposal unchanged.'),
        ...finishTurnEffectsSchema,
      },
    }, input => loggedToolResult('finish_turn', {
      agentId: callerAgentId,
      flag: input.flag ?? null,
      announcementTextLength: input.announcement?.text.length ?? null,
      celebration: input.celebration?.kind ?? null,
    }, () => coordinator.finishTurn(callerAgentId, input)));
  } else {
    server.registerTool('finish_turn', {
      description: `${finishTurnDescription} Workflow-managed agents do not expose proposed-action flags.`,
      inputSchema: finishTurnEffectsSchema,
    }, input => loggedToolResult('finish_turn', {
      agentId: callerAgentId,
      announcementTextLength: input.announcement?.text.length ?? null,
      celebration: input.celebration?.kind ?? null,
    }, () => coordinator.finishTurn(callerAgentId, input)));
  }

  server.registerTool('update-work-item', {
    description: 'Update the lifecycle of a backlog work item assigned to you through Codex Claw. Use blocked with a note when you need help, inProgress when work resumes, readyForReview when the user can review the outcome, or completed when the assignment explicitly requires completion.',
    inputSchema: {
      workItemId: z.string().describe('Exact Work item ID from the assignment prompt, for example github:owner/repo#123.'),
      status: z.enum(['blocked', 'completed', 'inProgress', 'readyForReview']).describe('New Claw assignment lifecycle status.'),
      note: z.string().optional().describe('Concise context for the user. Required when status is blocked.'),
    },
  }, ({ workItemId, status, note }) => loggedToolResult('update-work-item', {
    agentId: callerAgentId,
    status,
    workItemIdLength: workItemId.length,
  }, () => coordinator.updateWorkItem(callerAgentId, workItemId, status, note)));

  server.registerTool('list-repos', {
    description: 'List all git repositories in the configured source folder.',
    inputSchema: {},
  }, () => loggedToolResult('list-repos', {
    agentId: callerAgentId,
  }, () => coordinator.listSourceRepositories(callerAgentId)));

  server.registerTool('list-worktrees', {
    description: 'List all discovered worktrees for a source repository.',
    inputSchema: {
      repoPath: z.string().describe('Path to the source repository.'),
    },
  }, ({ repoPath }) => loggedToolResult('list-worktrees', {
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
  }, ({ repoPath, branchName, destinationPath }) => loggedToolResult('create-worktree', {
    agentId: callerAgentId,
    repoPath,
    branchName,
  }, () => coordinator.createSourceWorktree(callerAgentId, { repoPath, branchName, destinationPath })));

  server.registerTool('create-agent', {
    description: 'Create a new Codex Claw co-agent in your team, optionally in an isolated worktree. Model and reasoning effort inherit from the caller when the backend matches unless explicitly overridden. Provide an initial prompt to start the co-agent immediately. Use list-repos to find another configured repository before delegating cross-repository work.',
    inputSchema: {
      requestId: z.string().trim().min(1).max(200).optional().describe('Required in task mode. Reuse the same stable ID when retrying this creation call.'),
      task: taskContractSchema.optional().describe('Durable assignment contract. Requires prompt and requestId. Returns taskId after startup acceptance, not task completion; inspect or wait with wait-tasks.'),
      name: z.string().optional().describe('Optional custom name. When omitted, the agent displays its branch or folder name.'),
      backend: z.enum(['codex', 'claude']).optional().describe('Backend: codex or claude. Defaults to the caller’s backend.'),
      model: z.string().optional().describe('Optional model override. Inherits the caller model when the backend matches.'),
      reasoningEffort: z.string().optional().describe('Optional reasoning effort override. Inherits the caller effort when the backend matches.'),
      repoPath: z.string().describe('Repository or worktree folder path.'),
      createWorktree: z.boolean().optional().describe('If true, create a new worktree from repoPath before creating the agent.'),
      branchName: z.string().optional().describe('Branch name for the new worktree. Required when createWorktree is true.'),
      destinationPath: z.string().optional().describe('Optional destination path for the new worktree.'),
      prompt: z.string().optional().describe('Optional initial instructions. When provided, Claw starts the new agent immediately and waits until the handoff is accepted.'),
    },
  }, ({ name, backend, model, reasoningEffort, repoPath, createWorktree, branchName, destinationPath, prompt, task, requestId }) => loggedToolResult('create-agent', {
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
    task,
    requestId,
  })));

  server.registerTool('display-markdown', {
    description: 'Display Markdown in the Codex Claw side panel. Provide exactly one of path or markdown. Use path for Markdown files in your agent folder; use markdown for inline generated content.',
    inputSchema: {
      path: z.string().optional().describe('Markdown file path relative to your agent folder, or an absolute path inside it.'),
      markdown: z.string().optional().describe('Inline Markdown content to display.'),
      title: z.string().optional().describe('Optional title for the side panel.'),
    },
  }, ({ path, markdown, title }) => loggedToolResult('display-markdown', {
    agentId: callerAgentId,
    hasPath: Boolean(path),
    hasMarkdown: Boolean(markdown),
    titleLength: title?.length ?? 0,
  }, () => coordinator.displayMarkdown(callerAgentId, { path, markdown, title })));
}
