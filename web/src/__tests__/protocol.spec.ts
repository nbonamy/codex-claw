import { describe, expect, it } from 'vitest';
import { encodeClawWebMessage, parseClawWebClientMessage, parseClawWebServerMessage } from '../protocol';

describe('Claw web protocol', () => {
  it('accepts versioned requests and responses', () => {
    expect(parseClawWebClientMessage({ version: 1, type: 'request', id: '1', operation: 'getSnapshot', args: [] }))
      .toMatchObject({ operation: 'getSnapshot' });
    expect(parseClawWebServerMessage({ version: 1, type: 'ready', userId: 'local-single-user' }))
      .toMatchObject({ type: 'ready' });
    expect(parseClawWebServerMessage({ version: 1, type: 'response', id: '2', ok: true }))
      .toMatchObject({ type: 'response', ok: true });
    expect(parseClawWebServerMessage({ version: 1, type: 'response', id: '3', ok: false, error: 'bad' }))
      .toMatchObject({ type: 'response', ok: false, error: 'bad' });
    expect(parseClawWebServerMessage({ version: 1, type: 'event', event: { type: 'snapshot.updated' } }))
      .toMatchObject({ type: 'event' });
    expect(encodeClawWebMessage({
      version: 1,
      type: 'request',
      id: '4',
      operation: 'getSnapshot',
      args: [],
    })).toContain('getSnapshot');
  });

  it('rejects malformed and future-version frames', () => {
    expect(() => parseClawWebClientMessage({ version: 2, type: 'request' })).toThrow('Invalid Claw web request');
    expect(() => parseClawWebClientMessage({ version: 1, type: 'request', id: 1, operation: 'x', args: [] }))
      .toThrow('Malformed Claw web request');
    expect(() => parseClawWebServerMessage({ version: 1, type: 'response', id: '1', ok: false }))
      .toThrow('Malformed Claw web response');
  });
});
