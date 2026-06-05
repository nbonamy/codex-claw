import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { logMain, warnMain } from '../log';
import type { ClawMcpAgentCoordinator } from './agent-coordinator';
import { McpToolError } from './agent-coordinator';
import { CHECK_INBOX_PROMPT } from './agent-prompts';
import { errorToolResult, structuredToolResult } from './tool-result';

export function createCodexClawMcpServer(coordinator: ClawMcpAgentCoordinator): McpServer {
  const server = new McpServer({
    name: 'codex-claw-mcp',
    version: '1.0.0',
  });

  server.registerTool('register-agent', {
    description: 'Register this agent with the Codex Claw team. Call this first before using other collaboration tools.',
    inputSchema: {
      agentId: z.string().describe('The agent ID provided by Codex Claw'),
      sessionId: z.string().optional().describe('Your internal session ID.'),
    },
  }, ({ agentId, sessionId }) => toolResult('register-agent', {
    agentId,
    hasSessionId: Boolean(sessionId),
  }, () => coordinator.registerAgent(agentId, sessionId)));

  server.registerTool('list-agents', {
    description: 'List all registered agents with their status (name, folder, working/idle)',
    inputSchema: {
      agentId: z.string().describe('Your agent ID'),
    },
  }, ({ agentId }) => toolResult('list-agents', { agentId }, () => coordinator.listAgents(agentId)));

  server.registerTool('send-message', {
    description: 'Send a message to another agent by name or ID',
    inputSchema: {
      from: z.string().describe('Your agent ID'),
      to: z.string().describe('Recipient agent name or ID'),
      content: z.string().describe('Message content'),
    },
  }, ({ from, to, content }) => toolResult('send-message', {
    from,
    to,
    contentLength: content.length,
  }, () => coordinator.sendMessage(from, to, content)));

  server.registerTool('check-messages', {
    description: CHECK_INBOX_PROMPT,
    inputSchema: {
      agentId: z.string().describe('Your agent ID'),
      markAsRead: z.boolean().optional().describe('Mark messages as read (default: true)'),
    },
  }, ({ agentId, markAsRead }) => toolResult('check-messages', {
    agentId,
    markAsRead: markAsRead ?? true,
  }, () => coordinator.checkMessages(agentId, markAsRead ?? true)));

  server.registerTool('broadcast-message', {
    description: 'Send a message to all other registered agents',
    inputSchema: {
      from: z.string().describe('Your agent ID'),
      content: z.string().describe('Message content'),
    },
  }, ({ from, content }) => toolResult('broadcast-message', {
    from,
    contentLength: content.length,
  }, () => coordinator.broadcastMessage(from, content)));

  server.registerTool('set-status', {
    description: "MANDATORY: Set your status so other agents know what you are doing. Call before starting any task, after completing it, and when changing direction. Keep it short and specific (e.g. 'Implementing auth module', 'Running tests', 'Done - PR ready'). Use empty string to clear.",
    inputSchema: {
      agentId: z.string().describe('Your agent ID'),
      status: z.string().describe('Short status text describing what you are currently doing. Use empty string to clear.'),
    },
  }, ({ agentId, status }) => toolResult('set-status', {
    agentId,
    statusLength: status.length,
  }, () => coordinator.setStatus(agentId, status)));

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
