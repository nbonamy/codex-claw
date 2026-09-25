import { describe, expect, it } from 'vitest';
import type { Agent } from '@codex-claw/core/contracts';
import { agentScopedMcpUrl, buildCodexClawMcpConfigOverrides, buildCodexClawThreadConfig } from '../codex-config';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/codex-claw',
  backend: 'codex',
  backendDefaults: { kind: 'codex' },
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('codex-config', () => {
  it('enables required process-wide Codex features without creating a partial MCP server config', () => {
    expect(buildCodexClawMcpConfigOverrides()).toStrictEqual([
      'features.apply_patch_streaming_events=true',
      'features.memories=true',
      'plugins."github@openai-curated-remote".enabled=false',
      'plugins."unified-computer-use@openai-bundled".enabled=false',
    ]);
  });

  it('disables the global GitHub plugin only in Claw app-server', () => {
    expect(buildCodexClawMcpConfigOverrides()).toContain(
      'plugins."github@openai-curated-remote".enabled=false',
    );
  });

  it('enables the host bridge only when Chrome is enabled', () => {
    expect(buildCodexClawMcpConfigOverrides({ computerUseEnabled: false, chromeEnabled: true })).toContain(
      'mcp_servers.node_repl.enabled=true',
    );
  });

  it('keeps Claw MCP config and agent instructions thread-scoped', () => {
    expect(buildCodexClawThreadConfig(agent, null)).toStrictEqual({});
    expect(buildCodexClawThreadConfig(agent, 'http://127.0.0.1:8767/mcp')).toStrictEqual({
      config: {
        'mcp_servers.codex_claw.url': 'http://127.0.0.1:8767/mcp?agentId=agent-dina',
        'mcp_servers.codex_claw.default_tools_approval_mode': 'approve',
      },
      developerInstructions: expect.stringContaining('Your Codex Claw agent ID is agent-dina.'),
    });
  });

  it('adds connected hosted MCP servers without auto-approving their tools', () => {
    const config = buildCodexClawThreadConfig(
      agent,
      'http://127.0.0.1:8767/mcp',
      undefined,
      {},
      { github: 'http://127.0.0.1:8767/mcp/providers/github' },
    );

    expect(config.config).toMatchObject({
      'mcp_servers.github.url': 'http://127.0.0.1:8767/mcp/providers/github?agentId=agent-dina',
      'apps.connector_76869538009648d5b282a4bb21c3d157.enabled': false,
    });
    expect(config.config).not.toHaveProperty('mcp_servers.github.default_tools_approval_mode');
  });

  it('keeps the ChatGPT GitHub connector available when Claw has no GitHub MCP connection', () => {
    const config = buildCodexClawThreadConfig(
      agent,
      'http://127.0.0.1:8767/mcp',
      undefined,
      {},
      {},
    );

    expect(config.config).not.toHaveProperty(
      'apps.connector_76869538009648d5b282a4bb21c3d157.enabled',
    );
    expect(config.config).not.toHaveProperty('mcp_servers.github.url');
  });

  it('directs GUI automation to Claw MCP rather than the built-in Codex Computer Use skill', () => {
    const config = buildCodexClawThreadConfig(agent, 'http://127.0.0.1:8767/mcp', {
      computerUseEnabled: true,
      chromeEnabled: true,
    });

    expect(config.developerInstructions).toContain('computer-use-guide');
    expect(config.developerInstructions).toContain("Do not load or use Codex's built-in computer-use skill or sky.* methods");
    expect(config.config?.['mcp_servers.node_repl.enabled']).toBe(true);
  });

  it('adds the unified status and spoken acknowledgment policy', () => {
    const config = buildCodexClawThreadConfig(agent, 'http://127.0.0.1:8767/mcp');

    expect(config.developerInstructions).toContain('call set-status exactly once as your very first action');
    expect(config.developerInstructions).toContain('announcement containing phase start');
  });

  it('adds celebration policy only when the setting is enabled', () => {
    const enabled = buildCodexClawThreadConfig(agent, 'http://127.0.0.1:8767/mcp');
    const disabled = buildCodexClawThreadConfig(
      agent,
      'http://127.0.0.1:8767/mcp',
      undefined,
      { celebrationsEnabled: false },
    );

    expect(enabled.developerInstructions).toContain('celebration in finish_turn');
    expect(disabled.developerInstructions).not.toContain('celebration in finish_turn');
  });

  it('preserves existing query params when scoping an MCP URL to an agent', () => {
    expect(agentScopedMcpUrl('http://127.0.0.1:8767/mcp?debug=1', 'agent-dina')).toBe('http://127.0.0.1:8767/mcp?debug=1&agentId=agent-dina');
  });
});
