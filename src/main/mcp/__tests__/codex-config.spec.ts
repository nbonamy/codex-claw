import { describe, expect, it } from 'vitest';
import type { Agent } from '../../../shared/contracts';
import { buildCodexClawMcpConfigOverrides, buildCodexClawThreadConfig } from '../codex-config';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/codex-claw',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('codex-config', () => {
  it('builds command-line config overrides that register and auto-approve Claw MCP tools', () => {
    expect(buildCodexClawMcpConfigOverrides('http://127.0.0.1:8767/mcp')).toStrictEqual([
      'mcp_servers.codex_claw.url="http://127.0.0.1:8767/mcp"',
      'mcp_servers.codex_claw.default_tools_approval_mode="approve"',
    ]);
  });

  it('keeps agent instructions thread-scoped', () => {
    expect(buildCodexClawThreadConfig(agent, false)).toStrictEqual({});
    expect(buildCodexClawThreadConfig(agent, true)).toStrictEqual({
      developerInstructions: expect.stringContaining('Your Codex Claw agent ID is agent-dina.'),
    });
  });
});
