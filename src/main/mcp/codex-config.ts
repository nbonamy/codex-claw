import type { Agent } from '../../shared/contracts';
import { codexClawDeveloperInstructions } from './agent-prompts';

export function buildCodexClawMcpConfigOverrides(serverUrl: string): string[] {
  return [
    configOverride('mcp_servers.codex_claw.url', serverUrl),
    configOverride('mcp_servers.codex_claw.default_tools_approval_mode', 'approve'),
  ];
}

export function buildCodexClawThreadConfig(agent: Agent, mcpEnabled: boolean): {
  developerInstructions?: string;
} {
  if (!mcpEnabled) {
    return {};
  }

  return {
    developerInstructions: codexClawDeveloperInstructions(agent),
  };
}

function configOverride(path: string, value: string): string {
  return `${path}=${JSON.stringify(value)}`;
}
