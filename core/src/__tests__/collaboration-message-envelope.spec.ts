import { describe, expect, it } from 'vitest';
import {
  collaborationMessageEnvelopeEnd,
  collaborationMessageEnvelopeStart,
  formatCollaborationMessageEnvelope,
  parseCollaborationMessageEnvelope,
} from '../collaboration-message-envelope';

describe('collaboration message envelopes', () => {
  const message = {
    senderName: 'SDK',
    senderId: 'agent-sdk',
    sentAt: '2026-08-08T00:00:00.000Z',
    content: 'Please integrate this contract.',
  };

  it('formats and parses a versioned message envelope', () => {
    const content = formatCollaborationMessageEnvelope([message]);

    expect(content).toContain(collaborationMessageEnvelopeStart);
    expect(content).toContain(collaborationMessageEnvelopeEnd);
    expect(parseCollaborationMessageEnvelope(content)).toStrictEqual({
      version: 1,
      messages: [message],
    });
    expect(parseCollaborationMessageEnvelope(content.replaceAll('\n', '\r\n'))).toStrictEqual({
      version: 1,
      messages: [message],
    });
  });

  it('rejects missing delimiters, invalid JSON, versions, and empty message lists', () => {
    expect(parseCollaborationMessageEnvelope('ordinary prompt')).toBeNull();
    expect(parseCollaborationMessageEnvelope(`${collaborationMessageEnvelopeStart}\n{}`)).toBeNull();
    expect(parseCollaborationMessageEnvelope([
      collaborationMessageEnvelopeStart,
      '{',
      collaborationMessageEnvelopeEnd,
    ].join('\n'))).toBeNull();
    expect(parseEnvelope({ version: 2, messages: [message] })).toBeNull();
    expect(parseEnvelope({ version: 1, messages: [] })).toBeNull();
    expect(parseEnvelope([])).toBeNull();
  });

  it('rejects malformed entries without accepting a partial envelope', () => {
    for (const invalid of [
      null,
      [],
      { ...message, senderName: ' ' },
      { ...message, senderId: '' },
      { ...message, sentAt: 3 },
      { ...message, content: ' ' },
    ]) {
      expect(parseEnvelope({ version: 1, messages: [message, invalid] })).toBeNull();
    }
  });
});

function parseEnvelope(value: unknown) {
  return parseCollaborationMessageEnvelope([
    collaborationMessageEnvelopeStart,
    JSON.stringify(value),
    collaborationMessageEnvelopeEnd,
  ].join('\n'));
}
