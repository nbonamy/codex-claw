import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { startStdioRpcServer } from '../stdio';

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
});
