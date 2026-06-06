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

  return server;
}

function toolResult(tool: string, details: Record<string, unknown>, run: () => unknown): CallToolResult {
  logMain('mcp-tool', 'start', { tool, ...details });
  try {
    const result = structuredToolResult(run());
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
