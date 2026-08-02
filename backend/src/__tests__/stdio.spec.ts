import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
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

    input.write('{"jsonrpc":"2.0","id":"1","method":"backend/health/get"}\n');
    await Promise.resolve();
    stop();

    expect(responses.join('')).toBe('{"jsonrpc":"2.0","id":"1","result":{"method":"backend/health/get"}}\n');
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

    const resultPromise = peer.request('client/external/open', { url: 'https://example.com' });
    const request = JSON.parse(writes.join('')) as { id: string; method: string };
    expect(request).toMatchObject({
      jsonrpc: '2.0',
      method: 'client/external/open',
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

    const resultPromise = peer.request('client/external/open', { url: 'https://example.com' });
    const request = JSON.parse(writes.join('')) as { id: string };
    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32603, message: 'open failed' },
    })}\n`);

    await expect(resultPromise).rejects.toThrow('open failed');
    peer.stop();
  });

  it('reports output backpressure once and reports when the stream drains', () => {
    const input = new PassThrough();
    const output = new PassThrough({ highWaterMark: 1 });
    const onOutputBackpressure = vi.fn();
    const onOutputDrain = vi.fn();
    const peer = new StdioRpcPeer({
      input,
      output,
      onMessage: () => undefined,
      onOutputBackpressure,
      onOutputDrain,
    });
    peer.start();

    peer.notify('backend/event', { value: 'first' });
    peer.notify('backend/event', { value: 'second' });

    expect(onOutputBackpressure).toHaveBeenCalledOnce();
    expect(onOutputBackpressure).toHaveBeenCalledWith(expect.objectContaining({
      frameBytes: expect.any(Number),
      writableLength: expect.any(Number),
    }));
    output.emit('drain');
    expect(onOutputDrain).toHaveBeenCalledOnce();
    peer.stop();
  });

  it('keeps the transport alive while Node buffers complete frames', () => {
    const input = new PassThrough();
    const output = new PassThrough({ highWaterMark: 1 });
    const peer = new StdioRpcPeer({
      input,
      output,
      onMessage: () => undefined,
    });
    peer.start();

    peer.notify('backend/event', { value: 'first' });
    peer.notify('backend/event', { value: 'second' });

    expect(output.destroyed).toBe(false);
    expect(output.readableLength).toBeGreaterThan(0);
    peer.stop();
  });

  it('coalesces queued snapshot notifications while preserving ordinary events', () => {
    const input = new PassThrough();
    const output = new PassThrough({ highWaterMark: 1 });
    const writes: string[] = [];
    output.on('data', (chunk) => writes.push(chunk.toString()));
    const peer = new StdioRpcPeer({
      input,
      output,
      onMessage: () => undefined,
    });
    peer.start();

    peer.notify('backend/event/notify', { type: 'snapshot.updated', snapshot: 'first' });
    peer.notify('backend/event/notify', { type: 'snapshot.updated', snapshot: 'second' });
    peer.notify('backend/event/notify', { type: 'backend.event', value: 'keep' });
    output.emit('drain');

    const outputText = writes.join('');
    expect(outputText).toContain('second');
    expect(outputText.match(/"snapshot":"first"/g)).toHaveLength(1);
    expect(outputText).toContain('keep');
    peer.stop();
  });

  it('bounds queued notifications instead of allowing an unbounded writable buffer', () => {
    const input = new PassThrough();
    const output = new PassThrough({ highWaterMark: 1 });
    const onOutputOverflow = vi.fn();
    const peer = new StdioRpcPeer({
      input,
      output,
      maxBufferedOutputBytes: 1,
      onOutputOverflow,
      onMessage: () => undefined,
    });
    peer.start();

    peer.notify('backend/event/notify', { type: 'ordinary', value: 'first' });
    peer.notify('backend/event/notify', { type: 'ordinary', value: 'second' });

    expect(onOutputOverflow).toHaveBeenCalledWith(expect.objectContaining({
      bufferedBytes: 0,
      frameBytes: expect.any(Number),
    }));
    expect(output.destroyed).toBe(false);
    peer.stop();
  });
});
