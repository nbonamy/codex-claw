import { describe, expect, it } from 'vitest';
import {
  applyMainEventToSnapshot,
  createInitialSnapshot,
  updateAgentFolder,
} from '../snapshot';

describe('snapshot reducer', () => {

  it('handles reducer fallback and error events without Codex protocol leaking into UI state', () => {
    const snapshot = createInitialSnapshot();

    expect(updateAgentFolder(snapshot, 'missing-agent', '/tmp/nope')).toBeNull();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'message.delta',
      payload: { delta: 'ignored without agent' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-with-empty-delta',
      type: 'message.delta',
      payload: { delta: 123 },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'error',
      payload: {},
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Backend error' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'Backend error' }]);
  });

  it('keeps retryable connection errors transient until the retry sequence fails', () => {
    const snapshot = createInitialSnapshot();
    const agentId = snapshot.agents[0].id;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      applyMainEventToSnapshot(snapshot, {
        seq: attempt,
        agentId,
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'error',
        payload: {
          message: `Reconnecting… ${attempt}/5`,
          willRetry: true,
          error: { message: `Reconnecting… ${attempt}/5` },
        },
        occurredAt: `2026-06-05T00:00:0${attempt}.000Z`,
      });
    }

    expect(snapshot.messages).toStrictEqual([]);
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'working',
      detail: 'Reconnecting… 5/5',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 6,
      agentId,
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'error',
      payload: {
        message: 'Connection failed',
        willRetry: false,
        error: { message: 'Connection failed' },
      },
      occurredAt: '2026-06-05T00:00:06.000Z',
    });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]?.parts).toStrictEqual([{ type: 'status', text: 'Connection failed' }]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Connection failed' });
  });

  it('builds and updates the current subagent tree from app-owned events', () => {
    const snapshot = createInitialSnapshot();
    const agentId = snapshot.agents[0].id;
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-root' };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId,
      threadId: 'thread-root',
      turnId: 'turn-1',
      type: 'subagent.operationChanged',
      payload: {
        rootConversationId: 'thread-root',
        operation: {
          id: 'followup-1',
          turnId: 'turn-1',
          lifecycle: 'started',
          kind: 'followupTask',
          status: 'interrupted',
          senderConversationId: 'thread-root',
          receiverConversationIds: ['thread-child'],
          prompt: 'Inspect tests',
          model: 'gpt-5',
          reasoningEffort: 'high',
          occurredAt: '2026-06-05T00:00:01.000Z',
        },
        agentStates: {
          'thread-child': { status: 'running' },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId,
      threadId: 'thread-root',
      turnId: 'turn-1',
      type: 'subagent.activityChanged',
      payload: {
        rootConversationId: 'thread-root',
        parentConversationId: 'thread-root',
        activity: {
          id: 'activity-1',
          turnId: 'turn-1',
          lifecycle: 'completed',
          kind: 'completed',
          conversationId: 'thread-child',
          agentPath: '/root/scout',
          occurredAt: '2026-06-05T00:00:02.000Z',
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId,
      threadId: 'thread-root',
      type: 'subagent.identityChanged',
      payload: {
        rootConversationId: 'thread-root',
        conversationId: 'thread-child',
        agentNickname: 'Harvey',
        agentRole: 'worker',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.subagentTrees[agentId]).toStrictEqual({
      rootConversationId: 'thread-root',
      nodes: {
        'thread-child': {
          conversationId: 'thread-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-05T00:00:01.000Z',
          status: 'running',
          agentPath: '/root/scout',
          agentNickname: 'Harvey',
          agentRole: 'worker',
          prompt: 'Inspect tests',
          model: 'gpt-5',
          reasoningEffort: 'high',
          updatedAt: '2026-06-05T00:00:02.000Z',
        },
      },
      operations: {
        'followup-1': expect.objectContaining({ kind: 'followupTask', status: 'interrupted', receiverConversationIds: ['thread-child'] }),
      },
      activities: {
        'activity-1': expect.objectContaining({ kind: 'completed', conversationId: 'thread-child' }),
      },
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId,
      threadId: 'thread-child',
      turnId: 'turn-child',
      type: 'subagent.activityChanged',
      payload: {
        rootConversationId: 'thread-root',
        parentConversationId: 'thread-child',
        activity: {
          id: 'activity-root',
          turnId: 'turn-child',
          lifecycle: 'completed',
          kind: 'interacted',
          conversationId: 'thread-root',
          agentPath: '/root',
          occurredAt: '2026-06-05T00:00:03.000Z',
        },
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.subagentTrees[agentId]?.nodes['thread-root']).toBeUndefined();
    expect(snapshot.subagentTrees[agentId]?.activities['activity-root']).toBeUndefined();
  });

  it('clears subagents when the agent starts a different root conversation', () => {
    const snapshot = createInitialSnapshot();
    const agentId = snapshot.agents[0].id;
    snapshot.subagentTrees[agentId] = {
      rootConversationId: 'thread-old',
      nodes: {},
      operations: {},
      activities: {},
    };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId,
      backend: 'codex',
      threadId: 'thread-new',
      type: 'thread.started',
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.subagentTrees[agentId]).toBeUndefined();
  });

  it('applies terminal child-turn status to an existing subagent node', () => {
    const snapshot = createInitialSnapshot();
    const agentId = snapshot.agents[0].id;
    snapshot.subagentTrees[agentId] = {
      rootConversationId: 'thread-root',
      nodes: {
        'thread-child': {
          conversationId: 'thread-child',
          parentConversationId: 'thread-root',
          createdAt: '2026-06-05T00:00:01.000Z',
          status: 'running',
          statusMessage: 'Starting',
          updatedAt: '2026-06-05T00:00:01.000Z',
        },
      },
      operations: {},
      activities: {},
    };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId,
      threadId: 'thread-root',
      type: 'subagent.statusChanged',
      payload: {
        rootConversationId: 'thread-root',
        conversationId: 'thread-child',
        status: 'completed',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.subagentTrees[agentId]?.nodes['thread-child']).toStrictEqual({
      conversationId: 'thread-child',
      parentConversationId: 'thread-root',
      createdAt: '2026-06-05T00:00:01.000Z',
      status: 'completed',
      updatedAt: '2026-06-05T00:00:02.000Z',
    });
  });
});
