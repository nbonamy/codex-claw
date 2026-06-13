import { describe, expect, it } from 'vitest';
import { ClawBackendServer } from '../server';

describe('ClawBackendServer', () => {
  it('responds to backend health requests', () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    expect(server.handleMessage({ jsonrpc: '2.0', id: 'health-1', method: 'backend/health' })).toStrictEqual({
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

  it('returns an app snapshot with the backend event sequence', () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });
    const response = server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get' });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: {
        lastEventSeq: 0,
        snapshot: {
          activeAgentId: null,
          teams: [{ id: 'team-codex-claw' }],
          agents: [],
        },
      },
    });
  });

  it('returns method-not-found errors for unknown methods', () => {
    const server = new ClawBackendServer({ version: 'test-version', pid: 123 });

    expect(server.handleMessage({ jsonrpc: '2.0', id: 'missing', method: 'nope' })).toStrictEqual({
      jsonrpc: '2.0',
      id: 'missing',
      error: {
        code: -32601,
        message: 'Unknown backend method: nope',
      },
    });
  });
});
