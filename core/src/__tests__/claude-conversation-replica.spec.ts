import { describe, expect, it } from 'vitest';
import { createClaudeConversationReplica } from '../claude-conversation-replica';
import type { ClaudeConversationEvent, ClaudeConversationSnapshot } from '../contracts';

describe('Claude conversation replica', () => {
  it('owns one turn transcript from prompt submission through completion', () => {
    const replica = createClaudeConversationReplica(emptySnapshot());

    replica.apply(event({
      type: 'turn.started',
      turnId: 'turn-1',
      payload: { turn: { id: 'turn-1', backend: 'claude' } },
    }));
    const submitted = event({
      type: 'message.userSubmitted',
      turnId: 'turn-1',
      payload: {
        message: {
          id: 'user-1', agentId: 'agent-1', role: 'user', status: 'complete', turnId: 'turn-1',
          createdAt: '2026-09-06T00:00:01.000Z', parts: [{ type: 'text', text: 'Fix it' }],
        },
      },
    });
    replica.apply(submitted);
    replica.apply(event({
      type: 'message.delta',
      turnId: 'turn-1',
      payload: { messageId: 'assistant-1', itemId: 'text-1', delta: 'Done' },
    }));
    replica.apply(event({
      type: 'turn.completed',
      turnId: 'turn-1',
      payload: { turn: { id: 'turn-1', status: 'completed' } },
    }));

    expect(replica.getSnapshot()).toMatchObject({
      activeTurnId: null,
      turnIds: ['turn-1'],
      turns: [{ id: 'turn-1', status: 'completed', willRetry: false }],
      busy: false,
      messages: [
        { id: 'user-1', turnId: 'turn-1', parts: [{ type: 'text', text: 'Fix it' }] },
        { id: 'assistant-turn-1', turnId: 'turn-1', parts: [{ type: 'text', text: 'Done', itemId: 'text-1' }] },
      ],
    });
    expect(submitted.payload.message).toStrictEqual({
      id: 'user-1', agentId: 'agent-1', role: 'user', status: 'complete', turnId: 'turn-1',
      createdAt: '2026-09-06T00:00:01.000Z', parts: [{ type: 'text', text: 'Fix it' }],
    });
  });

  it('tracks tools, requests, plans, errors, and resolved request ids inside the provider state', () => {
    const replica = createClaudeConversationReplica(emptySnapshot());
    replica.apply(event({
      type: 'turn.started', turnId: 'turn-1',
      payload: { turn: { id: 'turn-1', backend: 'claude' } },
    }));
    replica.apply(event({
      type: 'item.started', turnId: 'turn-1',
      payload: { toolPart: { id: 'tool-1', type: 'tool', kind: 'command', title: 'npm test', status: 'running' } },
    }));
    replica.apply(event({
      type: 'item.updated', turnId: 'turn-1',
      payload: { itemId: 'tool-1', status: 'completed', output: 'pass' },
    }));
    replica.apply(event({
      type: 'approval.requested', turnId: 'turn-1',
      payload: {
        kind: 'confirm_tool', id: 'approval-1',
        payload: { confirmation: {
          integrationId: 'claude', integrationName: 'Claude', toolName: 'Bash',
          summary: 'Run tests', argumentsPreview: '{"command":"npm test"}',
          allowConversation: false, allowAlways: false,
        } },
      },
    }));
    replica.apply(event({
      type: 'clientRequest.resolved',
      payload: { id: 'approval-1' },
    }));
    replica.apply(event({
      type: 'turn.proposedPlanDelta', threadId: 'session-1', turnId: 'turn-1',
      payload: { itemId: 'plan-1', delta: '1. Test' },
    }));
    replica.apply(event({
      type: 'turn.proposedPlanCompleted', threadId: 'session-1', turnId: 'turn-1',
      payload: { itemId: 'plan-1', markdown: '1. Test' },
    }));
    replica.apply(event({ type: 'error', payload: { message: 'failed' } }));

    expect(replica.getSnapshot()).toMatchObject({
      answeredClientRequestIds: ['approval-1'],
      error: 'failed',
      plan: { turnId: 'turn-1' },
      messages: expect.arrayContaining([expect.objectContaining({
        role: 'assistant',
        parts: expect.arrayContaining([
          expect.objectContaining({ id: 'tool-1', status: 'completed', output: 'pass' }),
          expect.objectContaining({
            id: 'approval-approval-1',
            metadata: expect.objectContaining({ confirmationRequestId: 'approval-1' }),
          }),
          expect.objectContaining({ id: 'plan-turn-1', metadata: expect.objectContaining({ planProgress: true }) }),
        ]),
      })]),
    });
  });

  it('rejects events from another agent', () => {
    const replica = createClaudeConversationReplica(emptySnapshot());
    expect(() => replica.apply({
      ...event({ type: 'error', payload: { message: 'wrong owner' } }),
      agentId: 'agent-2',
    })).toThrow("belongs to 'agent-2'");
  });
});

function emptySnapshot(): ClaudeConversationSnapshot {
  return {
    agentId: 'agent-1',
    sessionId: 'session-1',
    activeTurnId: null,
    turnIds: [],
    turns: [],
    messages: [],
    answeredClientRequestIds: [],
    busy: false,
    historyLoading: false,
    historyState: { hasOlder: false, loadingOlder: false },
    contextUsage: null,
    plan: null,
    error: null,
  };
}

function event<T extends Omit<ClaudeConversationEvent, 'seq' | 'occurredAt' | 'agentId' | 'backend'>>(
  value: T,
): Extract<ClaudeConversationEvent, { type: T['type'] }> {
  return {
    ...value,
    seq: 1,
    occurredAt: '2026-09-06T00:00:01.000Z',
    agentId: 'agent-1',
    backend: 'claude',
  } as unknown as Extract<ClaudeConversationEvent, { type: T['type'] }>;
}
