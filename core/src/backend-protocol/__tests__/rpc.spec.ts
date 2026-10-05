import { describe, expect, it, vi } from 'vitest';
import { backendMethods, backendMethodValues } from '../methods';
import { createAppRpcError, createAppRpcRequest, createAppRpcResult, appRpcErrorCodes, isAppRpcNotification, isAppRpcRequest, isAppRpcResponse, parseAppRpcMessage, requestAppBackend } from '../rpc';

describe('backend JSON-RPC protocol', () => {
  it('parses requests with string or number ids', () => {
    expect(parseAppRpcMessage({ jsonrpc: '2.0', id: '1', method: backendMethods.backendHealthGet })).toStrictEqual({
      jsonrpc: '2.0',
      id: '1',
      method: backendMethods.backendHealthGet,
    });
    expect(parseAppRpcMessage({ jsonrpc: '2.0', id: 2, method: backendMethods.snapshotGet, params: {} })).toStrictEqual({
      jsonrpc: '2.0',
      id: 2,
      method: backendMethods.snapshotGet,
      params: {},
    });
  });

  it('classifies requests notifications and responses', () => {
    const request = parseAppRpcMessage({ jsonrpc: '2.0', id: '1', method: backendMethods.backendHealthGet });
    const notification = parseAppRpcMessage({ jsonrpc: '2.0', method: 'events/subscribe' });
    const response = parseAppRpcMessage({ jsonrpc: '2.0', id: '1', result: { ok: true } });

    expect(isAppRpcRequest(request)).toBe(true);
    expect(isAppRpcNotification(notification)).toBe(true);
    expect(isAppRpcResponse(response)).toBe(true);
  });

  it('creates success and error responses with stable shapes', () => {
    expect(createAppRpcRequest('client-1', backendMethods.clientExternalOpen, { url: 'https://example.com' })).toStrictEqual({
      jsonrpc: '2.0',
      id: 'client-1',
      method: backendMethods.clientExternalOpen,
      params: { url: 'https://example.com' },
    });
    expect(createAppRpcResult('health-1', { ok: true })).toStrictEqual({
      jsonrpc: '2.0',
      id: 'health-1',
      result: { ok: true },
    });
    expect(createAppRpcError(null, appRpcErrorCodes.parseError, 'Bad JSON')).toStrictEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Bad JSON',
      },
    });
  });

  it('forwards typed backend requests through the shared request port', async () => {
    const workflow = { repository: 'nbonamy/agent-workspace' };
    const client = {
      request: vi.fn().mockResolvedValue(workflow),
    };

    await expect(requestAppBackend(client, backendMethods.agentGitStage, {
      agentId: 'agent-1',
      input: { paths: ['core/src/contracts.ts'], confirmed: true },
    })).resolves.toBe(workflow);
    expect(client.request).toHaveBeenCalledWith(backendMethods.agentGitStage, {
      agentId: 'agent-1',
      input: { paths: ['core/src/contracts.ts'], confirmed: true },
    });
  });

  it('rejects malformed envelopes', () => {
    expect(() => parseAppRpcMessage({ id: '1', method: backendMethods.backendHealthGet })).toThrow('Invalid JSON-RPC message.');
    expect(() => parseAppRpcMessage({ jsonrpc: '2.0', id: null, method: backendMethods.backendHealthGet })).toThrow('request id');
    expect(() => parseAppRpcMessage({ jsonrpc: '2.0', id: '1' })).toThrow('must be a request');
  });

  it('defines unique path-style backend method names without legacy names', () => {
    const values = [...backendMethodValues];
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(/^[a-z][A-Za-z0-9]*(?:\/[a-z][A-Za-z0-9]*)+$/u);
      expect(value).not.toMatch(/\/(?:list|get|set|remove|add|save|open|update|read|create|delete)[A-Z]/u);
    }
    expect(values).not.toContain('agent/listFiles');
    expect(values).not.toContain('backend/event');
  });
});
