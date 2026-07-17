import type { Agent } from '@codex-claw/shared/contracts';
import type { v2 } from 'codex-app-sdk/codex';
import { codexClawDeveloperInstructions } from './agent-prompts';

export function buildCodexClawMcpConfigOverrides(): string[] {
  return [
    configOverride('features.apply_patch_streaming_events', true),
  ];
}

export function buildCodexClawThreadConfig(agent: Agent, mcpServerUrl: string | null): {
  config?: NonNullable<v2.ThreadStartParams['config']>;
  developerInstructions?: string;
} {
  if (!mcpServerUrl) {
    return {};
  }

  return {
    config: {
      'mcp_servers.codex_claw.url': agentScopedMcpUrl(mcpServerUrl, agent.id),
      'mcp_servers.codex_claw.default_tools_approval_mode': 'approve',
    },
    developerInstructions: codexClawDeveloperInstructions(agent),
  };
}

export function agentScopedMcpUrl(serverUrl: string, agentId: string): string {
  const url = new URL(serverUrl);
  url.searchParams.set('agentId', agentId);
  return url.toString();
}

function configOverride(path: string, value: boolean | string): string {
  return `${path}=${JSON.stringify(value)}`;
}
