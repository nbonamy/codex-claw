import type { Agent, AppPluginSettings } from '@codex-claw/core/contracts';
import { defaultPluginSettings } from '@codex-claw/core/settings';
import type { CodexThreadStartExtension } from '@codex-app-sdk/backend';
import { codexClawDeveloperInstructions, type AgentEffectInstructionSettings } from './agent-prompts';

export function buildCodexClawMcpConfigOverrides(pluginSettings: AppPluginSettings = defaultPluginSettings): string[] {
  return [
    configOverride('features.apply_patch_streaming_events', true),
    ...(pluginSettings.chromeEnabled
      ? [configOverride('mcp_servers.node_repl.enabled', true)]
      : []),
  ];
}

export function buildCodexClawThreadConfig(
  agent: Agent,
  mcpServerUrl: string | null,
  pluginSettings: AppPluginSettings = defaultPluginSettings,
  effects: AgentEffectInstructionSettings = {},
): CodexThreadStartExtension {
  if (!mcpServerUrl) {
    return {};
  }

  return {
    config: {
      'mcp_servers.codex_claw.url': agentScopedMcpUrl(mcpServerUrl, agent.id),
      'mcp_servers.codex_claw.default_tools_approval_mode': 'approve',
      ...(pluginSettings.chromeEnabled
        ? { 'mcp_servers.node_repl.enabled': true }
        : {}),
    },
    developerInstructions: codexClawDeveloperInstructions(agent, pluginSettings, effects),
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
