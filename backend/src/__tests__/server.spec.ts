import { describe, expect, it } from 'vitest';
import type { AppSnapshot } from '@codex-claw/shared/contracts';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/shared/backend-driver';
import { codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { ClawBackendServer } from '../server';
import { BackendDriverRpc } from '../driver-rpc';

describe('ClawBackendServer', () => {
  it('responds to backend health requests', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'health-1', method: 'backend/health' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'health-1',
      result: {
        ok: true,
        name: 'clawd',
        version: 'test-version',
        pid: 123,
      },
    });
  });

  it('returns an app snapshot with the backend event sequence', async () => {
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      snapshot: {
        ...createTestSnapshot(),
        activeTeamId: 'team-test',
      },
    });
    const response = await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get' });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: {
        lastEventSeq: 0,
        snapshot: {
          activeTeamId: 'team-test',
          activeAgentId: null,
          teams: [{ id: 'team-test' }],
          agents: [],
        },
      },
    });
  });

  it('returns method-not-found errors for unknown methods', async () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    await expect(server.handleMessage({ jsonrpc: '2.0', id: 'missing', method: 'nope' })).resolves.toStrictEqual({
      jsonrpc: '2.0',
      id: 'missing',
      error: {
        code: -32601,
        message: 'Unknown backend method: nope',
      },
    });
  });

  it('assigns backend event sequence numbers', async () => {
    const events: unknown[] = [];
    let emitEvent: (event: BackendEvent) => void = () => undefined;
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      sendPrompt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      interrupt: async () => ({ backendSession: { kind: 'codex', threadId: 'thread-test' } }),
      respondToRequest: async () => undefined,
      onEvent: (listener) => {
        emitEvent = listener;
        return () => undefined;
      },
      close: async () => undefined,
    };
    const driverRpc = new BackendDriverRpc(new Map([['codex', driver]]));
    const server = new ClawBackendServer({
      version: 'test-version',
      pid: 123,
      driverRpc,
      onEvent: (event) => events.push(event),
    });

    emitEvent({
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    });

    expect(events).toMatchObject([{
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }]);
    await expect(server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get' })).resolves.toMatchObject({
      result: {
        lastEventSeq: 1,
      },
    });
  });
});

function createTestSnapshot(): AppSnapshot {
  return {
    teams: [{
      id: 'team-test',
      name: 'Test Team',
      agentIds: [],
    }],
    agents: [],
    bench: [],
    loops: [],
    activeTeamId: 'team-test',
    activeAgentId: null,
    messages: [],
    agentGitStatuses: {},
    turnGitDiffs: {},
    backendRuntimes: [],
    workBacklog: {
      connections: [],
      providerConfigurations: {},
      providerSettings: {},
      assignments: {},
    },
    general: {
      preventSleepWhenAgentsRun: true,
    },
    sourceFolder: {
      path: '',
      initialized: false,
      recentRepoNames: [],
    },
    theme: {
      id: 'codex-claw-light',
      mode: 'system',
      uiFontSize: 14,
      chatFontSize: 15,
      codeFontSize: 13,
    },
  };
}
