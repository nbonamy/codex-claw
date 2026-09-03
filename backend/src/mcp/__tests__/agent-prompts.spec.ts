import { describe, expect, it } from 'vitest';
import type { Agent } from '@codex-claw/core/contracts';
import { parseCollaborationMessageEnvelope } from '@codex-claw/core/collaboration-message-envelope';
import { agentMessagesPrompt, codexClawDeveloperInstructions } from '../agent-prompts';

describe('agent prompts', () => {
  it('formats one teammate message without redundant numbering', () => {
    const prompt = agentMessagesPrompt([{
      from: 'SDK',
      fromId: 'agent-sdk',
      timestamp: '2026-08-02T12:00:00.000Z',
      content: 'The facade is ready.',
    }]);

    expect(parseCollaborationMessageEnvelope(prompt)).toStrictEqual({
      version: 1,
      messages: [{
        senderName: 'SDK',
        senderId: 'agent-sdk',
        sentAt: '2026-08-02T12:00:00.000Z',
        content: 'The facade is ready.',
      }],
    });
  });

  it('numbers and attributes batches of teammate messages', () => {
    const prompt = agentMessagesPrompt([{
      from: 'SDK',
      fromId: 'agent-sdk',
      timestamp: '2026-08-02T12:00:00.000Z',
      content: 'First',
    }, {
      from: 'Computer Use',
      fromId: 'agent-computer-use',
      timestamp: '2026-08-02T12:01:00.000Z',
      content: 'Second',
    }]);

    expect(parseCollaborationMessageEnvelope(prompt)?.messages).toStrictEqual([
      {
        senderName: 'SDK',
        senderId: 'agent-sdk',
        sentAt: '2026-08-02T12:00:00.000Z',
        content: 'First',
      },
      {
        senderName: 'Computer Use',
        senderId: 'agent-computer-use',
        sentAt: '2026-08-02T12:01:00.000Z',
        content: 'Second',
      },
    ]);
  });

  it('embeds the active agent identity and enabled host capabilities', () => {
    const instructions = codexClawDeveloperInstructions(agent(), {
      computerUseEnabled: true,
      chromeEnabled: true,
    });

    expect(instructions).toContain('Your Codex Claw agent ID is agent-dina.');
    expect(instructions).toContain('Your agent name is Dina');
    expect(instructions).toContain('your folder is /src/codex-claw');
    expect(instructions).toContain('computer-use-guide');
    expect(instructions).toContain('chrome:control-chrome');
    for (const tool of ['create-agent', 'display-markdown', 'celebrate']) {
      expect(instructions).toContain(`call ${tool}`);
    }
    expect(instructions).toContain('single call with createWorktree: true');
  });

  it('does not advertise disabled host plugins by default', () => {
    const instructions = codexClawDeveloperInstructions(agent());

    expect(instructions).not.toContain('computer-use-status');
    expect(instructions).not.toContain('chrome:control-chrome');
    expect(instructions).not.toContain('Spoken acknowledgments are enabled');
  });

  it('limits enabled spoken acknowledgments to task boundaries and safe short phrases', () => {
    const instructions = codexClawDeveloperInstructions(agent(), undefined, true);

    expect(instructions).toContain('call announce at most once near the start');
    expect(instructions).toContain('once only at genuine completion');
    expect(instructions).toContain('Never announce intermediate progress or reasoning');
    expect(instructions).toContain('do not wait for speech or retry');
  });

  it('describes workspace-free Quick chats without inventing a folder', () => {
    const quickChat = agent();
    quickChat.folder = null;
    quickChat.sessionKind = 'quickChat';

    const instructions = codexClawDeveloperInstructions(quickChat);

    expect(instructions).toContain('workspace-free Quick chat');
    expect(instructions).not.toContain('folder is null');
    expect(instructions).not.toContain('inside your agent folder');
  });
});

function agent(): Agent {
  return {
    id: 'agent-dina',
    teamId: 'team-claw',
    name: 'Dina',
    avatar: 'DI',
    folder: '/src/codex-claw',
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'idle' },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}
