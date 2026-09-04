import { describe, expect, it } from 'vitest';
import { updateAgentFolder } from '../agent-manager';
import {
  applyMainEventToSnapshot,
  createInitialSnapshot,
} from '../snapshot';
import type { MainToRendererEvent } from '../contracts';

describe('snapshot reducer', () => {

  it('handles reducer fallback and error events without Codex protocol leaking into UI state', () => {
    const snapshot = createInitialSnapshot();

    expect(updateAgentFolder(snapshot, 'missing-agent', '/tmp/nope')).toBeNull();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'message.delta',
      payload: { delta: 'ignored without agent' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as MainToRendererEvent);
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-with-empty-delta',
      type: 'message.delta',
      payload: { delta: 123 },
      occurredAt: '2026-06-05T00:00:02.000Z',
    } as unknown as MainToRendererEvent);
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'error',
      payload: {},
      occurredAt: '2026-06-05T00:00:03.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Backend error' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'Backend error' }]);

    const approval = {
      id: 'approval-global',
      kind: 'command' as const,
      conversationId: 'thread-1',
      itemId: 'command-1',
      title: 'Run tests',
    };
    snapshot.backendApprovals['agent-dina'] = [approval];
    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      type: 'backendApproval.resolved',
      payload: { approval, decision: null, scope: null, reason: 'server' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    } as unknown as MainToRendererEvent);
    applyMainEventToSnapshot(snapshot, {
      seq: 5,
      type: 'error',
      payload: { message: 'ignored without agent' },
      occurredAt: '2026-06-05T00:00:05.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([approval]);
    expect(snapshot.messages).toHaveLength(1);
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
});
