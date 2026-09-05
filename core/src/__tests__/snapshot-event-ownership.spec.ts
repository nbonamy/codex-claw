import { describe, expect, expectTypeOf, it } from 'vitest';
import type { MainToRendererEvent } from '../contracts';
import { applyMainEventToSnapshot, createInitialSnapshot } from '../snapshot';
import { applyConversationEventToSnapshot } from '../snapshot-conversation-reducer';
import {
  isSnapshotEventOwnedBy,
  snapshotEventOwnership,
  type RendererOnlySnapshotEvent,
  type SnapshotEventOwnedBy,
  type SnapshotEventTypeOwnedBy,
} from '../snapshot-event-ownership';
import { applyRuntimeEventToSnapshot } from '../snapshot-runtime-reducer';
import { applySubagentEventToSnapshot } from '../snapshot-subagent-reducer';

const runtimeEventTypes = [
  'backend.statusChanged',
  'snapshot.updated',
  'account.rateLimitsUpdated',
  'workBacklog.assignmentUpdated',
  'workRouting.requested',
  'workRouting.resolved',
  'agent.updated',
  'agent.statusChanged',
  'thread.started',
  'thread.settingsUpdated',
  'thread.goalUpdated',
  'thread.goalCleared',
  'thread.tokenUsageUpdated',
  'git.statusUpdated',
] as const satisfies readonly SnapshotEventTypeOwnedBy<'runtime'>[];

const conversationEventTypes = [
  'thread.historyLoaded',
  'turn.started',
  'turn.planUpdated',
  'turn.proposedPlanDelta',
  'turn.proposedPlanCompleted',
  'turn.completed',
  'context.compactionStarted',
  'context.compactionCompleted',
  'message.delta',
  'message.updated',
  'message.userSubmitted',
  'message.steer',
  'agent.promptQueued',
  'agent.promptRetryScheduled',
  'agent.promptDequeued',
  'item.started',
  'item.updated',
  'item.completed',
  'diff.updated',
  'approval.requested',
  'toolInput.requested',
  'backendApproval.requested',
  'backendApproval.resolved',
  'error',
] as const satisfies readonly SnapshotEventTypeOwnedBy<'conversation'>[];

const subagentEventTypes = [
  'subagent.operationChanged',
  'subagent.activityChanged',
  'subagent.identityChanged',
  'subagent.statusChanged',
] as const satisfies readonly SnapshotEventTypeOwnedBy<'subagent'>[];

const rendererEventTypes = [
  'client.connectionChanged',
  'devicePairing.statusChanged',
  'models.changed',
  'skills.changed',
  'sidePanel.markdownRequested',
  'sidePanel.gitDiffRequested',
  'celebration.requested',
  'agentCreation.progress',
  'git.operationProgress',
  'browser.annotationCreated',
  'clientRequest.resolved',
  'thread.modeUpdated',
  'file.activity',
] as const satisfies readonly SnapshotEventTypeOwnedBy<'renderer'>[];

const occurredAt = '2026-09-04T00:00:00.000Z';
const base = { seq: 1, occurredAt } as const;
const agent = { ...base, agentId: 'agent-dina' } as const;
const rendererOnlyEvents = [
  {
    ...base,
    type: 'client.connectionChanged',
    payload: { status: 'connected' },
  },
  {
    ...base,
    type: 'devicePairing.statusChanged',
    payload: { status: 'connected' },
  },
  {
    ...base,
    type: 'models.changed',
    backend: 'codex',
    payload: { models: [{ id: 'gpt', model: 'gpt', displayName: 'GPT' }] },
  },
  {
    ...base,
    type: 'skills.changed',
    backend: 'codex',
    payload: {
      cwd: null,
      status: 'loaded',
      skills: [{ name: 'test', path: '/skill', enabled: true }],
    },
  },
  {
    ...agent,
    type: 'sidePanel.markdownRequested',
    payload: { kind: 'markdown', content: '# Plan' },
  },
  {
    ...agent,
    type: 'sidePanel.gitDiffRequested',
    payload: { kind: 'gitDiff', diff: '' },
  },
  {
    ...agent,
    type: 'celebration.requested',
    payload: { kind: 'stars' },
  },
  {
    ...agent,
    type: 'agentCreation.progress',
    payload: {
      id: 'creation-1',
      state: 'running',
      backend: 'codex',
      repositoryName: 'repo',
      createWorktree: true,
      hasPrompt: true,
    },
  },
  {
    ...agent,
    type: 'git.operationProgress',
    payload: { operation: 'merge', phase: 'delivery' },
  },
  {
    ...base,
    type: 'browser.annotationCreated',
    payload: {
      id: 'annotation-1',
      agentId: 'agent-dina',
      browserId: 'primary',
      url: 'https://example.com',
      kind: 'area',
      rect: { x: 1, y: 2, width: 3, height: 4 },
    },
  },
  {
    ...agent,
    backend: 'codex',
    type: 'clientRequest.resolved',
    payload: { id: 'request-1' },
  },
  {
    ...agent,
    backend: 'codex',
    threadId: 'thread-1',
    type: 'thread.modeUpdated',
    payload: { mode: 'plan' },
  },
  {
    ...agent,
    backend: 'codex',
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'file.activity',
    payload: {
      messageId: 'message-1',
      itemId: 'item-1',
      path: 'src/a.ts',
      action: 'edit',
      status: 'completed',
    },
  },
] as const satisfies readonly RendererOnlySnapshotEvent[];

describe('snapshot event ownership', () => {
  it('partitions every event type exactly once', () => {
    type OwnedEventType = keyof typeof snapshotEventOwnership;
    expectTypeOf<Exclude<MainToRendererEvent['type'], OwnedEventType>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<OwnedEventType, MainToRendererEvent['type']>>().toEqualTypeOf<never>();

    const expectedByOwner = {
      runtime: runtimeEventTypes,
      conversation: conversationEventTypes,
      subagent: subagentEventTypes,
      renderer: rendererEventTypes,
    } as const;
    const assignedTypes = Object.values(expectedByOwner).flat();

    expect(assignedTypes).toHaveLength(55);
    expect(new Set(assignedTypes).size).toBe(55);
    for (const [owner, types] of Object.entries(expectedByOwner)) {
      expect(
        Object.entries(snapshotEventOwnership)
          .filter(([, assignedOwner]) => assignedOwner === owner)
          .map(([type]) => type),
      ).toEqual(types);
    }
  });

  it('gives each reducer only its owned event subset', () => {
    expectTypeOf<Parameters<typeof applyRuntimeEventToSnapshot>[1]>()
      .toEqualTypeOf<SnapshotEventOwnedBy<'runtime'>>();
    expectTypeOf<Parameters<typeof applyConversationEventToSnapshot>[1]>()
      .toEqualTypeOf<SnapshotEventOwnedBy<'conversation'>>();
    expectTypeOf<Parameters<typeof applySubagentEventToSnapshot>[1]>()
      .toEqualTypeOf<SnapshotEventOwnedBy<'subagent'>>();
  });

  it('explicitly ignores renderer-owned events in the snapshot facade', () => {
    expect(rendererOnlyEvents.map((event) => event.type)).toEqual(rendererEventTypes);

    for (const event of rendererOnlyEvents) {
      const snapshot = createInitialSnapshot();
      const before = structuredClone(snapshot);

      expect(isSnapshotEventOwnedBy(event, 'renderer')).toBe(true);
      applyMainEventToSnapshot(snapshot, event);

      expect(snapshot).toStrictEqual(before);
    }
  });
});
