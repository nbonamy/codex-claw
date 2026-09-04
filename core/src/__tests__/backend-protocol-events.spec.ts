import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ClawBackendEvent as RpcClawBackendEvent } from '../backend-protocol/rpc';
import {
  decodeClawBackendEvent,
  type ClawBackendEvent,
} from '../backend-protocol/events';
import type { AppSnapshot } from '../contracts';
import { createInitialSnapshot } from '../snapshot-construction';

type EventOf<Type extends ClawBackendEvent['type']> = Extract<
  ClawBackendEvent,
  { type: Type }
>;
type EventFixtures = { [Type in ClawBackendEvent['type']]: EventOf<Type> };

const occurredAt = '2026-09-04T12:00:00.000Z';
const usage = {
  totalTokens: 10,
  inputTokens: 4,
  cachedInputTokens: 1,
  outputTokens: 5,
  reasoningOutputTokens: 2,
  lastTotalTokens: 9,
  modelContextWindow: 1000,
  usedPercent: 1,
};
const message = {
  id: 'message-1',
  agentId: 'agent-1',
  role: 'assistant' as const,
  status: 'complete' as const,
  parts: [{ type: 'text' as const, text: 'Done' }],
  createdAt: occurredAt,
};
const toolPart = {
  type: 'tool' as const,
  id: 'tool-1',
  kind: 'command',
  title: 'Run tests',
  status: 'completed' as const,
};
const gitStatus = {
  folder: '/repo',
  ahead: 0,
  behind: 0,
  changedFiles: 0,
  addedLines: 0,
  removedLines: 0,
  hasUntracked: false,
  state: 'clean' as const,
  updatedAt: occurredAt,
};
const approval = {
  id: 'approval-1',
  kind: 'command' as const,
  conversationId: 'thread-1',
  itemId: 'item-1',
  title: 'Run command',
};
const confirmTool = {
  id: 'request-1',
  kind: 'confirm_tool' as const,
  payload: {
    confirmation: {
      argumentsPreview: 'npm test',
      integrationId: 'shell',
      integrationName: 'Shell',
      summary: 'Run tests',
      toolName: 'exec',
    },
  },
};
const askUser = {
  id: 'request-2',
  kind: 'ask_user' as const,
  payload: {
    request: {
      itemId: 'item-2',
      questions: [
        {
          id: 'question-1',
          header: 'Choice',
          question: 'Continue?',
          isOther: false,
          isSecret: false,
          options: [{ label: 'Yes', description: 'Continue' }],
        },
      ],
    },
  },
};

