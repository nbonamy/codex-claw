import { describe, expect, it } from 'vitest';
import type { Agent } from '../../../shared/contracts';
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
  it('keeps only global feature overrides on the app-server command line', () => {
    expect(buildCodexClawMcpConfigOverrides()).toStrictEqual([
      'features.apply_patch_streaming_events=true',
    ]);
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

  it('preserves existing query params when scoping an MCP URL to an agent', () => {
    expect(agentScopedMcpUrl('http://127.0.0.1:8767/mcp?debug=1', 'agent-dina')).toBe('http://127.0.0.1:8767/mcp?debug=1&agentId=agent-dina');
  });
});
