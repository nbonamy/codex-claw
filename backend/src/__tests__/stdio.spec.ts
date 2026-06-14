import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { startStdioRpcServer, StdioRpcPeer } from '../stdio';

describe('stdio JSON-RPC transport', () => {
  it('writes one JSON-RPC response per request line', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const responses: string[] = [];
    output.on('data', (chunk) => responses.push(chunk.toString()));

    const stop = startStdioRpcServer({
      input,
      output,
      onMessage: (message) => ({
        jsonrpc: '2.0',
        id: 'id' in message ? message.id : null,
        result: { method: 'method' in message ? message.method : 'none' },
      }),
    });

    input.write('{"jsonrpc":"2.0","id":"1","method":"backend/health"}\n');
    await Promise.resolve();
    stop();

    expect(responses.join('')).toBe('{"jsonrpc":"2.0","id":"1","result":{"method":"backend/health"}}\n');
  });

  it('returns parse errors for invalid JSON lines', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const responses: string[] = [];
    output.on('data', (chunk) => responses.push(chunk.toString()));

    const stop = startStdioRpcServer({
      input,
      output,
      onMessage: () => undefined,
    });

    input.write('nope\n');
    await Promise.resolve();
    stop();

    expect(JSON.parse(responses.join(''))).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
      },
    });
  });

  it('keeps the request id when a handler throws', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const responses: string[] = [];
    output.on('data', (chunk) => responses.push(chunk.toString()));

    const stop = startStdioRpcServer({
      input,
      output,
      onMessage: () => {
        throw new Error('handler failed');
      },
    });

    input.write('{"jsonrpc":"2.0","id":"select-1","method":"agent/select"}\n');
    await Promise.resolve();
    stop();

    expect(JSON.parse(responses.join(''))).toStrictEqual({
      jsonrpc: '2.0',
      id: 'select-1',
      error: {
        code: -32603,
        message: 'handler failed',
      },
    });
  });

  it('sends backend-initiated requests and resolves Electron responses', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const writes: string[] = [];
    output.on('data', (chunk) => writes.push(chunk.toString()));
    const peer = new StdioRpcPeer({
      input,
      output,
      onMessage: () => undefined,
    });
    peer.start();

    const resultPromise = peer.request('client/openExternal', { url: 'https://example.com' });
    const request = JSON.parse(writes.join('')) as { id: string; method: string };
    expect(request).toMatchObject({
      jsonrpc: '2.0',
      method: 'client/openExternal',
      params: { url: 'https://example.com' },
    });

    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: true })}\n`);
    await expect(resultPromise).resolves.toBe(true);
    peer.stop();
  });

  it('rejects backend-initiated requests when Electron returns an error', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const writes: string[] = [];
    output.on('data', (chunk) => writes.push(chunk.toString()));
    const peer = new StdioRpcPeer({
      input,
      output,
      onMessage: () => undefined,
    });
    peer.start();

    const resultPromise = peer.request('client/openExternal', { url: 'https://example.com' });
    const request = JSON.parse(writes.join('')) as { id: string };
    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32603, message: 'open failed' },
    })}\n`);

    await expect(resultPromise).rejects.toThrow('open failed');
    peer.stop();
  });
});
