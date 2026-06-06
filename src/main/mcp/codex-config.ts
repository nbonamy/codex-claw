import type { Agent } from '../../shared/contracts';
import { codexClawDeveloperInstructions } from './agent-prompts';

export function buildCodexClawMcpConfigOverrides(serverUrl: string): string[] {
  return [
    configOverride('features.apply_patch_streaming_events', true),
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

function configOverride(path: string, value: boolean | string): string {
  return `${path}=${JSON.stringify(value)}`;
}
