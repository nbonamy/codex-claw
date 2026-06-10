import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../../shared/contracts';
import { ClawMcpAgentCoordinator } from '../agent-coordinator';

const baseAgents: Agent[] = [
  {
    id: 'agent-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '~/src/codex-claw',
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'idle' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'agent-jesse',
    name: 'Jesse',
    avatar: 'JE',
    folder: '~/src/id8',
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'working', detail: 'Porting chat' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
];

describe('ClawMcpAgentCoordinator', () => {
  it('connects an agent and lists same-team members with Skwad-shaped fields', () => {
    const agents = cloneAgents(baseAgents);
    const updates: Agent[] = [];
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      onAgentUpdated: (agent) => updates.push({ ...agent }),
      now: () => new Date('2026-06-05T00:00:01.000Z'),
    });

    expect(coordinator.connectAgent('agent-dina', 'session-1')).toMatchObject({
      id: 'agent-dina',
      isRegistered: true,
      mcpSessionId: 'session-1',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });

    expect(agents[0]).toMatchObject({
      isRegistered: true,
      mcpSessionId: 'session-1',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
    expect(updates).toHaveLength(1);
    expect(coordinator.listAgents('agent-dina').agents).toStrictEqual([
      {
        id: 'agent-dina',
        name: 'Dina',
        folder: '~/src/codex-claw',
        status: 'Idle',
      },
      {
        id: 'agent-jesse',
        name: 'Jesse',
        folder: '~/src/id8',
        status: 'Porting chat',
      },
    ]);
  });

  it('sends, notifies, reads, and marks messages as read', () => {
    const agents = cloneAgents(baseAgents).map((agent) => ({ ...agent, isRegistered: true }));
    const inboxMessages: Array<{ agentId: string; messageId: string }> = [];
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      onInboxMessage: (agentId, messageId) => inboxMessages.push({ agentId, messageId }),
      createId: () => `message-${inboxMessages.length + 1}`,
      now: () => new Date('2026-06-05T00:00:03.000Z'),
    });

    expect(coordinator.sendMessage('agent-dina', 'Jesse', 'Can you review MCP?')).toStrictEqual({
      success: true,
      message: "Message sent successfully. Don't check for a response right away - you will be notified when the other agent responds.",
    });
    expect(inboxMessages).toStrictEqual([{ agentId: 'agent-jesse', messageId: 'message-1' }]);
    expect(coordinator.latestUnreadMessageId('agent-jesse')).toBe('message-1');

    expect(coordinator.checkMessages('agent-jesse')).toStrictEqual({
      messages: [
        {
          id: 'message-1',
          from: 'Dina',
          content: 'Can you review MCP?',
          timestamp: '2026-06-05T00:00:03.000Z',
        },
      ],
    });
    expect(coordinator.checkMessages('agent-jesse')).toStrictEqual({ messages: [] });
  });

  it('supports unread peeking and broadcast only to connected same-team agents', () => {
    const agents = [
      { ...baseAgents[0], isRegistered: true, teamId: 'team-1' },
      { ...baseAgents[1], isRegistered: true, teamId: 'team-1' },
      {
        ...baseAgents[1],
        id: 'agent-ellie',
        name: 'Ellie',
        isRegistered: false,
        teamId: 'team-1',
      },
      {
        ...baseAgents[1],
        id: 'agent-other-team',
        name: 'Other',
        isRegistered: true,
        teamId: 'team-2',
      },
    ];
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      createId: vi.fn()
        .mockReturnValueOnce('message-broadcast')
        .mockReturnValueOnce('message-direct'),
      now: () => new Date('2026-06-05T00:00:04.000Z'),
    });

    expect(coordinator.broadcastMessage('agent-dina', 'Heads up')).toStrictEqual({
      success: true,
      recipientCount: 1,
    });
    expect(coordinator.checkMessages('agent-jesse', false).messages).toHaveLength(1);
    expect(coordinator.checkMessages('agent-jesse', false).messages).toHaveLength(1);
    expect(coordinator.checkMessages('agent-ellie')).toStrictEqual({ messages: [] });
    expect(coordinator.checkMessages('agent-other-team')).toStrictEqual({ messages: [] });
  });

  it('rejects unknown agents and missing recipients with useful messages', () => {
    const agents = cloneAgents(baseAgents);
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
    });

    expect(() => coordinator.listAgents('missing')).toThrow("Agent 'missing' not found.");
    expect(() => coordinator.sendMessage('agent-dina', 'Missing', 'hello')).toThrow('Failed to send message: Recipient not found');
  });

  it('rejects ambiguous recipient names and allows id disambiguation', () => {
    const agents = [
      { ...baseAgents[0], isRegistered: true, teamId: 'team-1' },
      { ...baseAgents[1], name: 'Dina', folder: '~/src/id8', isRegistered: true, teamId: 'team-1' },
    ];
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      createId: () => 'message-direct',
      now: () => new Date('2026-06-05T00:00:04.000Z'),
    });

    expect(() => coordinator.sendMessage('agent-dina', 'Dina', 'hello')).toThrow("Failed to send message: Recipient name 'Dina' is ambiguous. Use the recipient ID from list-agents.");
    expect(coordinator.sendMessage('agent-dina', 'agent-jesse', 'hello')).toStrictEqual({
      success: true,
      message: "Message sent successfully. Don't check for a response right away - you will be notified when the other agent responds.",
    });
    expect(coordinator.checkMessages('agent-jesse')).toStrictEqual({
      messages: [
        {
          id: 'message-direct',
          from: 'Dina',
          content: 'hello',
          timestamp: '2026-06-05T00:00:04.000Z',
        },
      ],
    });
  });

  it('updates and clears short status text', () => {
    const agents = cloneAgents(baseAgents);
    const updates: Agent[] = [];
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      onAgentUpdated: (agent) => updates.push({ ...agent }),
      now: () => new Date('2026-06-05T00:00:05.000Z'),
    });

    expect(coordinator.setStatus('agent-dina', 'Implementing MCP')).toBe('Status updated');
    expect(updates.at(-1)).toMatchObject({
      id: 'agent-dina',
      statusText: 'Implementing MCP',
      updatedAt: '2026-06-05T00:00:05.000Z',
    });
    expect(coordinator.listAgents('agent-dina').agents[0].status).toBe('Idle: Implementing MCP');
    expect(coordinator.setStatus('agent-dina', '')).toBe('Status updated');
    expect(updates.at(-1)).toMatchObject({
      id: 'agent-dina',
      statusText: undefined,
      updatedAt: '2026-06-05T00:00:05.000Z',
    });
    expect(coordinator.listAgents('agent-dina').agents[0].status).toBe('Idle');
  });

  it('requests markdown display with exactly one content source', async () => {
    const agents = cloneAgents(baseAgents);
    const onDisplayMarkdown = vi.fn().mockResolvedValue({
      success: true,
      message: 'Displayed README.md in the side panel.',
      path: 'README.md',
      title: 'README.md',
    });
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      onDisplayMarkdown,
    });

    await expect(coordinator.displayMarkdown('agent-dina', {
      path: ' README.md ',
      title: ' Readme ',
    })).resolves.toStrictEqual({
      success: true,
      message: 'Displayed README.md in the side panel.',
      path: 'README.md',
      title: 'README.md',
    });
    expect(onDisplayMarkdown).toHaveBeenCalledWith(agents[0], {
      path: 'README.md',
      title: 'Readme',
    });
    await expect(coordinator.displayMarkdown('agent-dina', {})).rejects.toThrow('Provide exactly one of markdown or path.');
    await expect(coordinator.displayMarkdown('agent-dina', {
      markdown: '# Inline',
      path: 'README.md',
    })).rejects.toThrow('Provide exactly one of markdown or path.');
  });

  it('marks assigned work items complete through the app callback', async () => {
    const agents = cloneAgents(baseAgents);
    const onMarkWorkItemCompleted = vi.fn().mockResolvedValue({
      success: true,
      workItemId: 'github:nbonamy/codex-claw#12',
      status: 'completed',
      completedAt: '2026-06-09T13:30:00.000Z',
    });
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      onMarkWorkItemCompleted,
    });

    await expect(coordinator.markWorkItemCompleted('agent-dina', ' github:nbonamy/codex-claw#12 ')).resolves.toStrictEqual({
      success: true,
      workItemId: 'github:nbonamy/codex-claw#12',
      status: 'completed',
      completedAt: '2026-06-09T13:30:00.000Z',
    });
    expect(onMarkWorkItemCompleted).toHaveBeenCalledWith(agents[0], 'github:nbonamy/codex-claw#12');
  });

  it('rejects completion requests without a work item callback or id', async () => {
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => cloneAgents(baseAgents),
    });

    await expect(coordinator.markWorkItemCompleted('agent-dina', '  ')).rejects.toThrow('Provide the work item ID from your assignment prompt.');
    await expect(coordinator.markWorkItemCompleted('agent-dina', 'github:nbonamy/codex-claw#12')).rejects.toThrow('Work item completion is not available.');
  });

  it('rejects markdown display when the app callback is unavailable', async () => {
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => cloneAgents(baseAgents),
    });

    await expect(coordinator.displayMarkdown('agent-dina', {
      markdown: '# Inline',
    })).rejects.toThrow('Markdown display is not available.');
  });

  it('reports recovery context when no agents exist', () => {
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => [],
    });

    expect(() => coordinator.listAgents('missing')).toThrow("Agent 'missing' not found. No agents are currently available.");
    expect(coordinator.latestUnreadMessageId('missing')).toBeNull();
    expect(coordinator.debugAgents()).toStrictEqual([]);
  });

  it('formats state variants for other agents', () => {
    const agents: Agent[] = [
      { ...baseAgents[0], status: { type: 'starting' } },
      { ...baseAgents[1], status: { type: 'working' } },
      { ...baseAgents[1], id: 'awaiting', name: 'Awaiting', status: { type: 'awaitingInput' } },
      { ...baseAgents[1], id: 'error', name: 'Error', status: { type: 'error', message: '' } },
    ];
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
    });

    expect(coordinator.debugAgents().map((agent) => agent.status)).toStrictEqual([
      'Starting',
      'Working',
      'Awaiting input',
      'Error',
    ]);
  });

  it('falls back to sender IDs when the sender is no longer available', () => {
    let agents = cloneAgents(baseAgents).map((agent) => ({ ...agent, isRegistered: true }));
    const coordinator = new ClawMcpAgentCoordinator({
      getAgents: () => agents,
      createId: () => 'message-orphaned',
      now: () => new Date('2026-06-05T00:00:07.000Z'),
    });

    coordinator.sendMessage('agent-dina', 'agent-jesse', 'I may disappear');
    agents = agents.filter((agent) => agent.id !== 'agent-dina');

    expect(coordinator.checkMessages('agent-jesse')).toStrictEqual({
      messages: [
        {
          id: 'message-orphaned',
          from: 'agent-dina',
          content: 'I may disappear',
          timestamp: '2026-06-05T00:00:07.000Z',
        },
      ],
    });
  });
});

function cloneAgents(agents: Agent[]): Agent[] {
  return agents.map((agent) => ({ ...agent, status: { ...agent.status } }));
}
