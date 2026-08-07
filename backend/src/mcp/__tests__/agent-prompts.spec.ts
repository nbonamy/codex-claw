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
    expect(prompt).toContain('<<<CODEX_CLAW_DELIVERY_INSTRUCTIONS>>>');
    expect(prompt).toContain('Reply only if the sender needs information, a decision, coordination, or action.');
    expect(prompt).not.toContain('Do not proactively message other agents.');
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
    expect(prompt).toContain('Reply only to senders who need information, a decision, coordination, or action.');
  });

  it('embeds the active agent identity and collaboration constraints', () => {
    const instructions = codexClawDeveloperInstructions(agent(), {
      computerUseEnabled: true,
      chromeEnabled: true,
    });

    expect(instructions).toContain('Your Codex Claw agent ID is agent-dina.');
    expect(instructions).toContain('Your agent name is Dina');
    expect(instructions).toContain('your folder is /src/codex-claw');
    expect(instructions).toContain('before starting substantive work, changing direction, or finishing substantive work');
    expect(instructions).toContain('Do not change status for informational teammate messages');
    expect(instructions).toContain('Reply to teammate messages only when the sender needs information');
    expect(instructions).toContain('Never acknowledge an acknowledgment');
    expect(instructions).toContain('Do not proactively message other agents');
    expect(instructions).toContain('Never send FYIs, progress reports, acknowledgments, commit/hash notices');
    expect(instructions).toContain('Use browser-open with an HTTP or HTTPS URL');
    expect(instructions).toContain('use only the codex_claw MCP Computer Use tools');
    expect(instructions).toContain('chrome:control-chrome');
  });

  it('does not advertise disabled host plugins by default', () => {
    const instructions = codexClawDeveloperInstructions(agent());

    expect(instructions).toContain('Computer Use is disabled');
    expect(instructions).toContain('Chrome integration is disabled');
    expect(instructions).not.toContain('computer-use-status');
    expect(instructions).not.toContain('chrome:control-chrome');
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
