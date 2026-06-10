import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { logMain, warnMain } from '../log';
import type { ClawMcpAgentCoordinator } from './agent-coordinator';
import { McpToolError } from './agent-coordinator';
import { CHECK_INBOX_PROMPT } from './agent-prompts';
import { errorToolResult, structuredToolResult } from './tool-result';

export function createCodexClawMcpServer(coordinator: ClawMcpAgentCoordinator, callerAgentId: string): McpServer {
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
    description: CHECK_INBOX_PROMPT,
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

  server.registerTool('mark-work-item-completed', {
    description: 'Mark one of your assigned backlog work items as completed. Call this when you have finished the work, using the exact workItemId from the assignment prompt. If the result asks for completion instructions, follow them and call again with confirmCompletion true.',
    inputSchema: {
      workItemId: z.string().describe('Exact Work item ID from the assignment prompt, for example github:owner/repo#123.'),
      confirmCompletion: z.boolean().optional().describe('Set to true only after following any completion instructions returned by the first call.'),
    },
  }, ({ workItemId, confirmCompletion }) => toolResult('mark-work-item-completed', {
    agentId: callerAgentId,
    confirmCompletion: confirmCompletion === true,
    workItemIdLength: workItemId.length,
  }, () => coordinator.markWorkItemCompleted(callerAgentId, workItemId, confirmCompletion === true)));

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
    description: 'Create a new Codex Claw agent in your team. Can optionally create a new git worktree first.',
    inputSchema: {
      name: z.string().optional().describe('Name for the agent. Defaults to the folder basename.'),
      avatar: z.string().optional().describe('Avatar text or emoji for the agent.'),
      backend: z.enum(['codex', 'claude']).optional().describe('Backend: codex or claude. Defaults to codex.'),
      repoPath: z.string().describe('Repository or worktree folder path.'),
      createWorktree: z.boolean().optional().describe('If true, create a new worktree from repoPath before creating the agent.'),
      branchName: z.string().optional().describe('Branch name for the new worktree. Required when createWorktree is true.'),
      destinationPath: z.string().optional().describe('Optional destination path for the new worktree.'),
    },
  }, ({ name, avatar, backend, repoPath, createWorktree, branchName, destinationPath }) => toolResult('create-agent', {
    agentId: callerAgentId,
    repoPath,
    createWorktree: createWorktree === true,
  }, () => coordinator.createAgent(callerAgentId, {
    name,
    avatar,
    backend,
    repoPath,
    createWorktree,
    branchName,
    destinationPath,
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
