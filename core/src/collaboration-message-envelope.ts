export const collaborationMessageEnvelopeStart = '<<<APP_AGENT_MESSAGES_V1>>>';
export const collaborationMessageEnvelopeEnd = '<<<END_APP_AGENT_MESSAGES_V1>>>';
export const collaborationInstructionsStart = '<<<APP_DELIVERY_INSTRUCTIONS>>>';
export const collaborationInstructionsEnd = '<<<END_APP_DELIVERY_INSTRUCTIONS>>>';

export type CollaborationMessageEnvelopeEntry = {
  senderName: string;
  senderId: string;
  sentAt: string;
  content: string;
};

export type CollaborationMessageEnvelope = {
  version: 1;
  messages: CollaborationMessageEnvelopeEntry[];
};

export function formatCollaborationMessageEnvelope(
  messages: readonly CollaborationMessageEnvelopeEntry[],
): string {
  return [
    collaborationMessageEnvelopeStart,
    JSON.stringify({ version: 1, messages }, null, 2),
    collaborationMessageEnvelopeEnd,
  ].join('\n');
}

export function parseCollaborationMessageEnvelope(content: string): CollaborationMessageEnvelope | null {
  const opening = new RegExp(`^${escapeRegExp(collaborationMessageEnvelopeStart)}\\r?\\n`).exec(content);
  if (!opening) return null;

  const remainder = content.slice(opening[0].length);
  const closing = new RegExp(`\\r?\\n${escapeRegExp(collaborationMessageEnvelopeEnd)}(?:\\r?\\n|$)`).exec(remainder);
  if (!closing) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(remainder.slice(0, closing.index));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    return null;
  }

  const messages = parsed.messages.filter(isEnvelopeEntry);
  return messages.length === parsed.messages.length ? { version: 1, messages } : null;
}

function isEnvelopeEntry(value: unknown): value is CollaborationMessageEnvelopeEntry {
  return isRecord(value) &&
    typeof value.senderName === 'string' && Boolean(value.senderName.trim()) &&
    typeof value.senderId === 'string' && Boolean(value.senderId.trim()) &&
    typeof value.sentAt === 'string' &&
    typeof value.content === 'string' && Boolean(value.content.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
