import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logMain, warnMain } from '../log';
import { McpToolError } from './agent-coordinator';
import { errorToolResult, structuredToolResult } from './tool-result';

export type ClawMcpToolRequest = {
  agentId: string;
  url: URL;
};

export type ClawMcpToolModule = {
  id: string;
  owns?: {
    proposedActions?: true;
  };
  register(server: McpServer, surface: ClawMcpToolSurface): void;
};

type ClawMcpToolSurface = {
  proposedActions: boolean;
};

export type ClawMcpToolModuleProvider = {
  id: string;
  resolve(request: ClawMcpToolRequest): ClawMcpToolModule | undefined;
};

export function resolveClawMcpToolModules(
  providers: readonly ClawMcpToolModuleProvider[],
  request: ClawMcpToolRequest,
): ClawMcpToolModule[] {
  const providerIds = new Set<string>();
  const moduleIds = new Set<string>();
  const modules: ClawMcpToolModule[] = [];

  for (const provider of providers) {
    if (providerIds.has(provider.id)) throw new Error(`Duplicate MCP tool module provider '${provider.id}'.`);
    providerIds.add(provider.id);
    const module = provider.resolve(request);
    if (!module) continue;
    if (moduleIds.has(module.id)) throw new Error(`Duplicate MCP tool module '${module.id}'.`);
    moduleIds.add(module.id);
    modules.push(module);
  }

  return modules;
}

export function registerClawMcpToolModules(server: McpServer, modules: readonly ClawMcpToolModule[]): void {
  const surface: ClawMcpToolSurface = {
    proposedActions: !modules.some(module => module.owns?.proposedActions),
  };
  for (const module of modules) module.register(server, surface);
}

export async function loggedToolResult(
  tool: string,
  details: Record<string, unknown>,
  run: () => unknown,
): Promise<CallToolResult> {
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
