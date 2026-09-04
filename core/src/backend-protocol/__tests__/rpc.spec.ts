import { describe, expect, it } from 'vitest';
import { backendMethods, backendMethodValues } from '../methods';
import { createClawRpcError, createClawRpcRequest, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, isClawRpcResponse, parseClawRpcMessage } from '../rpc';

describe('backend JSON-RPC protocol', () => {
  it('parses requests with string or number ids', () => {
    expect(parseClawRpcMessage({ jsonrpc: '2.0', id: '1', method: backendMethods.backendHealthGet })).toStrictEqual({
      jsonrpc: '2.0',
      id: '1',
      method: backendMethods.backendHealthGet,
    });
    expect(parseClawRpcMessage({ jsonrpc: '2.0', id: 2, method: backendMethods.snapshotGet, params: {} })).toStrictEqual({
      jsonrpc: '2.0',
      id: 2,
      method: backendMethods.snapshotGet,
      params: {},
    });
  });

  it('classifies requests notifications and responses', () => {
    const request = parseClawRpcMessage({ jsonrpc: '2.0', id: '1', method: backendMethods.backendHealthGet });
    const notification = parseClawRpcMessage({ jsonrpc: '2.0', method: 'events/subscribe' });
    const response = parseClawRpcMessage({ jsonrpc: '2.0', id: '1', result: { ok: true } });

    expect(isClawRpcRequest(request)).toBe(true);
    expect(isClawRpcNotification(notification)).toBe(true);
    expect(isClawRpcResponse(response)).toBe(true);
  });

  it('creates success and error responses with stable shapes', () => {
    expect(createClawRpcRequest('client-1', backendMethods.clientExternalOpen, { url: 'https://example.com' })).toStrictEqual({
      jsonrpc: '2.0',
      id: 'client-1',
      method: backendMethods.clientExternalOpen,
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
    expect(() => parseClawRpcMessage({ id: '1', method: backendMethods.backendHealthGet })).toThrow('Invalid JSON-RPC message.');
    expect(() => parseClawRpcMessage({ jsonrpc: '2.0', id: null, method: backendMethods.backendHealthGet })).toThrow('request id');
    expect(() => parseClawRpcMessage({ jsonrpc: '2.0', id: '1' })).toThrow('must be a request');
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
