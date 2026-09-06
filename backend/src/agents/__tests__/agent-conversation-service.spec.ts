import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import type { Agent, RendererMessage } from '@codex-claw/core/contracts';
import { AgentConversationService } from '../agent-conversation-service';

describe('AgentConversationService', () => {
  it('replaces rollback history and restores the idle session state', async () => {
    const { agent, driverRequest, events, persistSnapshot, service, snapshot } = createService();
    const messages = [message('assistant-turn-1', 'assistant', 'rolled back', 'turn-1')];
    driverRequest.mockResolvedValue({
      backendSession: { kind: 'codex', threadId: 'thread-rollback' },
      messages,
    });

    await expect(service.rollbackToTurn(agent.id, 'turn-1')).resolves.toBe(snapshot);

    expect(agent.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-rollback' });
    expect(events).toStrictEqual([
      {
        agentId: agent.id,
        threadId: 'thread-rollback',
        type: 'thread.historyLoaded',
        payload: { messages, replace: true },
      },
      {
        agentId: agent.id,
        threadId: 'thread-rollback',
        type: 'agent.statusChanged',
        payload: { type: 'idle' },
      },
    ]);
    expect(persistSnapshot).toHaveBeenCalledOnce();
  });

  it('resolves retry prompts from assistant segments and compaction messages', () => {
    const { agent, service, snapshot } = createService();
    snapshot.messages = [
      message('user-local', 'user', 'first prompt'),
      message('assistant-turn-7-segment-2', 'assistant', 'first answer'),
      message('user-followup', 'user', 'second prompt', 'turn-8'),
      message('compaction-turn-8', 'assistant', 'compacted'),
    ];

    expect(service.resolveMessageAction(agent.id, 'assistant-turn-7-segment-2')).toMatchObject({
      agent,
      prompt: 'first prompt',
      turnId: 'turn-7',
    });
    expect(service.resolveMessageAction(agent.id, 'compaction-turn-8')).toMatchObject({
      agent,
      prompt: 'second prompt',
      turnId: 'turn-8',
    });
    expect(service.resolveMessageAction(agent.id, 'missing')).toBeNull();
  });

  it('accepts only conversations owned by stored automation or subagent state', () => {
    const { agent, service, snapshot } = createService();
    snapshot.subagentTrees[agent.id] = {
      rootConversationId: 'thread-root',
      nodes: {
        'thread-child': {
          conversationId: 'thread-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-09-02T00:00:00.000Z',
          status: 'completed',
          updatedAt: '2026-09-02T00:00:00.000Z',
        },
      },
      operations: {},
      activities: {},
    };
    snapshot.automations = [{
      id: 'automation-1',
      name: 'Automation',
      enabled: true,
      repositories: [{
        provider: 'github',
        repositoryId: 'openai/codex-claw',
        sourceRepositoryPath: '/repo',
      }],
      teamId: 'team-1',
      schedule: { intervalMinutes: 60 },
      executionLog: [{
        id: 'execution-1',
        automationId: 'automation-1',
        startedAt: '2026-09-02T00:00:00.000Z',
        status: 'completed',
        createdCount: 1,
        createdAgents: [{
          agentId: agent.id,
          agentName: 'Dina',
          workItemId: 'github:openai/codex-claw#1',
          workItemTitle: 'Fix it',
          workItemUrl: 'https://github.com/openai/codex-claw/issues/1',
          conversationRef: { backend: 'claude', folder: '/repo', sessionId: 'session-1' },
        }],
      }],
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    }];

    expect(service.isStoredConversationRef({ backend: 'codex', threadId: 'thread-child' }, agent.id)).toBe(true);
    expect(service.isStoredConversationRef({ backend: 'claude', folder: '/repo', sessionId: 'session-1' }, agent.id)).toBe(true);
    expect(service.isStoredConversationRef({ backend: 'codex', threadId: 'thread-unknown' }, agent.id)).toBe(false);
  });

  it('hydrates the session, refreshes workspace metadata, and synchronizes a generated title', async () => {
    const { agent, driverRequest, persistSnapshot, refreshGitStatus, refreshWorkspaceIdentity, service } = createService();
    driverRequest.mockImplementation(async (_agent, method) => (
      method === backendMethods.driverHistoryHydrate
        ? { kind: 'codex', threadId: 'thread-hydrated' }
        : undefined
    ));

    await service.hydrateAndRefresh(agent.id);
    service.setTitle(agent.id);
    await Promise.resolve();

    expect(agent.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-hydrated' });
    expect(persistSnapshot).toHaveBeenCalledOnce();
    expect(refreshWorkspaceIdentity).toHaveBeenCalledWith(agent.id);
    expect(refreshGitStatus).toHaveBeenCalledWith(agent.id);
    expect(agent.conversationTitle).toBe('Dina');
    expect(driverRequest).toHaveBeenCalledWith(
      agent,
      backendMethods.driverConversationTitleUpdate,
      { agent, title: 'Dina' },
    );
  });

  it('reports hydration failures without exposing diagnostics and deduplicates concurrent requests', async () => {
    vi.useFakeTimers();
    try {
      const { agent, driverRequest, events, service } = createService();
      driverRequest.mockRejectedValue(new Error('thread thread-root already has an active writer: sensitive provider detail'));

      const first = service.hydrate(agent.id);
      const second = service.hydrate(agent.id);
      await vi.runAllTimersAsync();

      await expect(Promise.all([first, second])).resolves.toStrictEqual([undefined, undefined]);
      expect(driverRequest).toHaveBeenCalledTimes(2);
      expect(events).toContainEqual({
        agentId: agent.id,
        type: 'thread.historyHydrationFailed',
        payload: {},
      });
      expect(JSON.stringify(events)).not.toContain('active writer');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    'Codex app-server request timed out: thread/resume',
    'thread thread-root already has an active writer',
  ])('retries a transient history hydration failure before reporting it: %s', async (message) => {
    vi.useFakeTimers();
    try {
      const { agent, driverRequest, events, service } = createService();
      driverRequest
        .mockRejectedValueOnce(new Error(message))
        .mockResolvedValueOnce({ kind: 'codex', threadId: 'thread-root' });

      const hydration = service.hydrate(agent.id);
      await vi.runAllTimersAsync();
      await hydration;

      expect(driverRequest).toHaveBeenCalledTimes(2);
      expect(events).not.toContainEqual({
        agentId: agent.id,
        type: 'thread.historyHydrationFailed',
        payload: {},
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a permanent history hydration failure', async () => {
    const { agent, driverRequest, events, service } = createService();
    driverRequest.mockRejectedValue(new Error('session thread-root is archived'));

    await service.hydrate(agent.id);

    expect(driverRequest).toHaveBeenCalledOnce();
    expect(events).toContainEqual({
      agentId: agent.id,
      type: 'thread.historyHydrationFailed',
      payload: {},
    });
  });
});

function createService() {
  const snapshot = createEmptySnapshot();
  const agent: Agent = {
    id: 'agent-dina',
    teamId: 'team-1',
    name: 'Dina',
    folder: '/repo',
    backend: 'codex',
    backendSession: { kind: 'codex', threadId: 'thread-root' },
    status: { type: 'idle' },
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  };
  snapshot.agents = [agent];
  snapshot.teams = [{
    id: 'team-1', name: 'Team', color: '#1B4FB2', agentIds: [agent.id],
  }];
  const driverRequest = vi.fn();
  const events: unknown[] = [];
  const persistSnapshot = vi.fn(async () => snapshot);
  const refreshGitStatus = vi.fn(async () => undefined);
  const refreshWorkspaceIdentity = vi.fn(async () => undefined);
  const service = new AgentConversationService({
    applyEvent: (event) => events.push(event),
    driverRequest,
    getSnapshot: () => snapshot,
    persistSnapshot,
    refreshGitStatus,
    refreshWorkspaceIdentity,
  });
  return { agent, driverRequest, events, persistSnapshot, refreshGitStatus, refreshWorkspaceIdentity, service, snapshot };
}

function message(
  id: string,
  role: RendererMessage['role'],
  text: string,
  turnId?: string,
): RendererMessage {
  return {
    id,
    agentId: 'agent-dina',
    role,
    status: 'complete',
    parts: [{ type: 'text', text }],
    createdAt: '2026-09-02T00:00:00.000Z',
    ...(turnId ? { turnId } : {}),
  };
}
