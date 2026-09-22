import { describe, expect, it } from 'vitest';
import { resolveClawMcpToolModules, type ClawMcpToolModuleProvider } from '../tool-modules';

const request = {
  agentId: 'agent-dina',
  url: new URL('http://127.0.0.1/mcp?agentId=agent-dina'),
};

describe('MCP tool module resolution', () => {
  it('rejects duplicate provider identities before composing a tool surface', () => {
    const providers: ClawMcpToolModuleProvider[] = [
      { id: 'design', resolve: () => undefined },
      { id: 'design', resolve: () => undefined },
    ];

    expect(() => resolveClawMcpToolModules(providers, request))
      .toThrow("Duplicate MCP tool module provider 'design'.");
  });

  it('rejects two providers that resolve the same module identity', () => {
    const providers: ClawMcpToolModuleProvider[] = [
      { id: 'design-primary', resolve: () => ({ id: 'design', register: () => undefined }) },
      { id: 'design-secondary', resolve: () => ({ id: 'design', register: () => undefined }) },
    ];

    expect(() => resolveClawMcpToolModules(providers, request))
      .toThrow("Duplicate MCP tool module 'design'.");
  });
});
