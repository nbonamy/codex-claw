import { describe, expect, it } from 'vitest';
import { enabledAgentBackends, resolveAgentBackend } from '../agent-backends';
import type { AgentBackend } from '../contracts';

describe('connected engines', () => {
  it.each([
    { connected: [] }, { connected: ['codex'] }, { connected: ['claude'] }, { connected: ['codex', 'claude'] },
  ] as { connected: AgentBackend[] }[])('uses only authenticated engines: $connected', ({ connected }) => {
    const snapshot = { providerConnections: (['codex', 'claude'] as const).map(backend => ({
      backend, installed: true, connected: connected.includes(backend), checking: false,
    })) };
    expect(enabledAgentBackends(snapshot)).toStrictEqual(connected);
    if (connected.length) expect(resolveAgentBackend(snapshot)).toBe(connected[0]);
    else expect(() => resolveAgentBackend(snapshot)).toThrow('Connect');
    for (const backend of ['codex', 'claude'] as const) {
      if (!connected.includes(backend)) expect(() => resolveAgentBackend(snapshot, backend)).toThrow('not connected');
    }
  });

  it('does not infer a connection when status is missing', () => {
    expect(enabledAgentBackends({})).toStrictEqual([]);
    expect(() => resolveAgentBackend({})).toThrow('Connect');
  });
});
