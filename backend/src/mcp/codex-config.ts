import type { Agent, AppPluginSettings } from '@codex-claw/shared/contracts';
import { defaultPluginSettings } from '@codex-claw/shared/settings';
import type { CodexThreadStartExtension } from 'codex-app-sdk/node';
import { codexClawDeveloperInstructions } from './agent-prompts';

export function buildCodexClawMcpConfigOverrides(pluginSettings: AppPluginSettings = defaultPluginSettings): string[] {
  return [
    configOverride('features.apply_patch_streaming_events', true),
    configOverride('mcp_servers.node_repl.enabled', pluginSettings.chromeEnabled),
  ];
}

export function buildCodexClawThreadConfig(
  agent: Agent,
  mcpServerUrl: string | null,
  pluginSettings: AppPluginSettings = defaultPluginSettings,
): CodexThreadStartExtension {
  if (!mcpServerUrl) {
    return {};
  }

  return {
    config: {
      'mcp_servers.codex_claw.url': agentScopedMcpUrl(mcpServerUrl, agent.id),
      'mcp_servers.codex_claw.default_tools_approval_mode': 'approve',
      'mcp_servers.node_repl.enabled': pluginSettings.chromeEnabled,
    },
    developerInstructions: codexClawDeveloperInstructions(agent, pluginSettings),
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
