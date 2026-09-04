import { describe, expect, it } from 'vitest';
import { encodeClawWebMessage, parseClawWebClientMessage, parseClawWebServerMessage } from '../protocol';

describe('Claw web protocol', () => {
  it('accepts versioned requests and responses', () => {
    const event = {
      seq: 1,
      source: 'backend' as const,
      type: 'client.connectionChanged' as const,
      payload: { status: 'connected' as const },
      occurredAt: '2026-09-04T00:00:00.000Z',
    };
    expect(parseClawWebClientMessage({ version: 1, type: 'request', id: '1', operation: 'getSnapshot', args: [] }))
      .toMatchObject({ operation: 'getSnapshot' });
    expect(parseClawWebServerMessage({ version: 1, type: 'ready', userId: 'local-single-user' }))
      .toMatchObject({ type: 'ready' });
    expect(parseClawWebServerMessage({ version: 1, type: 'response', id: '2', ok: true }))
      .toMatchObject({ type: 'response', ok: true });
    expect(parseClawWebServerMessage({ version: 1, type: 'response', id: '3', ok: false, error: 'bad' }))
      .toMatchObject({ type: 'response', ok: false, error: 'bad' });
    const eventMessage = {
      version: 1,
      type: 'event',
      event,
    } as const;
    const parsedEvent = parseClawWebServerMessage(eventMessage);
    expect(parsedEvent).toBe(eventMessage);
    expect(parsedEvent).toMatchObject({ type: 'event' });
    if (parsedEvent.type !== 'event') throw new Error('Expected a web event.');
    expect(parsedEvent.event).toBe(event);
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
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
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
        parseClawWebServerMessage({ version: 1, type: 'event', event });
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
