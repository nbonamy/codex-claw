import { describe, expect, it } from 'vitest';
import { cockpitResponsePreview } from '../cockpit-response-preview';
import { codexConversationSnapshot, codexTextMessage } from '../../test/codex-conversation-fixtures';
import { claudeConversationSnapshot } from '../../test/claude-conversation-fixtures';

describe('cockpitResponsePreview', () => {
  it('uses the latest assistant response first nonempty line, not prompts or compaction', () => {
    const messages = [
      codexTextMessage('old', 'assistant', 'Older reply'),
      codexTextMessage('reply', 'assistant', '\n  Cleanup complete.\r\nMore details.'),
      codexTextMessage('prompt', 'user', 'Next request'),
      { ...codexTextMessage('compaction', 'assistant', 'Internal handoff'), kind: 'compaction' as const },
    ];
    expect(cockpitResponsePreview({ codexSnapshot: codexConversationSnapshot(messages), claudeSnapshot: null })).toBe('Cleanup complete.');
    expect(cockpitResponsePreview({ codexSnapshot: null, claudeSnapshot: claudeConversationSnapshot(messages.map(message => ({ ...message, agentId: 'agent-dina', parts: message.parts.filter(part => part.type === 'text'), createdAt: '2026-10-08T00:00:00Z' }))) })).toBe('Cleanup complete.');
  });

  it('uses the latest Codex reasoning summary while thinking, then the response when it arrives', () => {
    const message = codexTextMessage('reply', 'assistant', 'Starting investigation.');
    const snapshot = codexConversationSnapshot([{ ...message, parts: [
      ...message.parts,
      { type: 'reasoning', summary: '\nChecking executable discovery\nFurther reasoning', itemId: 'reasoning', summaryIndex: 0 },
    ] }]);
    const view = { codexSnapshot: snapshot, claudeSnapshot: null };
    expect(cockpitResponsePreview(view)).toBe('Checking executable discovery');
    snapshot.messages = [...snapshot.messages, codexTextMessage('final', 'assistant', 'Fixed the detection.\nTests pass.')];
    expect(cockpitResponsePreview(view)).toBe('Fixed the detection.');
  });

  it('leaves fallback selection to the card when no response is available', () => {
    expect(cockpitResponsePreview(null)).toBe('');
    expect(cockpitResponsePreview({ codexSnapshot: codexConversationSnapshot([codexTextMessage('prompt', 'user', 'Do this')]), claudeSnapshot: null })).toBe('');
  });
});
