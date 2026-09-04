import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { useAppState } from '../app-state';
import { createEmptySnapshot, createInitialSnapshot, snapshotMetadata } from '@codex-claw/core/snapshot';
import type { AppSnapshot, BackendApprovalRequest, BackendConversationRef, CodexClawApi, ConversationSummary, DevicePairingSession, MainToRendererEvent, RendererMessage, SourceRepository, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { workItemAssignmentPrompt } from '@codex-claw/core/work-item-prompts';
import { clearConfetti, useConfetti } from '../shared/confetti/use-confetti';
import { stubElectronTestWindow } from '../test/client';
import { configureClawClient } from '../platform-api';
import { clearFirstRunOnboardingStage, setFirstRunOnboardingStage } from '../onboarding-session';
import { deferred } from './app-state-test-harness';

describe('useAppState', () => {
  afterEach(() => {
    clearConfetti();
    clearFirstRunOnboardingStage();
    vi.useRealTimers();
  });

  it('uses the local empty snapshot before preload is available', () => {
    stubElectronTestWindow({});

    const state = useAppState();

    expect(state.snapshot.value).toStrictEqual(createEmptySnapshot());
    expect(state.activeAgent.value).toBeNull();
    expect(state.visibleMessages.value).toHaveLength(0);
  });

  it('keeps loading idle when snapshot loading is requested without preload', async () => {
    stubElectronTestWindow({});
    const state = useAppState();
    state.isLoading.value = false;

    await state.loadSnapshot();

    expect(state.isLoading.value).toBe(false);
  });

  it('loads snapshots without subscribing when main events are unavailable', async () => {
    const remoteSnapshot = createInitialSnapshot();
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.snapshot.value).toStrictEqual(remoteSnapshot);
  });

  it('loads the snapshot from the preload bridge when available', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0] = {
      ...remoteSnapshot.agents[0],
      id: 'agent-ellie',
      name: 'Ellie',
    };
    remoteSnapshot.activeAgentId = 'agent-ellie';
    remoteSnapshot.messages = [
      {
        id: 'message-ellie',
        agentId: 'agent-ellie',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:00.000Z',
        parts: [{ type: 'text', text: 'Loaded from main.' }],
      },
    ];

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    const load = state.loadSnapshot();

    expect(state.isLoading.value).toBe(true);
    await load;
    await nextTick();

    expect(state.isLoading.value).toBe(false);
    expect(state.activeAgent.value?.name).toBe('Ellie');
    expect(state.visibleMessages.value).toStrictEqual(remoteSnapshot.messages);
  });

  it('restores the selected agent when the desktop backend connects after the renderer starts', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-persisted' };
    const restoredMessage: RendererMessage = {
      id: 'assistant-restored-after-connect',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-06-05T00:00:00.000Z',
      parts: [{ type: 'text', text: 'Restored after clawd connected.' }],
    };
    const getSnapshotState = vi.fn()
      .mockRejectedValueOnce(new Error('clawd snapshot is not available.'))
      .mockResolvedValue({
        snapshot: remoteSnapshot,
        lastBackendEventSeq: 0,
        connection: { status: 'connected' as const },
      });
    const hydrateAgentHistory = vi.fn().mockImplementation(async () => {
      listeners[0]?.({
        seq: 1,
        source: 'backend',
        agentId: 'agent-dina',
        threadId: 'thread-persisted',
        type: 'thread.historyLoaded',
        payload: { messages: [restoredMessage], replace: true },
        occurredAt: '2026-06-05T00:00:01.000Z',
      });
      return snapshotMetadata(remoteSnapshot);
    });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshotState,
        hydrateAgentHistory,
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.snapshot.value = createEmptySnapshot();
    await state.loadSnapshot();

    expect(state.connectionState.value).toStrictEqual({
      status: 'error',
      detail: 'clawd snapshot is not available.',
    });
    expect(state.activeAgent.value).toBeNull();

    listeners[0]?.({
      seq: 1,
      source: 'client',
      type: 'client.connectionChanged',
      payload: { status: 'connected' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    await vi.waitFor(() => expect(state.activeAgent.value?.id).toBe('agent-dina'));
    await vi.waitFor(() => expect(hydrateAgentHistory).toHaveBeenCalledWith('agent-dina'));
    await vi.waitFor(() => expect(state.visibleMessages.value).toStrictEqual([restoredMessage]));
    expect(getSnapshotState).toHaveBeenCalledTimes(2);
    expect(state.connectionState.value).toStrictEqual({ status: 'connected' });
  });

  it('subscribes before loading and preserves transient events received with the startup snapshot', async () => {
    const snapshotLoad = deferred<ReturnType<typeof createInitialSnapshot>>();
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const onEvent = vi.fn((nextListener: (event: MainToRendererEvent) => void) => {
      listeners.push(nextListener);
      return () => undefined;
    });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockReturnValue(snapshotLoad.promise),
        onEvent,
      } satisfies Partial<CodexClawApi>,
    });
    const approval: BackendApprovalRequest = {
      id: 'approval-during-load',
      kind: 'command',
      conversationId: 'thread-dina',
      itemId: 'command-during-load',
      title: 'Run tests',
    };

    const state = useAppState();
    const load = state.loadSnapshot();
    expect(onEvent).toHaveBeenCalledOnce();
    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      type: 'backendApproval.requested',
      payload: { approval },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    snapshotLoad.resolve(createInitialSnapshot());
    await load;

    expect(state.activeBackendApprovals.value).toStrictEqual([approval]);
  });

  it('does not replay a buffered delta already represented by the snapshot cursor', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.messages = [{
      id: 'assistant-turn-1',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      turnId: 'turn-1',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'streamed once' }],
    }];
    let listener: ((event: MainToRendererEvent) => void) | null = null;
    stubElectronTestWindow({
      codexClaw: {
        onEvent: vi.fn((nextListener) => {
          listener = nextListener;
          return () => undefined;
        }),
        getSnapshotState: vi.fn().mockImplementation(async () => {
          listener?.({
            seq: 1,
            source: 'backend',
            agentId: 'agent-dina',
            backend: 'codex',
            threadId: 'thread-dina',
            turnId: 'turn-1',
            type: 'message.delta',
            payload: { delta: 'streamed once' },
            occurredAt: '2026-06-05T00:00:01.000Z',
          });
          return {
            snapshot: remoteSnapshot,
            lastBackendEventSeq: 1,
            connection: { status: 'connected' as const },
          };
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.visibleMessages.value[0]?.parts).toStrictEqual([{ type: 'text', text: 'streamed once' }]);
  });

  it('adopts snapshots from explicit main event snapshot fields', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    const eventSnapshot = createInitialSnapshot();
    eventSnapshot.agents[0] = {
      ...eventSnapshot.agents[0],
      id: 'agent-ellie',
      name: 'Ellie',
    };
    eventSnapshot.activeAgentId = 'agent-ellie';

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    listeners[0]?.({
      seq: 1,
      type: 'snapshot.updated',
      payload: snapshotMetadata(remoteSnapshot),
      occurredAt: '2026-06-05T00:00:01.000Z',
      snapshot: eventSnapshot,
    });

    expect(state.snapshot.value).toStrictEqual(eventSnapshot);
    expect(state.activeAgent.value?.name).toBe('Ellie');
  });

  it('applies snapshot update payloads when an event omits a full snapshot', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    const payloadSnapshot = createInitialSnapshot();
    payloadSnapshot.agents[0] = {
      ...payloadSnapshot.agents[0],
      id: 'agent-ellie',
      name: 'Ellie',
    };
    payloadSnapshot.activeAgentId = 'agent-ellie';

    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    const rendererSnapshot = state.snapshot.value;
    const messages = state.snapshot.value.messages;

    listeners[0]?.({
      seq: 1,
      type: 'snapshot.updated',
      payload: snapshotMetadata(payloadSnapshot),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(state.snapshot.value).toBe(rendererSnapshot);
    expect(state.snapshot.value.messages).toBe(messages);
    expect(state.activeAgent.value?.id).toBe('agent-ellie');
  });

  it('does not let a stale snapshot event steal the current agent selection', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const initialSnapshot = createInitialSnapshot();
    const selectAgent = vi.fn().mockResolvedValue({
      ...structuredClone(initialSnapshot),
      activeAgentId: 'agent-jesse',
    });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(initialSnapshot),
        selectAgent,
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.selectAgent('agent-jesse');

    listeners[0]?.({
      seq: 1,
      type: 'snapshot.updated',
      payload: structuredClone(initialSnapshot),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(state.activeAgent.value?.id).toBe('agent-jesse');
  });

  it('preserves the optimistic agent selection while repairing an event sequence gap', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const backendSnapshot = createInitialSnapshot();
    const getSnapshotState = vi.fn()
      .mockResolvedValueOnce({ snapshot: structuredClone(backendSnapshot), lastBackendEventSeq: 1, connection: { status: 'connected' } })
      .mockResolvedValueOnce({ snapshot: structuredClone(backendSnapshot), lastBackendEventSeq: 3, connection: { status: 'connected' } });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshotState,
        selectAgent: vi.fn().mockResolvedValue({ ...structuredClone(backendSnapshot), activeAgentId: 'agent-jesse' }),
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.selectAgent('agent-jesse');
    listeners[0]?.({
      seq: 3,
      source: 'backend',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    await vi.waitFor(() => expect(getSnapshotState).toHaveBeenCalledTimes(2));

    expect(state.activeAgent.value?.id).toBe('agent-jesse');
  });

  it('shows the shell before persisted history hydration completes', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-persisted' };
    const hydratedSnapshot = {
      ...remoteSnapshot,
      messages: [
        {
          id: 'assistant-turn-history',
          agentId: 'agent-dina',
          role: 'assistant' as const,
          status: 'complete' as const,
          createdAt: '2026-06-05T00:00:00.000Z',
          parts: [{ type: 'text' as const, text: 'Restored history.' }],
        },
      ],
    };
    const hydration = deferred<ReturnType<typeof snapshotMetadata>>();
    const hydrateAgentHistory = vi.fn().mockReturnValue(hydration.promise);
    const selectAgent = vi.fn();
    const onEvent = vi.fn((listener) => {
      listeners.push(listener);
      return () => undefined;
    });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        hydrateAgentHistory,
        selectAgent,
        onEvent,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    const loading = state.loadSnapshot();

    await vi.waitFor(() => expect(hydrateAgentHistory).toHaveBeenCalledWith('agent-dina'));

    expect(onEvent).toHaveBeenCalledOnce();
    expect(selectAgent).not.toHaveBeenCalled();
    expect(state.isLoading.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(true);
    expect(state.visibleMessages.value).toStrictEqual([]);

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-persisted',
      type: 'thread.historyLoaded',
      payload: { messages: hydratedSnapshot.messages, replace: true },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    hydration.resolve(snapshotMetadata(hydratedSnapshot));
    await vi.waitFor(() => expect(state.visibleMessages.value).toStrictEqual(hydratedSnapshot.messages));
    await loading;

    expect(state.isLoading.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(false);
    expect(state.visibleMessages.value).toStrictEqual(hydratedSnapshot.messages);
  });

  it('reconciles persisted threads after renderer restart even when the daemon has cached messages', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const cachedSnapshot = createInitialSnapshot();
    cachedSnapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-persisted' };
    cachedSnapshot.agents[0].status = { type: 'working' };
    cachedSnapshot.messages.push({
      id: 'assistant-stale-turn',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      createdAt: '2026-06-05T00:00:00.000Z',
      parts: [{ type: 'text', text: 'Partial response.' }],
    });
    const reconciledSnapshot = structuredClone(cachedSnapshot);
    reconciledSnapshot.agents[0].status = { type: 'idle' };
    reconciledSnapshot.messages[0]!.status = 'complete';
    const hydrateAgentHistory = vi.fn().mockImplementation(async () => {
      listeners[0]?.({
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-persisted',
        type: 'thread.historyLoaded',
        payload: { messages: reconciledSnapshot.messages, replace: true },
        occurredAt: '2026-06-05T00:00:01.000Z',
      });
      return snapshotMetadata(reconciledSnapshot);
    });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(cachedSnapshot),
        hydrateAgentHistory,
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await vi.waitFor(() => expect(hydrateAgentHistory).toHaveBeenCalledWith('agent-dina'));
    await vi.waitFor(() => expect(state.activeAgent.value?.status).toStrictEqual({ type: 'idle' }));
    expect(state.visibleMessages.value[0]?.status).toBe('complete');
    expect(state.isSending.value).toBe(false);
  });

  it('adopts Claude model metadata discovered by startup history hydration', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0] = {
      ...remoteSnapshot.agents[0],
      backend: 'claude',
      backendSession: {
        kind: 'claude',
        sessionId: 'claude-session-existing',
        transport: 'stdio',
      },
      backendDefaults: { kind: 'claude', model: 'haiku' },
    };
    const hydratedSnapshot = structuredClone(remoteSnapshot);
    hydratedSnapshot.agents[0].backendSession = {
      kind: 'claude',
      sessionId: 'claude-session-existing',
      transport: 'stdio',
      model: 'claude-sonnet-5',
      reasoningEffort: 'xhigh',
    };
    const hydrateAgentHistory = vi.fn().mockResolvedValue(snapshotMetadata(hydratedSnapshot));
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        hydrateAgentHistory,
        listBackendModels: vi.fn().mockResolvedValue([
          { id: 'haiku', model: 'haiku', displayName: 'Haiku', isDefault: true },
          {
            id: 'sonnet',
            model: 'sonnet',
            displayName: 'Sonnet',
            providerMetadata: { resolvedModel: 'claude-sonnet-5' },
            supportedReasoningEfforts: [
              { reasoningEffort: 'xhigh', description: 'Deeper reasoning' },
            ],
          },
        ]),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await vi.waitFor(() => expect(state.selectedModelId.value).toBe('sonnet'));
    expect(state.selectedReasoningEffort.value).toBe('xhigh');
  });

  it('does not hydrate startup history for agents without a persisted thread', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const hydrateAgentHistory = vi.fn();
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        hydrateAgentHistory,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(hydrateAgentHistory).not.toHaveBeenCalled();
    expect(state.activeAgent.value?.id).toBe('agent-dina');
  });

  it('does not hydrate startup history when no active agent is selected', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.activeAgentId = null;
    const hydrateAgentHistory = vi.fn();
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        hydrateAgentHistory,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(hydrateAgentHistory).not.toHaveBeenCalled();
    expect(state.activeAgent.value).toBeNull();
  });

  it('loads persisted thread metadata without hydration when the preload bridge cannot hydrate agents', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-persisted' };
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.activeAgent.value?.backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-persisted' });
    expect(state.visibleMessages.value).toStrictEqual([]);
  });
});
