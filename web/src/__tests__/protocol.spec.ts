import { product } from '@workspace/core/product';
import { describe, expect, it } from 'vitest';
import { encodeAppWebMessage, parseAppWebClientMessage, parseAppWebServerMessage } from '../protocol';

describe(`${product.name} web protocol`, () => {
  it('accepts versioned requests and responses', () => {
    const event = {
      seq: 1,
      source: 'backend' as const,
      backend: 'codex' as const, type: 'backend.statusChanged' as const,
      payload: { backend: 'codex' as const, status: 'running' as const },
      occurredAt: '2026-09-04T00:00:00.000Z',
    };
    expect(parseAppWebClientMessage({ version: 1, type: 'request', id: '1', operation: 'getSnapshot', args: [] }))
      .toMatchObject({ operation: 'getSnapshot' });
    expect(parseAppWebServerMessage({ version: 1, type: 'ready', userId: 'local-single-user' }))
      .toMatchObject({ type: 'ready' });
    expect(parseAppWebServerMessage({ version: 1, type: 'response', id: '2', ok: true }))
      .toMatchObject({ type: 'response', ok: true });
    expect(parseAppWebServerMessage({ version: 1, type: 'response', id: '3', ok: false, error: 'bad' }))
      .toMatchObject({ type: 'response', ok: false, error: 'bad' });
    const eventMessage = {
      version: 1,
      type: 'event',
      event,
    } as const;
    const parsedEvent = parseAppWebServerMessage(eventMessage);
    expect(parsedEvent).toBe(eventMessage);
    expect(parsedEvent).toMatchObject({ type: 'event' });
    if (parsedEvent.type !== 'event') throw new Error('Expected a web event.');
    expect(parsedEvent.event).toBe(event);
    expect(encodeAppWebMessage({
      version: 1,
      type: 'request',
      id: '4',
      operation: 'getSnapshot',
      args: [],
    })).toContain('getSnapshot');
  });

  it('rejects malformed and future-version frames', () => {
    expect(() => parseAppWebClientMessage({ version: 2, type: 'request' })).toThrow(`Invalid ${product.name} web request`);
    expect(() => parseAppWebClientMessage({ version: 1, type: 'request', id: 1, operation: 'x', args: [] }))
      .toThrow(`Malformed ${product.name} web request`);
    expect(() => parseAppWebServerMessage({ version: 1, type: 'response', id: '1', ok: false }))
      .toThrow(`Malformed ${product.name} web response`);
  });

  it('decodes web events deeply without exposing malformed payload values', () => {
    const secret = 'secret-event-value';
    const malformedEvents = [
      {
        seq: 1,
        source: 'backend',
        type: 'agent.statusChanged',
        agentId: 'agent-1',
        payload: { type: secret },
        occurredAt: '2026-09-04T00:00:00.000Z',
      },
      {
        seq: secret,
        source: 'backend',
        backend: 'codex' as const, type: 'backend.statusChanged',
        payload: { backend: 'codex' as const, status: 'running' },
        occurredAt: '2026-09-04T00:00:00.000Z',
      },
      {
        seq: 2,
        source: 'backend',
        type: secret,
        payload: {},
        occurredAt: '2026-09-04T00:00:00.000Z',
      },
    ];

    const diagnostics = malformedEvents.map((event) => {
      try {
        parseAppWebServerMessage({ version: 1, type: 'event', event });
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      throw new Error('Expected malformed web event to be rejected.');
    });

    expect(diagnostics).toEqual([
      expect.stringContaining('$.payload.type'),
      expect.stringContaining('$.seq'),
      expect.stringContaining('$.type'),
    ]);
    expect(diagnostics.join('\n')).not.toContain(secret);
  });
});
