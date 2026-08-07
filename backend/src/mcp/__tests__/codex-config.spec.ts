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
  it('enables the required event feature without creating a partial MCP server config', () => {
    expect(buildCodexClawMcpConfigOverrides()).toStrictEqual([
      'features.apply_patch_streaming_events=true',
      'mcp_servers.node_repl.enabled=false',
    ]);
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
        'mcp_servers.node_repl.enabled': false,
      },
      developerInstructions: expect.stringContaining('Your Codex Claw agent ID is agent-dina.'),
    });
  });

  it('directs GUI automation to Claw MCP rather than the built-in Codex Computer Use skill', () => {
    const config = buildCodexClawThreadConfig(agent, 'http://127.0.0.1:8767/mcp', {
      computerUseEnabled: true,
      chromeEnabled: true,
    });

    expect(config.developerInstructions).toContain('computer-use-status');
    expect(config.developerInstructions).toContain('Do not load or use the built-in computer-use skill or sky.* methods');
    expect(config.config?.['mcp_servers.node_repl.enabled']).toBe(true);
  });

  it('preserves existing query params when scoping an MCP URL to an agent', () => {
    expect(agentScopedMcpUrl('http://127.0.0.1:8767/mcp?debug=1', 'agent-dina')).toBe('http://127.0.0.1:8767/mcp?debug=1&agentId=agent-dina');
  });
});
