import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerClawMcpToolModules,
  resolveClawMcpToolModules,
  type ClawMcpToolModuleProvider,
  type ClawMcpToolRequest,
} from './tool-modules';

export function createClawMcpServer(
  request: ClawMcpToolRequest,
  providers: readonly ClawMcpToolModuleProvider[],
): McpServer {
  const server = new McpServer({
    name: 'codex-claw-mcp',
    version: '1.0.0',
  });
  registerClawMcpToolModules(server, resolveClawMcpToolModules(providers, request));
  return server;
}
