import { describe, expect, it, vi } from 'vitest';
import { AppController, requiresSingleInstanceLock, shouldBlockDisplaySleep } from '../app-controller';
import { createInitialSnapshot, snapshotMetadata } from '@codex-claw/core/snapshot';
import type { AddSshConnectionInput, AgentFilePreviewResult, AgentFileSearchItem, AppSnapshot, BackendConversationRef, BrowserState, ClientRequestResponse, CloneSourceRepositoryInput, CodexAuthentication, CodexChatGptLogin, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingSession, DevicePairingStatus, DuplicateAgentOptions, Automation, AutomationLocation, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, RendererMessage, RendererSendPromptOptions, RendererSnapshotState, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, SetCodexResourceSharingInput, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, SystemPermissionsStatus, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind } from '@codex-claw/core/contracts';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ipcChannels } from '@codex-claw/core/ipc';
import type { OpenInProvider } from '../open-in';
import { callPrivate, emitBackendEvent, setMainWindowSend, currentSnapshot, createBackendClient } from './app-controller-test-harness';

describe('AppController', () => {

  it('returns the latest event-applied snapshot after refreshing client state', async () => {
    const staleSnapshot = createInitialSnapshot();
    const replacementSnapshot = createInitialSnapshot();
    replacementSnapshot.agents[0]!.status = { type: 'working' };
    replacementSnapshot.messages = [{
      id: 'message-replacement',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'complete',
      parts: [{ type: 'text', text: 'Replacement transcript' }],
      createdAt: '2026-08-02T14:00:00.000Z',
    }];
    let resolveClientState!: (state: ClientState) => void;
    const clientState = new Promise<ClientState>((resolve) => {
      resolveClientState = resolve;
    });
    const request = vi.fn((method: string) => {
      if (method === backendMethods.clientStateGet) return clientState;
      return Promise.resolve({});
    });
    const backendClient = createBackendClient({
      request: vi.fn(),
      clientState: undefined,
    });
    backendClient.request = <Result,>(method: string) => request(method) as Promise<Result>;
    const controller = new AppController(createInitialSnapshot(), backendClient);

    const adoption = adoptBackendSnapshot(controller, staleSnapshot);
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(backendMethods.clientStateGet));
    emitBackendEvent(controller, {
      type: 'snapshot.updated',
      payload: replacementSnapshot,
      occurredAt: '2026-08-02T14:00:00.000Z',
    });
    resolveClientState({ sourceFolderPath: '', shouldPreventDisplaySleep: true });

    await expect(adoption).resolves.toBe(staleSnapshot);
    expect(currentSnapshot(controller)).not.toBe(staleSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentSnapshot(controller).agents[0]?.status).toStrictEqual({ type: 'working' });
    expect(staleSnapshot.messages).toBe(replacementSnapshot.messages);
  });

  it('hydrates its metadata cache from clawd snapshot state', async () => {
    const initialSnapshot = createInitialSnapshot();
    const backendSnapshot = {
      ...createInitialSnapshot(),
      activeAgentId: 'agent-dina',
      activeTeamId: 'team-codex-claw',
      sourceFolder: {
        path: '/Users/nbonamy/src',
        initialized: true,
        recentRepoNames: ['codex-claw'],
      },
    };
    const clientState: ClientState = {
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: false,
    };
    const request = vi.fn();
    const backendClient: NonNullable<ConstructorParameters<typeof AppController>[1]> = {
      start: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
      request: <Result,>(method: string): Promise<Result> => {
        request(method);
        return Promise.resolve((method === 'snapshot/get' ? { snapshot: backendSnapshot, lastEventSeq: 17, clientState } : {}) as Result);
      },
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AppController(initialSnapshot, backendClient);

    await controller.initialize();

    expect(request).toHaveBeenCalledWith('snapshot/get');
    expect(currentSnapshot(controller)).not.toBe(backendSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentClientState(controller)).toStrictEqual(clientState);
  });

  it('forwards transcript-free synchronization snapshots to the renderer', async () => {
    const backendSnapshot = createInitialSnapshot();
    backendSnapshot.messages.push({
      id: 'large-history-message',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-08-04T00:00:00.000Z',
      parts: [{ type: 'text', text: 'A'.repeat(10_000) }],
    });
    const clientState: ClientState = { sourceFolderPath: '', shouldPreventDisplaySleep: false };
    const backendClient = createBackendClient({
      request: vi.fn(),
    });
    backendClient.request = vi.fn(async (method: string) => {
      if (method === backendMethods.snapshotGet) {
        return { snapshot: { ...backendSnapshot, messages: [] }, lastEventSeq: 0, clientState };
      }
      if (method === backendMethods.clientStateGet) return clientState;
      return {};
    }) as typeof backendClient.request;
    const controller = new AppController(createInitialSnapshot(), backendClient);

    await controller.initialize();
    expect(currentSnapshot(controller).messages).toStrictEqual([]);

    const rendererState = await callPrivate<RendererSnapshotState>(controller, 'getSnapshotState');

    expect(rendererState.snapshot.messages).toStrictEqual([]);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
  });

  it('reconnects the selected backend transport and refreshes its snapshot after disconnect', async () => {
    vi.useFakeTimers();
    const initialSnapshot = createInitialSnapshot();
    const reconnectedSnapshot = createInitialSnapshot();
    reconnectedSnapshot.agents[0]!.status = { type: 'working' };
    const clientState: ClientState = { sourceFolderPath: '', shouldPreventDisplaySleep: false };
    let connectionListener: (state: 'connected' | 'disconnected', error?: Error) => void = () => undefined;
    let snapshotReads = 0;
    const backendClient: NonNullable<ConstructorParameters<typeof AppController>[1]> = {
      start: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
      request: vi.fn(async (method: string) => {
        if (method === 'snapshot/get') {
          snapshotReads += 1;
          return {
            snapshot: snapshotReads === 1 ? initialSnapshot : reconnectedSnapshot,
            lastEventSeq: 0,
            clientState,
          };
        }
        return {};
      }) as NonNullable<ConstructorParameters<typeof AppController>[1]>['request'],
      onEvent: vi.fn(() => () => undefined),
      onConnectionState: vi.fn((listener) => {
        connectionListener = listener;
        return () => undefined;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AppController(initialSnapshot, backendClient);
    const send = vi.fn();
    setMainWindowSend(controller, send);
    await controller.initialize();
    send.mockClear();

    connectionListener('disconnected', new Error('socket closed'));
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'client.connectionChanged',
      payload: expect.objectContaining({ status: 'reconnecting', detail: 'socket closed' }),
    }));

    await vi.advanceTimersByTimeAsync(250);
    expect(backendClient.start).toHaveBeenCalledTimes(2);
    expect(currentSnapshot(controller)).not.toBe(reconnectedSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'client.connectionChanged',
      payload: { status: 'connected' },
    }));
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
      payload: expect.not.objectContaining({ messages: expect.anything() }),
    }));
    await controller.shutdown();
  });

  it('caches authoritative snapshot metadata from backend events emitted by the clawd process client', async () => {
    const snapshot = createInitialSnapshot();
    const backendSnapshot = createInitialSnapshot();
    backendSnapshot.agents[0]!.status = { type: 'working' };
    const unsubscribe = vi.fn();
    let emitBackendEvent: (event: ClawBackendEvent) => void = () => undefined;
    const backendClient = createBackendClientWithEventEmitter((listener) => {
      emitBackendEvent = listener;
      return unsubscribe;
    });
    const controller = new AppController(snapshot, backendClient);
    const send = vi.fn();

    setMainWindowSend(controller, send);
    await controller.initialize();
    emitBackendEvent({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-13T00:00:00.000Z',
      clientState: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: true,
      },
      snapshot: backendSnapshot,
    });
    await controller.shutdown();

    expect(currentSnapshot(controller)).not.toBe(backendSnapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 1,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }));
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      snapshot: backendSnapshot,
    }));
    expect(currentClientState(controller)).toStrictEqual({
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: true,
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('applies incremental backend events to the Electron metadata cache', async () => {
    const snapshot = createInitialSnapshot();
    const payloadSnapshot = createInitialSnapshot();
    payloadSnapshot.agents[0]!.status = { type: 'working' };
    const controller = new AppController(snapshot, createBackendClient());
    const send = vi.fn();

    setMainWindowSend(controller, send);
    await controller.initialize();
    (controller as unknown as {
      emitBackendEvent(event: ClawBackendEvent): void;
    }).emitBackendEvent({
      seq: 1,
      type: 'snapshot.updated',
      payload: payloadSnapshot,
      occurredAt: '2026-06-13T00:00:00.000Z',
    });

    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentSnapshot(controller).agents[0]?.status).toStrictEqual({ type: 'working' });
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 1,
      type: 'snapshot.updated',
      payload: payloadSnapshot,
    }));
  });

  it('replaces generated-image file URLs before sending messages to the renderer', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    const send = vi.fn();
    const generatedImageUrl = 'file:///Users/nbonamy/.codex-claw/codex-home/generated_images/thread/image.png';

    setMainWindowSend(controller, send);
    await controller.initialize();
    (controller as unknown as {
      emitBackendEvent(event: ClawBackendEvent): void;
    }).emitBackendEvent({
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-image',
      type: 'message.updated',
      payload: {
        message: {
          id: 'assistant-turn-image',
          agentId: 'agent-dina',
          role: 'assistant',
          status: 'complete',
          turnId: 'turn-image',
          createdAt: '2026-08-30T18:33:55.000Z',
          parts: [{
            type: 'media',
            itemId: 'image-live',
            media: {
              url: generatedImageUrl,
              alt: 'Generated image',
              mimeType: 'image/png',
              title: 'Generated image',
            },
          }],
        },
      },
      occurredAt: '2026-08-30T18:33:55.000Z',
    });

    const rendererEvent = send.mock.calls.find(([channel, event]) => (
      channel === ipcChannels.event && event.type === 'message.updated'
    ))?.[1] as MainToRendererEvent | undefined;
    const message = (rendererEvent?.payload as { message?: RendererMessage } | undefined)?.message;
    const media = message?.parts.find((part) => part.type === 'media');

    expect(media?.type === 'media' ? media.media.url : null).toMatch(/^codex-claw-media:\/\/generated\//);
    expect(media?.type === 'media' ? media.media.url : null).not.toBe(generatedImageUrl);
  });

  it('ignores backend event snapshots with malformed nested state', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    const send = vi.fn();
    const malformedSnapshot = structuredClone(snapshot);
    malformedSnapshot.agents[0]!.status = { type: 'working' };
    (malformedSnapshot.general.appshots as unknown as Record<string, unknown>).hotkey = 42;

    setMainWindowSend(controller, send);
    await controller.initialize();
    (controller as unknown as {
      emitBackendEvent(event: ClawBackendEvent): void;
    }).emitBackendEvent({
      seq: 1,
      type: 'snapshot.updated',
      payload: snapshotMetadata(snapshot),
      occurredAt: '2026-06-13T00:00:00.000Z',
      snapshot: malformedSnapshot as unknown as AppSnapshot,
    });
    const malformedPayload = structuredClone(snapshot);
    malformedPayload.agents[0]!.name = 'Malformed payload';
    (malformedPayload as unknown as Record<string, unknown>).messages = {};
    (controller as unknown as {
      emitBackendEvent(event: ClawBackendEvent): void;
    }).emitBackendEvent({
      seq: 2,
      type: 'snapshot.updated',
      payload: malformedPayload,
      occurredAt: '2026-06-13T00:00:01.000Z',
    } as unknown as ClawBackendEvent);

    expect(currentSnapshot(controller)).not.toBe(snapshot);
    expect(currentSnapshot(controller).messages).toStrictEqual([]);
    expect(currentSnapshot(controller).agents[0]?.status).toStrictEqual({ type: 'idle' });
    expect(currentSnapshot(controller).agents[0]?.name).toBe('Dina');
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 1,
      type: 'snapshot.updated',
    }));
  });

  it('caches token usage updates emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    const contextUsage = {
      totalTokens: 1200,
      inputTokens: 900,
      cachedInputTokens: 100,
      outputTokens: 300,
      reasoningOutputTokens: 80,
      lastTotalTokens: 300,
      modelContextWindow: 10000,
      usedPercent: 12,
    };

    await controller.initialize();
    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'thread.tokenUsageUpdated',
      payload: { contextUsage },
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].contextUsage).toStrictEqual(contextUsage);
  });

  it('caches account rate-limit updates emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    const rateLimits = {
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 62,
        windowDurationMins: 300,
        resetsAt: 1_780_756_682,
      },
      secondary: {
        usedPercent: 50,
        windowDurationMins: 10_080,
        resetsAt: 1_781_140_878,
      },
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    };

    await controller.initialize();
    emitBackendEvent(controller, {
      type: 'account.rateLimitsUpdated',
      backend: 'codex',
      payload: { rateLimits },
    });
    await flushMicrotasks();

    expect(currentSnapshot(controller).accountRateLimits).toStrictEqual(rateLimits);
  });

  it('caches plan updates emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const send = vi.fn();
    const controller = new AppController(snapshot, createBackendClient());

    await controller.initialize();
    setMainWindowSend(controller, send);
    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: 'Current plan',
        plan: [
          { step: 'Inspect app-server event', status: 'completed' },
          { step: 'Preview markdown', status: 'inProgress' },
        ],
      },
      occurredAt: '2026-06-05T10:11:12.000Z',
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      kind: 'execution',
      status: 'inProgress',
      explanation: 'Current plan',
      steps: [
        { step: 'Inspect app-server event', status: 'completed' },
        { step: 'Preview markdown', status: 'inProgress' },
      ],
      markdown: 'Current plan\n- [x] Inspect app-server event\n- [ ] Preview markdown',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
    }));
    expect(send).not.toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'sidePanel.markdownRequested',
    }));
  });

  it('caches completed plan items emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const send = vi.fn();
    const controller = new AppController(snapshot, createBackendClient());

    await controller.initialize();
    setMainWindowSend(controller, send);
    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanCompleted',
      payload: {
        itemId: 'turn-plan-plan',
        markdown: '# Dummy False Plan\n\n- [ ] Do not implement',
      },
      occurredAt: '2026-06-05T10:11:12.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      kind: 'proposed',
      status: 'completed',
      explanation: '',
      steps: [],
      markdown: '# Dummy False Plan\n\n- [ ] Do not implement',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    await flushMicrotasks();
    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanCompleted',
    }));
    expect(send).not.toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'sidePanel.markdownRequested',
    }));
  });

  it('caches turn diff updates emitted by clawd without deriving side-panel previews', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    await controller.initialize();
    const send = vi.fn();
    setMainWindowSend(controller, send);
    const diff = [
      'diff --git a/src/main.ts b/src/main.ts',
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'diff.updated',
      payload: {
        addedLines: 1,
        removedLines: 1,
        diff,
      },
    });

    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      type: 'diff.updated',
      payload: expect.objectContaining({ diff }),
    }));
    expect(send).not.toHaveBeenCalledWith('app:event', expect.objectContaining({
      type: 'sidePanel.gitDiffRequested',
    }));
  });

  it('forwards side-panel requests emitted by clawd', async () => {
    const snapshot = createInitialSnapshot();
    const controller = new AppController(snapshot, createBackendClient());
    await controller.initialize();
    const send = vi.fn();
    setMainWindowSend(controller, send);

    emitBackendEvent(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        scope: 'turn',
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff: 'diff --git a/a.ts b/a.ts\n',
      },
    });

    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        scope: 'turn',
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff: 'diff --git a/a.ts b/a.ts\n',
      },
    }));
  });
});

function adoptBackendSnapshot(controller: AppController, snapshot: AppSnapshot): Promise<AppSnapshot> {
  return (controller as unknown as {
    adoptBackendSnapshot(snapshot: AppSnapshot): Promise<AppSnapshot>;
  }).adoptBackendSnapshot(snapshot);
}

function currentClientState(controller: AppController): ClientState {
  return (controller as unknown as { clientState: ClientState }).clientState;
}

function createBackendClientWithEventEmitter(
  onEvent: (listener: (event: ClawBackendEvent) => void) => () => void,
) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
    request: vi.fn().mockResolvedValue({}),
    onEvent: vi.fn(onEvent),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
