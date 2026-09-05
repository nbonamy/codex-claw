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
import { snapshotEventOwnership } from '@codex-claw/core/snapshot-event-ownership';
describe('useAppState', () => {
  afterEach(() => {
    clearConfetti();
    clearFirstRunOnboardingStage();
    vi.useRealTimers();
  });

  it('applies streamed main-process events to the visible conversation', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(createInitialSnapshot()),
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(listeners).toHaveLength(1);
    const emitMainEvent = listeners[0] as (event: MainToRendererEvent) => void;

    emitMainEvent({
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'streamed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(state.visibleMessages.value.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'streamed' }]);
  });

  it('keeps the active transcript reference stable when another agent streams', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents.push({
      id: 'agent-jesse', teamId: remoteSnapshot.teams[0]!.id, name: 'Jesse',
      folder: '/tmp/jesse', backend: 'codex', status: { type: 'working' },
      createdAt: '2026-06-05T00:00:00.000Z', updatedAt: '2026-06-05T00:00:00.000Z',
    });
    remoteSnapshot.teams[0]!.agentIds.push('agent-jesse');
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
    const activeTranscript = state.visibleMessages.value;

    listeners[0]!({
      seq: 1,
      agentId: 'agent-jesse',
      backend: 'codex',
      threadId: 'thread-jesse',
      turnId: 'turn-jesse',
      type: 'message.delta',
      payload: { delta: 'background stream' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(state.visibleMessages.value).toBe(activeTranscript);
    expect(state.snapshot.value.messages.some((message) => message.agentId === 'agent-jesse')).toBe(true);
  });

  it('publishes validated file activity for inactive and active agents', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents.push({
      id: 'agent-jesse', teamId: 'team-codex-claw', name: 'Jesse', avatar: 'J',
      folder: '/Users/nbonamy/src/other', backend: 'codex', status: { type: 'working' },
      createdAt: '2026-06-05T00:00:00.000Z', updatedAt: '2026-06-05T00:00:00.000Z',
    });
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    await state.loadSnapshot();
    state.fileActivity.value = null;

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-jesse',
      backend: 'codex',
      threadId: 'thread-jesse',
      turnId: 'turn-jesse',
      type: 'file.activity',
      payload: {
        messageId: 'message-files', itemId: 'item-files',
        path: '  /Users/nbonamy/src/other/src/main.ts  ', action: 'edit', status: 'running',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(state.fileActivity.value).toStrictEqual({
      agentId: 'agent-jesse',
      turnId: 'turn-jesse',
      messageId: 'message-files',
      itemId: 'item-files',
      path: '/Users/nbonamy/src/other/src/main.ts',
      action: 'edit',
      status: 'running',
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    listeners[0]?.({
      seq: 2,
      agentId: 'agent-jesse',
      backend: 'codex',
      threadId: 'thread-jesse',
      turnId: 'turn-jesse',
      type: 'file.activity',
      payload: { messageId: '', itemId: 'item-files', path: '/tmp/bad.ts', action: 'edit', status: 'running' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    } as unknown as MainToRendererEvent);
    expect(state.fileActivity.value).toMatchObject({ path: '/Users/nbonamy/src/other/src/main.ts' });

    listeners[0]?.({
      seq: 3,
      agentId: 'agent-jesse',
      backend: 'codex',
      threadId: 'thread-jesse',
      type: 'file.activity',
      payload: {
        messageId: 'message-without-turn', itemId: 'item-without-turn',
        path: '/tmp/no-turn.ts', action: 'read', status: 'completed',
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    } as unknown as MainToRendererEvent);
    expect(state.fileActivity.value).toMatchObject({ path: '/Users/nbonamy/src/other/src/main.ts' });
  });

  it('captures side panel requests from main events', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();

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
    state.sidePanelRequest.value = null;

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Architecture',
        path: 'docs/architecture.md',
        content: '# Architecture',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(state.sidePanelRequest.value).toStrictEqual({
      kind: 'markdown',
      purpose: 'plan',
      title: 'Architecture',
      path: 'docs/architecture.md',
      content: '# Architecture',
    });

    listeners[0]?.({
      seq: 2,
      agentId: 'agent-jesse',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        content: '# Other',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    const markdownRequest = state.sidePanelRequest.value as { content: string } | null;
    expect(markdownRequest?.content).toBe('# Architecture');

    listeners[0]?.({
      seq: 3,
      agentId: 'agent-dina',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        scope: 'workingTree',
        title: 'Current diff',
        subtitle: 'Working tree',
        diff: 'diff --git a/a.ts b/a.ts\n',
        sections: [
          { scope: 'staged', diff: 'diff --git a/staged.ts b/staged.ts\n' },
          { scope: 'unstaged', diff: 'diff --git a/a.ts b/a.ts\n' },
          { scope: 'untracked', diff: '' },
        ],
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(state.sidePanelRequest.value).toStrictEqual({
      kind: 'gitDiff',
      scope: 'workingTree',
      title: 'Current diff',
      subtitle: 'Working tree',
      diff: 'diff --git a/a.ts b/a.ts\n',
      sections: [
        { scope: 'staged', diff: 'diff --git a/staged.ts b/staged.ts\n' },
        { scope: 'unstaged', diff: 'diff --git a/a.ts b/a.ts\n' },
        { scope: 'untracked', diff: '' },
      ],
    });
  });

  it('plays app-owned celebration events only for the selected agent without adding conversation content', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    await state.loadSnapshot();
    const messageCount = state.visibleMessages.value.length;

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-jesse',
      type: 'celebration.requested',
      payload: { kind: 'confetti' },
      occurredAt: '2026-06-05T00:00:00.500Z',
    });

    expect(useConfetti().bursts.value).toStrictEqual([]);

    listeners[0]?.({
      seq: 2,
      agentId: 'agent-dina',
      type: 'celebration.requested',
      payload: { kind: 'stars' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(useConfetti().bursts.value).toEqual([
      expect.objectContaining({ kind: 'stars' }),
    ]);
    expect(state.visibleMessages.value).toHaveLength(messageCount);
  });

  it('shows MCP agent creation progress only for the active caller until dismissed', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    await state.loadSnapshot();
    const progress = {
      id: 'agent-creation-1',
      state: 'running' as const,
      backend: 'codex' as const,
      repositoryName: 'codex-app-sdk',
      createWorktree: true,
      branchName: 'feature/contracts',
      hasPrompt: true,
    };

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-jesse',
      type: 'agentCreation.progress',
      payload: { ...progress, id: 'ignored' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    expect(state.agentCreationProgress.value).toBeNull();

    listeners[0]?.({
      seq: 2,
      agentId: 'agent-dina',
      type: 'agentCreation.progress',
      payload: progress,
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(state.agentCreationProgress.value).toStrictEqual(progress);

    listeners[0]?.({
      seq: 3,
      agentId: 'agent-dina',
      type: 'agentCreation.progress',
      payload: { ...progress, state: 'success', agentId: 'agent-worker', agentName: 'feature/contracts' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    expect(state.agentCreationProgress.value).toMatchObject({ state: 'success', agentName: 'feature/contracts' });

    state.clearAgentCreationProgress('agent-creation-1');
    expect(state.agentCreationProgress.value).toBeNull();
  });

  it('ignores celebration events when the user disabled them', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.general.celebrationsEnabled = false;
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    await state.loadSnapshot();

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      type: 'celebration.requested',
      payload: { kind: 'confetti' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(useConfetti().bursts.value).toStrictEqual([]);
  });

  it('plays celebrations when a migrated live snapshot omits the setting', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    delete (remoteSnapshot.general as Partial<typeof remoteSnapshot.general>).celebrationsEnabled;
    stubElectronTestWindow({
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    await state.loadSnapshot();

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      type: 'celebration.requested',
      payload: { kind: 'shapes' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(useConfetti().bursts.value).toEqual([
      expect.objectContaining({ kind: 'shapes' }),
    ]);
  });

  it('routes the complete renderer-owned event subset and keeps delegated events as app-state no-ops', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();

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
    state.sidePanelRequest.value = null;
    state.fileActivity.value = null;
    state.agentCreationProgress.value = null;
    state.answeredClientRequestIds.value = new Set();
    const originalSnapshot = state.snapshot.value;

    expect(Object.entries(snapshotEventOwnership)
      .filter(([, owner]) => owner === 'renderer')
      .map(([type]) => type)
      .sort()).toStrictEqual([
      'agentCreation.progress',
      'browser.annotationCreated',
      'celebration.requested',
      'client.connectionChanged',
      'clientRequest.resolved',
      'devicePairing.statusChanged',
      'file.activity',
      'git.operationProgress',
      'models.changed',
      'sidePanel.gitDiffRequested',
      'sidePanel.markdownRequested',
      'skills.changed',
      'thread.historyHydrationFailed',
      'thread.modeUpdated',
    ]);

    listeners[0]?.({
      seq: 1,
      type: 'devicePairing.statusChanged',
      payload: { status: 'connected', serverName: 'Claw test' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    listeners[0]?.({
      seq: 2,
      agentId: 'agent-dina',
      type: 'git.operationProgress',
      payload: { operation: 'merge', phase: 'handoff' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    listeners[0]?.({
      seq: 3,
      type: 'browser.annotationCreated',
      payload: {
        id: 'annotation-1',
        agentId: 'agent-dina',
        browserId: 'primary',
        url: 'https://example.com',
        kind: 'element',
        rect: { x: 1, y: 2, width: 3, height: 4 },
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(state.snapshot.value).toBe(originalSnapshot);
    expect(state.sidePanelRequest.value).toBeNull();
    expect(state.fileActivity.value).toBeNull();
    expect(state.agentCreationProgress.value).toBeNull();
    expect(state.answeredClientRequestIds.value).toEqual(new Set());
    expect(useConfetti().bursts.value).toStrictEqual([]);
  });
});
