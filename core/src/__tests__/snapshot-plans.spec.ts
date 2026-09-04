import { describe, expect, it } from 'vitest';
import {
  createInitialSnapshot,
} from '../snapshot';
import { applyConversationEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-conversation-reducer';
import type { MainToRendererEvent } from '../contracts';

describe('snapshot reducer', () => {

  it('stores app-owned plan updates on the agent without duplicating transcript text', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        status: 'completed',
        explanation: 'Current plan',
        markdown: 'Provider markdown must not override the normalized plan',
        plan: [
          { step: 'Inspect composer', status: 'completed' },
          { step: 'Wire Plan mode', status: 'inProgress' },
        ],
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Current plan',
      steps: [
        { step: 'Inspect composer', status: 'completed' },
        { step: 'Wire Plan mode', status: 'inProgress' },
      ],
      markdown: 'Current plan\n- [x] Inspect composer\n- [ ] Wire Plan mode',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].parts).toStrictEqual([
      expect.objectContaining({
        id: 'plan-turn-plan',
        kind: 'generic',
        status: 'completed',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'completed',
          params: {
            addedLines: 3,
            operation: 'write',
            target: 'plan',
          },
        }),
        title: 'plan',
        type: 'tool',
      }),
    ]);
    expect(JSON.stringify(snapshot.messages[0].parts)).not.toContain('Current plan');
  });

  it('derives execution plan completion only from completed steps', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        status: 'completed',
        explanation: 'Current plan',
        plan: [
          { step: 'Inspect composer', status: 'completed' },
          { step: 'Wire Plan mode', status: 'completed' },
        ],
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });

    expect(snapshot.agents[0].plan).toMatchObject({
      kind: 'execution',
      status: 'completed',
    });
  });

  it.each([
    ['completed turn with pending work', { status: 'completed' }, 'incomplete'],
    ['provider-neutral interrupted turn', { status: 'interrupted' }, 'interrupted'],
    ['nested provider interrupted turn', { turn: { id: 'turn-plan', status: 'interrupted' } }, 'interrupted'],
    ['failed turn', { status: 'failed' }, 'failed'],
  ] as const)('finalizes an execution plan for a %s', (_scenario, turnPayload, expectedStatus) => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: 'Current plan',
        plan: [{ step: 'Finish the work', status: 'inProgress' }],
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.completed',
      payload: turnPayload,
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].plan).toMatchObject({
      kind: 'execution',
      status: expectedStatus,
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
  });

  it('sanitizes partial plan updates before storing them on the agent', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: ' ',
        plan: [
          null,
          { step: ' ', status: 'completed' },
          { step: 'Use fallback status', status: 'unknown' },
        ],
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: '',
      steps: [
        { step: 'Use fallback status', status: 'pending' },
      ],
      markdown: '- [ ] Use fallback status',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-empty-plan',
      type: 'turn.planUpdated',
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.agents[0].plan?.turnId).toBe('turn-plan');
  });

  it('ignores plan events missing required thread context at a legacy boundary', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: 'Must not be applied',
        plan: [{ step: 'Ignored', status: 'completed' }],
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.agents[0].plan).toBeUndefined();
    expect(snapshot.messages).toStrictEqual([]);
  });

  it('stores proposed plan deltas and overwrites them with completed plan item text', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'turn-plan-plan',
        delta: '# Draft Plan\n',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'turn-plan-plan',
        delta: '- draft step\n',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].plan?.markdown).toBe('# Draft Plan\n- draft step\n');

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanCompleted',
      payload: {
        itemId: 'turn-plan-plan',
        markdown: '# Final Plan\n\n- final step\n',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      kind: 'proposed',
      status: 'completed',
      explanation: '',
      steps: [],
      markdown: '# Final Plan\n\n- final step',
      updatedAt: '2026-06-05T00:00:02.000Z',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.completed',
      payload: { status: 'interrupted' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agents[0].plan).toMatchObject({
      kind: 'proposed',
      status: 'completed',
      updatedAt: '2026-06-05T00:00:02.000Z',
    });
  });

  it('extracts proposed plan tags from assistant deltas into agent plan state', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: '<proposed_plan>\n# Dummy Plan',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'running',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'running',
          params: {
            addedLines: 1,
            operation: 'write',
            target: 'plan',
          },
        }),
        metadata: {
          capturingProposedPlan: true,
          planProgress: true,
        },
      }),
    ]);
    expect(snapshot.agents[0].plan?.markdown).toBe('\n# Dummy Plan');

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: '\n\n- [ ] Do nothing\n</proposed_plan>',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      kind: 'proposed',
      status: 'completed',
      explanation: '',
      steps: [],
      markdown: '# Dummy Plan\n\n- [ ] Do nothing',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'completed',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'completed',
          params: {
            addedLines: 2,
            operation: 'write',
            target: 'plan',
          },
        }),
        metadata: {
          capturingProposedPlan: false,
          planProgress: true,
        },
      }),
    ]);
  });

  it('completes a proposed plan even when the final markdown is unchanged', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: { itemId: 'turn-plan-plan', delta: '# Plan' },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    expect(snapshot.agents[0].plan?.status).toBe('inProgress');

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanCompleted',
      payload: { itemId: 'turn-plan-plan', markdown: '# Plan' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].plan).toMatchObject({
      kind: 'proposed',
      status: 'completed',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
  });

  it('keeps text around proposed plan tags while hiding the plan body from chat', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: 'I will draft this.\n<proposed_plan>\n# Plan\n',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: '- [ ] Do it\n</proposed_plan>\nReady for review.',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      { type: 'text', text: 'I will draft this.\n' },
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        status: 'completed',
        title: 'plan',
      }),
      { type: 'text', text: '\nReady for review.' },
    ]);
    expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).not.toContain('<proposed_plan>');
    expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).not.toContain('- [ ] Do it');
  });

  it('renders typed proposed plan deltas as an ungrouped plan progress tool with line stats', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'plan-item',
        delta: '# Plan\n',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'plan-item',
        delta: '- [ ] Do it\n',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'running',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'running',
          params: {
            addedLines: 2,
            operation: 'write',
            target: 'plan',
          },
        }),
        metadata: {
          capturingProposedPlan: false,
          planProgress: true,
        },
      }),
    ]);
  });
});
