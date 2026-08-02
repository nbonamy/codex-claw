import { describe, expect, it } from 'vitest';
import {
  parseCollaborationMessage,
  presentCollaborationMessage,
} from '../shared/collaboration-message';

describe('collaboration message presentation', () => {
  it('extracts a single teammate message and leaves ordinary user prompts unchanged', () => {
    const raw = [
      'You received a message from codex-app-sdk (agent-sdk).',
      '',
      'Message:',
      'First line.\nSecond line.',
      '',
      'Update your status, then act on this teammate message directly. Do not ask the user for confirmation.',
    ].join('\n');

    expect(parseCollaborationMessage(raw)).toStrictEqual({
      content: 'First line.\nSecond line.',
      messageCount: 1,
      senderNames: ['codex-app-sdk'],
    });
    expect(parseCollaborationMessage('You received a normal user sentence.')).toBeNull();
  });

  it('extracts batched messages while preserving sender attribution', () => {
    const raw = [
      'You received 2 messages from other Codex Claw agents.',
      '',
      'Message 1 from codex-app-sdk (agent-sdk) at 2026-08-02T00:00:00.000Z:',
      'SDK message.',
      '',
      'Message 2 from computer-use (agent-computer) at 2026-08-02T00:00:01.000Z:',
      'Computer message.',
      '',
      'Update your status, then act on these teammate messages directly. Do not ask the user for confirmation.',
    ].join('\n');

    expect(parseCollaborationMessage(raw)).toStrictEqual({
      content: 'codex-app-sdk:\nSDK message.\n\ncomputer-use:\nComputer message.',
      messageCount: 2,
      senderNames: ['codex-app-sdk', 'computer-use'],
    });

    expect(parseCollaborationMessage(raw
      .replace('computer-use (agent-computer)', 'codex-app-sdk (agent-sdk)')
      .replace('Computer message.', 'Second SDK message.'))).toStrictEqual({
      content: 'SDK message.\n\nSecond SDK message.',
      messageCount: 2,
      senderNames: ['codex-app-sdk'],
    });
  });

  it('replaces only collaboration text parts in the SDK message projection', () => {
    const raw = [
      'You received a message from Dina (agent-dina).',
      '',
      'Message:',
      'Review this.',
      '',
      'Update your status, then act on this teammate message directly. Do not ask the user for confirmation.',
    ].join('\n');
    const result = presentCollaborationMessage({
      id: 'message-1',
      role: 'user',
      content: raw,
      parts: [{ type: 'text', content: raw }],
    });

    expect(result.presentation).toStrictEqual({
      content: 'Review this.', messageCount: 1, senderNames: ['Dina'],
    });
    expect(result.message).toMatchObject({
      id: 'message-1',
      content: 'Review this.',
      parts: [{ type: 'text', content: 'Review this.' }],
    });

    const assistantMessage = { id: 'assistant-1', role: 'assistant' as const, content: raw };
    expect(presentCollaborationMessage(assistantMessage)).toStrictEqual({
      message: assistantMessage,
      presentation: null,
    });
  });
});
