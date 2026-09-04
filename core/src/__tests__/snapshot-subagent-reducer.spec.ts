import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '../snapshot';
import { applySubagentEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-subagent-reducer';

describe('snapshot subagent reducer', () => {
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
