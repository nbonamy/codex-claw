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
  const metadata = snapshot;
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
    'codex.conversationSnapshotChanged': {
      ...codexThread,
      type: 'codex.conversationSnapshotChanged',
      payload: {
        revision: 1,
        snapshot: {
          status: 'ready',
          authentication: {
            status: 'loaded', account: null, requiresOpenaiAuth: false,
            error: null, login: { status: 'idle', loginId: null, authUrl: null, error: null },
          },
          conversations: [],
          activeConversationId: 'thread-1',
          activeTurnId: null,
          turnIds: [],
          turns: [],
          messages: [],
          historyLoading: false,
          historyState: { loadingStrategy: 'eager', hasOlder: false, loadingOlder: false, fullyLoaded: true },
          clientRequests: [],
          answeredClientRequestIds: [],
          approvals: [],
          models: [],
          modelCatalogStatus: 'loaded',
          skills: [],
          skillCatalogStatus: 'loaded',
          plugins: [],
          pluginCatalogStatus: 'loaded',
          permissionProfiles: [],
          approvalPresets: [],
          approvalPreset: null,
          selectedModelId: null,
          selectedReasoningEffort: null,
          selectedServiceTier: null,
          planMode: false,
          contextUsage: null,
          goal: null,
          turnGitDiff: null,
          threadStatus: null,
          rateLimits: null,
          queuedPrompts: [],
          busy: false,
          error: null,
        },
      },
    },
    'codex.conversationEventReceived': {
      ...codexThread,
      type: 'codex.conversationEventReceived',
      payload: {
        revision: 2,
        event: {
          seq: 7,
          occurredAt,
          origin: 'notification',
          type: 'message.delta',
          conversationId: 'thread-1',
          turnId: 'turn-1',
          payload: {
            messageId: 'message-1',
            itemId: 'item-1',
            delta: 'Hello',
          },
        },
      },
    },
    'claude.conversationSnapshotChanged': {
      ...agent,
      backend: 'claude',
      type: 'claude.conversationSnapshotChanged',
      payload: {
        revision: 1,
        snapshot: {
          agentId: 'agent-1',
          sessionId: 'claude-session-1',
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
        },
      },
    },
    'claude.conversationEventReceived': {
      ...agent,
      backend: 'claude',
      type: 'claude.conversationEventReceived',
      payload: {
        revision: 2,
        event: {
          seq: 2,
          occurredAt,
          agentId: 'agent-1',
          backend: 'claude',
          backendSessionId: 'claude-session-1',
          turnId: 'turn-1',
          type: 'message.delta',
          payload: { delta: 'Hello' },
        },
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
    'thread.historyHydrationFailed': {
      ...agent,
      type: 'thread.historyHydrationFailed',
      payload: {},
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
  };
}

describe('Claw backend event decoder', () => {
  it('accepts one representative for every typed event key without cloning it', () => {
    const fixtures = createFixtures();

    expect(Object.keys(fixtures)).toHaveLength(40);
    for (const event of Object.values(fixtures)) {
      expect(decodeClawBackendEvent(event)).toBe(event);
    }
  });

  it('accepts rich queued-prompt options for both provider backends', () => {
    const fixture = createFixtures()['agent.promptQueued'];
    const codexPrompt = {
      ...fixture,
      payload: {
        id: 'prompt-codex',
        text: 'Inspect the attached files',
        submitted: true,
        options: {
          attachments: [
            {
              type: 'image',
              path: '/tmp/screenshot.png',
              name: 'screenshot.png',
              mimeType: 'image/png',
              detail: 'original',
              previewUrl: 'data:image/png;base64,AA==',
            },
            {
              type: 'file',
              path: '/tmp/report.txt',
              name: 'report.txt',
              mimeType: 'text/plain',
            },
          ],
          model: null,
          reasoningEffort: 'high',
          serviceTier: null,
          planMode: true,
          skills: [{ name: 'review', path: '/skills/review/SKILL.md' }],
          inputMethod: 'dictated',
          recordUserMessage: false,
          backendOptions: {
            kind: 'codex',
            reasoningEffort: null,
            serviceTier: 'priority',
            skills: [{ name: 'review', path: '/skills/review/SKILL.md' }],
          },
        },
      },
    };
    const claudePrompt = {
      ...fixture,
      payload: {
        id: 'prompt-claude',
        text: 'Use extended thinking',
        options: {
          inputMethod: 'typed',
          backendOptions: {
            kind: 'claude',
            thinkingBudgetTokens: 8_000,
            permissionMode: null,
          },
        },
      },
    };

    expect(decodeClawBackendEvent(codexPrompt)).toBe(codexPrompt);
    expect(decodeClawBackendEvent(claudePrompt)).toBe(claudePrompt);
  });

  it('accepts rich coordination metadata for retries and approvals', () => {
    const fixtures = createFixtures();
    const retry = {
      ...fixtures['agent.promptRetryScheduled'],
      payload: {
        id: 'prompt-1',
        attempts: 2,
        lastError: 'provider temporarily unavailable',
        retryAt: '2026-09-04T12:01:00.000Z',
      },
    };
    const richApproval = {
      id: 'approval-permissions',
      kind: 'permissions',
      conversationId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
      title: 'Expand sandbox access',
      description: 'Read the fixture and call the package registry',
      command: 'npm test',
      cwd: '/repo',
      requestedPermissions: [
        { kind: 'filesystem', access: 'read', path: '/repo/fixtures' },
        { kind: 'network', enabled: true, host: 'registry.npmjs.org', protocol: 'https' },
      ],
      allowedScopes: ['once', 'session'],
      canDeny: true,
    };
    const requested = {
      ...fixtures['backendApproval.requested'],
      turnId: 'turn-1',
      payload: { approval: richApproval },
    };
    const resolved = {
      ...fixtures['backendApproval.resolved'],
      turnId: 'turn-1',
      payload: {
        approval: richApproval,
        decision: null,
        scope: null,
        reason: 'surface_disconnected',
      },
    };

    expect(decodeClawBackendEvent(retry)).toBe(retry);
    expect(decodeClawBackendEvent(requested)).toBe(requested);
    expect(decodeClawBackendEvent(resolved)).toBe(resolved);
  });

  it('accepts populated provider conversation snapshot frames', () => {
    const fixtures = createFixtures();
    const codexFrame = structuredClone(
      fixtures['codex.conversationSnapshotChanged'],
    );
    codexFrame.payload.snapshot.activeTurnId = 'turn-1';
    codexFrame.payload.snapshot.turnIds = ['turn-1'];
    codexFrame.payload.snapshot.turns = [{
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      willRetry: false,
      startedAt: occurredAt,
      completedAt: null,
      durationMs: null,
    }];
    codexFrame.payload.snapshot.messages = [message];
    codexFrame.payload.snapshot.busy = true;
    codexFrame.payload.snapshot.historyLoading = true;
    codexFrame.payload.snapshot.historyState = {
      loadingStrategy: 'lazy',
      hasOlder: true,
      loadingOlder: true,
      fullyLoaded: false,
    };

    const claudeFrame = structuredClone(
      fixtures['claude.conversationSnapshotChanged'],
    );
    claudeFrame.payload.snapshot.sessionId = 'claude-session-1';
    claudeFrame.payload.snapshot.activeTurnId = 'turn-1';
    claudeFrame.payload.snapshot.turnIds = ['turn-1'];
    claudeFrame.payload.snapshot.turns = [{
      id: 'turn-1',
      status: 'interrupted',
      error: null,
      willRetry: false,
      startedAt: occurredAt,
      completedAt: occurredAt,
      durationMs: 10,
    }];
    claudeFrame.payload.snapshot.messages = [
      { ...message, role: 'user' },
      message,
      { ...message, id: 'message-system', role: 'system' },
    ];
    claudeFrame.payload.snapshot.contextUsage = usage;
    claudeFrame.payload.snapshot.plan = {
      threadId: 'claude-session-1',
      turnId: 'turn-1',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Verify the change',
      steps: [{ step: 'Run tests', status: 'inProgress' }],
      markdown: '- [ ] Run tests',
      updatedAt: occurredAt,
    };
    claudeFrame.payload.snapshot.error = 'Interrupted by user';

    expect(decodeClawBackendEvent(codexFrame)).toBe(codexFrame);
    expect(decodeClawBackendEvent(claudeFrame)).toBe(claudeFrame);
  });

  it('accepts provider event frames with all optional routing context', () => {
    const fixtures = createFixtures();
    const codexFixture = fixtures['codex.conversationEventReceived'];
    const codexFrame = {
      ...codexFixture,
      payload: {
        ...codexFixture.payload,
        event: {
          ...codexFixture.payload.event,
          origin: 'action',
          turnId: 'turn-1',
        },
      },
    };

    const claudeFrame = structuredClone(
      fixtures['claude.conversationEventReceived'],
    );
    claudeFrame.payload.event.backendSessionId = 'claude-session-1';
    claudeFrame.payload.event.threadId = 'claude-session-1';
    claudeFrame.payload.event.turnId = 'turn-1';

    expect(decodeClawBackendEvent(codexFrame)).toBe(codexFrame);
    expect(decodeClawBackendEvent(claudeFrame)).toBe(claudeFrame);
  });

  it('rejects a Claude event routed under a different agent', () => {
    const event = createFixtures()['claude.conversationEventReceived'];

    expect(() => decodeClawBackendEvent({
      ...event,
      agentId: 'agent-other',
    })).toThrow('$.payload.event.agentId: expected the outer agent id');
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

  it('rejects a Codex event routed under a different conversation', () => {
    const event = createFixtures()['codex.conversationEventReceived'];
    expect(() => decodeClawBackendEvent({
      ...event,
      threadId: 'thread-other',
    })).toThrow('$.payload.event.conversationId: expected the outer thread id');
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

  it('keeps history hydration failure payloads strictly empty', () => {
    const event = createFixtures()['thread.historyHydrationFailed'];

    expect(() => decodeClawBackendEvent({
      ...event,
      payload: { detail: 'provider diagnostics stay in backend logs' },
    })).toThrow('$.payload: expected an empty object');
  });

  it('rejects missing required provider context', () => {
    const event = createFixtures()['diff.updated'];
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
    const event = createFixtures()['backendApproval.requested'];
    const malformed = { ...event, payload: { approval: { password: secret } } };

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
