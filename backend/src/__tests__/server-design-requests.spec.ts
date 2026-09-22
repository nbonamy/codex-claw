import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import { BackendDriverRpc } from '../driver-rpc';
import { ClawBackendServer } from '../server';
import { createTestSnapshot } from './server-test-fixtures';

describe('ClawBackendServer Design workflow', () => {
  it('starts Design with one tool-first suggestion prompt and does not restart it on reentry', async () => {
    const snapshot = createTestSnapshot();
    const agent = {
      id: 'agent-design', teamId: 'team-test', name: 'Dina', folder: '/repo', backend: 'codex' as const,
      status: { type: 'idle' as const }, createdAt: '2026-09-21T12:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z',
    };
    snapshot.agents.push(agent);
    snapshot.teams[0].agentIds.push(agent.id);
    const sendPrompt = vi.fn().mockResolvedValue({
      backendSession: { kind: 'codex' as const, threadId: 'thread-design' },
      turnId: 'turn-design',
    });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt,
      interrupt: vi.fn(),
      respondToAgentRequest: vi.fn(),
      onEvent: () => () => undefined,
      close: vi.fn(),
    };
    const server = new ClawBackendServer({
      version: 'test',
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    });

    await request(server, { agentId: agent.id, input: { prompt: 'Focus on deployment.' } });
    await vi.waitFor(() => expect(sendPrompt).toHaveBeenCalledTimes(1));
    const startPrompt = sendPrompt.mock.calls[0][1];
    expect(startPrompt.slice(0, startPrompt.indexOf('<context>')).trim()).toBe('Suggest useful diagrams for this conversation.');
    expect(startPrompt).toContain('suggest-design-diagrams exactly once');
    expect(startPrompt).toContain('Focus on deployment.');
    expect(startPrompt).toMatch(/Do not browse,[\s\S]*background research/u);
    expect(startPrompt).toMatch(/<context>[\s\S]*<\/context>$/u);
    expect(snapshot.agents[0].design).toMatchObject({
      suggestions: [], diagrams: [], selectedDiagramId: null,
    });

    await request(server, { agentId: agent.id });
    expect(sendPrompt).toHaveBeenCalledTimes(1);
    await server.close();
  });
});

async function request(server: ClawBackendServer, params: unknown): Promise<void> {
  const response = await server.handleMessage({
    jsonrpc: '2.0', id: 'design', method: backendMethods.agentDesignStart, params,
  });
  expect(response).toHaveProperty('result');
}
