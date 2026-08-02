import { describe, expect, it } from 'vitest';
import type { Agent } from '@codex-claw/shared/contracts';
import { agentMessagesPrompt, codexClawDeveloperInstructions } from '../agent-prompts';

describe('agent prompts', () => {
  it('formats one teammate message without redundant numbering', () => {
    const prompt = agentMessagesPrompt([{
      from: 'SDK',
      fromId: 'agent-sdk',
      timestamp: '2026-08-02T12:00:00.000Z',
      content: 'The facade is ready.',
    }]);

    expect(prompt).toBe([
      'You received a message from SDK (agent-sdk).',
      '',
      'Message:',
      'The facade is ready.',
      '',
      'Act on this teammate message without asking the user for confirmation. Update your status only if it changes your substantive work. Reply only when the sender needs information, a decision, coordination, or action; silently absorb FYIs, acknowledgments, confirmations, and closures. Never acknowledge an acknowledgment. Do not proactively message other agents. Use list-agents, send-message, or broadcast-message only when the user explicitly requests coordination or a concrete cross-repository contract blocker requires a decision or action from a specific agent. Never send FYIs, progress reports, acknowledgments, commit/hash notices, or "no action needed" messages.',
    ].join('\n'));
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

    expect(prompt).toContain('You received 2 messages from other Codex Claw agents.');
    expect(prompt).toContain('Message 1 from SDK (agent-sdk) at 2026-08-02T12:00:00.000Z:\nFirst');
    expect(prompt).toContain('Message 2 from Computer Use (agent-computer-use) at 2026-08-02T12:01:00.000Z:\nSecond');
    expect(prompt).toContain('silently absorb FYIs, acknowledgments, confirmations, and closures');
    expect(prompt).toContain('Never acknowledge an acknowledgment');
  });

  it('embeds the active agent identity and collaboration constraints', () => {
    const instructions = codexClawDeveloperInstructions(agent());

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