function createFixtures(): EventFixtures {
  const snapshot = createInitialSnapshot();
  const { messages: _messages, ...metadata } = snapshot;
  const base = { seq: 1, occurredAt };
  const agent = { ...base, agentId: 'agent-1' };
  const codexThread = {
    ...agent,
    backend: 'codex' as const,
    threadId: 'thread-1',
  };
  const turn = { ...codexThread, turnId: 'turn-1' };

  return {
    'backend.statusChanged': {
      ...base,
      type: 'backend.statusChanged',
      backend: 'codex',
      payload: { backend: 'codex', status: 'running' },
    },
    'client.connectionChanged': {
      ...base,
      type: 'client.connectionChanged',
      payload: { status: 'connected' },
    },
    'snapshot.updated': {
      ...base,
      type: 'snapshot.updated',
      payload: metadata,
    },
    'account.rateLimitsUpdated': {
      ...base,
      type: 'account.rateLimitsUpdated',
      backend: 'codex',
      payload: {
        limitId: null,
        limitName: null,
        primary: null,
        secondary: null,
        credits: null,
        individualLimit: null,
        planType: null,
        rateLimitReachedType: null,
      },
    },
    'devicePairing.statusChanged': {
      ...base,
      type: 'devicePairing.statusChanged',
      payload: { status: 'connected' },
    },
    'models.changed': {
      ...base,
      type: 'models.changed',
      backend: 'codex',
      payload: { models: [{ id: 'gpt', model: 'gpt', displayName: 'GPT' }] },
    },
    'skills.changed': {
      ...base,
      type: 'skills.changed',
      backend: 'codex',
      payload: {
        cwd: null,
        status: 'loaded',
        skills: [{ name: 'test', path: '/skill', enabled: true }],
      },
    },
    'sidePanel.markdownRequested': {
      ...agent,
      type: 'sidePanel.markdownRequested',
      payload: { kind: 'markdown', content: '# Plan' },
    },
    'sidePanel.gitDiffRequested': {
      ...agent,
      type: 'sidePanel.gitDiffRequested',
      payload: { kind: 'gitDiff', diff: '' },
    },
    'celebration.requested': {
      ...agent,
      type: 'celebration.requested',
      payload: { kind: 'stars' },
    },
    'agentCreation.progress': {
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
    'git.operationProgress': {
      ...agent,
      type: 'git.operationProgress',
      payload: { operation: 'merge', phase: 'delivery' },
    },
    'browser.annotationCreated': {
      ...base,
      type: 'browser.annotationCreated',
      payload: {
        id: 'annotation-1',
        agentId: 'agent-1',
        browserId: 'primary',
        url: 'https://example.com',
        kind: 'area',
        rect: { x: 1, y: 2, width: 3, height: 4 },
      },
    },
    'workBacklog.assignmentUpdated': {
      ...base,
      type: 'workBacklog.assignmentUpdated',
      payload: {
        provider: 'github',
        itemId: '7',
        agentId: 'agent-1',
        assignedAt: occurredAt,
        status: 'inProgress',
      },
    },
    'workRouting.requested': {
      ...base,
      type: 'workRouting.requested',
      payload: {
        id: 'routing-1',
        kind: 'work_routing',
        payload: {
          request: {
            agentId: 'agent-1',
            task: 'Fix',
            suggestedBranchName: 'fix/7',
            sharedFolderAgentNames: [],
          },
        },
      },
    },
    'workRouting.resolved': {
      ...base,
      type: 'workRouting.resolved',
      payload: { id: 'routing-1' },
    },
    'clientRequest.resolved': {
      ...codexThread,
      type: 'clientRequest.resolved',
      payload: { id: 'request-1' },
    },
    'agent.updated': {
      ...agent,
      type: 'agent.updated',
      payload: { id: 'agent-1' },
    },
    'agent.statusChanged': {
      ...agent,
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    },
    'thread.started': {
      ...codexThread,
      type: 'thread.started',
      payload: { cwd: '/repo' },
    },
    'thread.settingsUpdated': {
      ...codexThread,
      type: 'thread.settingsUpdated',
      payload: { threadSettings: {} },
    },
    'thread.modeUpdated': {
      ...codexThread,
      type: 'thread.modeUpdated',
      payload: { mode: 'plan' },
    },
    'thread.goalUpdated': {
      ...agent,
      threadId: 'thread-1',
      type: 'thread.goalUpdated',
      payload: {
        threadId: 'thread-1',
        objective: 'Ship',
        status: 'active',
        tokenBudget: null,
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    'thread.goalCleared': { ...agent, type: 'thread.goalCleared', payload: {} },
    'thread.tokenUsageUpdated': {
      ...codexThread,
      type: 'thread.tokenUsageUpdated',
      payload: usage,
    },
    'thread.historyLoaded': {
      ...agent,
      type: 'thread.historyLoaded',
      payload: { messages: [message] },
    },
    'subagent.operationChanged': {
      ...codexThread,
      type: 'subagent.operationChanged',
      payload: {
        rootConversationId: 'thread-1',
        operation: {
          id: 'operation-1',
          lifecycle: 'started',
          kind: 'spawnAgent',
          status: 'inProgress',
          senderConversationId: 'thread-1',
          receiverConversationIds: [],
          occurredAt,
        },
        agentStates: {},
      },
    },
    'subagent.activityChanged': {
      ...codexThread,
      type: 'subagent.activityChanged',
      payload: {
        rootConversationId: 'thread-1',
        parentConversationId: 'thread-1',
        activity: {
          id: 'activity-1',
          lifecycle: 'started',
          kind: 'started',
          conversationId: 'child-1',
          agentPath: 'child',
          occurredAt,
        },
      },
    },
    'subagent.identityChanged': {
      ...codexThread,
      type: 'subagent.identityChanged',
      payload: { rootConversationId: 'thread-1', conversationId: 'child-1' },
    },
    'subagent.statusChanged': {
      ...codexThread,
      type: 'subagent.statusChanged',
      payload: {
        rootConversationId: 'thread-1',
        conversationId: 'child-1',
        status: 'running',
      },
    },
    'turn.started': {
      ...turn,
      type: 'turn.started',
      payload: { status: 'inProgress', startedAt: occurredAt },
    },
    'turn.planUpdated': {
      ...turn,
      type: 'turn.planUpdated',
      payload: {
        explanation: null,
        plan: [{ step: 'Test', status: 'pending' }],
      },
    },
    'turn.proposedPlanDelta': {
      ...turn,
      type: 'turn.proposedPlanDelta',
      payload: { itemId: 'item-1', delta: 'Plan', markdown: 'Plan' },
    },
    'turn.proposedPlanCompleted': {
      ...turn,
      type: 'turn.proposedPlanCompleted',
      payload: { itemId: 'item-1', markdown: 'Plan' },
    },
    'turn.completed': {
      ...turn,
      type: 'turn.completed',
      payload: { status: 'completed' },
    },
    'context.compactionStarted': {
      ...turn,
      type: 'context.compactionStarted',
      payload: {},
    },
    'context.compactionCompleted': {
      ...turn,
      type: 'context.compactionCompleted',
      payload: { itemId: null },
    },
    'message.delta': {
      ...turn,
      type: 'message.delta',
      payload: { delta: 'Hello' },
    },
    'message.updated': {
      ...turn,
      type: 'message.updated',
      payload: { message },
    },
    'message.userSubmitted': {
      ...agent,
      type: 'message.userSubmitted',
      payload: { message: { ...message, role: 'user' } },
    },
    'message.steer': {
      ...agent,
      type: 'message.steer',
      payload: { prompt: 'Continue' },
    },
    'agent.promptQueued': {
      ...agent,
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'Fix it' },
    },
    'agent.promptRetryScheduled': {
      ...agent,
      type: 'agent.promptRetryScheduled',
      payload: { id: 'prompt-1', attempts: 1, lastError: 'retry' },
    },
    'agent.promptDequeued': {
      ...agent,
      type: 'agent.promptDequeued',
      payload: { ids: ['prompt-1'] },
    },
    'item.started': { ...turn, type: 'item.started', payload: { toolPart } },
    'item.updated': {
      ...turn,
      type: 'item.updated',
      payload: { itemId: 'tool-1', status: 'running' },
    },
    'item.completed': {
      ...turn,
      type: 'item.completed',
      payload: { toolPart },
    },
    'diff.updated': {
      ...turn,
      type: 'diff.updated',
      payload: { addedLines: 1, removedLines: 0, diff: '+line' },
    },
    'file.activity': {
      ...turn,
      type: 'file.activity',
      payload: {
        messageId: 'message-1',
        itemId: 'item-1',
        path: 'src/a.ts',
        action: 'edit',
        status: 'completed',
      },
    },
    'git.statusUpdated': {
      ...agent,
      type: 'git.statusUpdated',
      payload: gitStatus,
    },
    'approval.requested': {
      ...codexThread,
      type: 'approval.requested',
      payload: confirmTool,
    },
    'toolInput.requested': {
      ...codexThread,
      type: 'toolInput.requested',
      payload: askUser,
    },
    'backendApproval.requested': {
      ...codexThread,
      type: 'backendApproval.requested',
      payload: { approval },
    },
    'backendApproval.resolved': {
      ...codexThread,
      type: 'backendApproval.resolved',
      payload: { approval, decision: 'approve', scope: 'once', reason: 'host' },
    },
    error: {
      ...agent,
      type: 'error',
      payload: { message: 'Backend error', willRetry: false },
    },
  };
}

describe('Claw backend event decoder', () => {
  it('accepts one representative for every typed event key without cloning it', () => {
    const fixtures = createFixtures();

    expect(Object.keys(fixtures)).toHaveLength(55);
    for (const event of Object.values(fixtures)) {
      expect(decodeClawBackendEvent(event)).toBe(event);
    }
  });

  it('accepts valid full snapshot and client-state side channels', () => {
    const event = createFixtures()['snapshot.updated'];
    const withSideChannels = {
      ...event,
      snapshot: createInitialSnapshot(),
      clientState: {
        sourceFolderPath: '/src',
        shouldPreventDisplaySleep: false,
        shouldPreventDisplaySleepForRemoteAccess: true,
      },
    };

    expect(decodeClawBackendEvent(withSideChannels)).toBe(withSideChannels);
  });

  it.each([
    [null, '$: expected an object'],
    [
      {
        seq: '1',
        occurredAt,
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
      },
      '$.seq: expected a number',
    ],
    [
      {
        seq: 1,
        occurredAt: 2,
        type: 'client.connectionChanged',
        payload: { status: 'connected' },
      },
      '$.occurredAt: expected a string',
    ],
    [
      { seq: 1, occurredAt, type: 'unknown', payload: {} },
      '$.type: expected a supported event type',
    ],
  ])(
    'rejects malformed envelopes with structural diagnostics',
    (value, diagnostic) => {
      expect(() => decodeClawBackendEvent(value)).toThrow(diagnostic);
    },
  );

  it('reports a precise nested payload path', () => {
    const event = createFixtures()['models.changed'];
    const malformed = {
      ...event,
      payload: { models: [{ id: 42, model: 'gpt', displayName: 'GPT' }] },
    };

    expect(() => decodeClawBackendEvent(malformed)).toThrow(
      '$.payload.models[0].id: expected a string',
    );
  });

  it('rejects missing required provider context', () => {
    const event = createFixtures()['turn.started'];
    const malformed = { ...event, turnId: undefined };

    expect(() => decodeClawBackendEvent(malformed)).toThrow(
      '$.turnId: expected a string',
    );
  });

  it('rejects malformed snapshot and client-state side channels', () => {
    const event = createFixtures()['snapshot.updated'];

    expect(() =>
      decodeClawBackendEvent({ ...event, snapshot: { teams: [] } }),
    ).toThrow('$.snapshot: expected full application snapshot');
    expect(() =>
      decodeClawBackendEvent({
        ...event,
        clientState: { sourceFolderPath: '/src' },
      }),
    ).toThrow('$.clientState: expected client state');
  });

  it('never includes payload values in validation errors', () => {
    const secret = 'sk-secret-do-not-log';
    const event = createFixtures()['message.updated'];
    const malformed = { ...event, payload: { message: { password: secret } } };

    let error: unknown;
    try {
      decodeClawBackendEvent(malformed);
    } catch (candidate) {
      error = candidate;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(secret);
  });

  it('keeps the rpc compatibility export identical to the owner type', () => {
    expectTypeOf<ClawBackendEvent>().toEqualTypeOf<RpcClawBackendEvent>();
    expectTypeOf<
      ReturnType<typeof decodeClawBackendEvent>
    >().toEqualTypeOf<ClawBackendEvent>();
    expectTypeOf<
      Extract<ClawBackendEvent, { type: 'snapshot.updated' }>['snapshot']
    >().toEqualTypeOf<AppSnapshot | undefined>();
  });
});
