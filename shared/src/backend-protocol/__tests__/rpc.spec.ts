import { describe, expect, it } from 'vitest';
import { createClawRpcError, createClawRpcRequest, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, isClawRpcResponse, parseClawRpcMessage } from '../rpc';

describe('backend JSON-RPC protocol', () => {
  it('parses requests with string or number ids', () => {
    expect(parseClawRpcMessage({ jsonrpc: '2.0', id: '1', method: 'backend/health' })).toStrictEqual({
      jsonrpc: '2.0',
      id: '1',
      method: 'backend/health',
    });
    expect(parseClawRpcMessage({ jsonrpc: '2.0', id: 2, method: 'snapshot/get', params: {} })).toStrictEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'snapshot/get',
      params: {},
    });
  });

  it('classifies requests notifications and responses', () => {
    const request = parseClawRpcMessage({ jsonrpc: '2.0', id: '1', method: 'backend/health' });
    const notification = parseClawRpcMessage({ jsonrpc: '2.0', method: 'events/subscribe' });
    const response = parseClawRpcMessage({ jsonrpc: '2.0', id: '1', result: { ok: true } });

    expect(isClawRpcRequest(request)).toBe(true);
    expect(isClawRpcNotification(notification)).toBe(true);
    expect(isClawRpcResponse(response)).toBe(true);
  });

  it('creates success and error responses with stable shapes', () => {
    expect(createClawRpcRequest('client-1', 'client/openExternal', { url: 'https://example.com' })).toStrictEqual({
      jsonrpc: '2.0',
      id: 'client-1',
      method: 'client/openExternal',
      params: { url: 'https://example.com' },
    });
    expect(createClawRpcResult('health-1', { ok: true })).toStrictEqual({
      jsonrpc: '2.0',
      id: 'health-1',
      result: { ok: true },
    });
    expect(createClawRpcError(null, clawRpcErrorCodes.parseError, 'Bad JSON')).toStrictEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Bad JSON',
      },
    });
  });

  it('rejects malformed envelopes', () => {
    expect(() => parseClawRpcMessage({ id: '1', method: 'backend/health' })).toThrow('Invalid JSON-RPC message.');
    expect(() => parseClawRpcMessage({ jsonrpc: '2.0', id: null, method: 'backend/health' })).toThrow('request id');
    expect(() => parseClawRpcMessage({ jsonrpc: '2.0', id: '1' })).toThrow('must be a request');
  });
});
