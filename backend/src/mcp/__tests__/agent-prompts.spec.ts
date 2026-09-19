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
    for (const tool of ['display-markdown', 'celebrate']) {
      expect(instructions).toContain(`call ${tool}`);
    }
    expect(instructions).toContain('use create-agent');
    expect(instructions).toContain('single create-agent call with createWorktree: true');
  });

  it('does not advertise disabled host plugins by default', () => {
    const instructions = codexClawDeveloperInstructions(agent());

    expect(instructions).not.toContain('computer-use-status');
    expect(instructions).not.toContain('chrome:control-chrome');
    expect(instructions).not.toContain('Spoken acknowledgments are enabled');
  });

  it('advertises celebrations only when enabled', () => {
    const enabled = codexClawDeveloperInstructions(agent());
    const disabled = codexClawDeveloperInstructions(agent(), undefined, { celebrationsEnabled: false });

    expect(enabled).toContain('call celebrate exactly once');
    expect(disabled).not.toContain('call celebrate');
  });

  it('requires a short start acknowledgment and reserves finish speech for long-running tasks', () => {
    const instructions = codexClawDeveloperInstructions(agent());

    expect(instructions).toContain('At the beginning of every user task, call announce exactly once');
    expect(instructions).toContain('must be your very first action');
    expect(instructions).toContain('one short, natural sentence');
    expect(instructions).toContain('For a long-running task, you may call announce once more');
    expect(instructions).toContain('Never announce intermediate progress or reasoning');
    expect(instructions).toContain('or the full answer');
    expect(instructions).toContain('do not wait for speech or retry');
  });

  it('distinguishes engine-native subagents from Claw co-agents', () => {
    const instructions = codexClawDeveloperInstructions(agent());

    expect(instructions).toContain('a subagent is a Codex or Claude Code native child agent');
    expect(instructions).toContain("use the engine's native subagent mechanism when the user explicitly asks for subagents");
    expect(instructions).toContain('A co-agent is a separate Codex Claw agent visible in the team');
    expect(instructions).toContain('use create-agent when the user explicitly asks for a co-agent, Claw agent, or teammate');
    expect(instructions).toContain('ask whether the user wants native subagents or Claw co-agents before acting');
  });

  it('proactively suggests worktree delegation for concrete implementation candidates', () => {
    const instructions = codexClawDeveloperInstructions(agent());

    expect(instructions).toContain('Proactively call toggle_thread_flag with id delegate_to_worktree and value true');
    expect(instructions).toContain('explicit implementation or delegation language from the user is not required');
    expect(instructions).toContain('Clear it with value false when delegation is no longer appropriate');
  });

  it('keeps delegated co-agents focused on their assigned work', () => {
    const delegatedAgent = agent();
    delegatedAgent.delegatedByAgentId = 'agent-parent';
    const instructions = codexClawDeveloperInstructions(delegatedAgent);

    expect(instructions).toContain('This agent is already a delegated co-agent');
    expect(instructions).not.toContain('Proactively call toggle_thread_flag');
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
