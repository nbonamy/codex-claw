import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { useAppState } from '../app-state';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/shared/snapshot';
import type { AppSnapshot, BackendApprovalRequest, BackendConversationRef, CodexClawApi, ConversationSummary, DevicePairingSession, MainToRendererEvent, RendererMessage, SourceRepository, WorkItem, WorkRepository } from '@codex-claw/shared/contracts';
import { workItemAssignmentKey } from '@codex-claw/shared/work-assignments';
import { workItemAssignmentPrompt } from '@codex-claw/shared/work-item-prompts';
import { clearConfetti, useConfetti } from '../shared/confetti/use-confetti';

describe('useAppState', () => {
  afterEach(() => {
    clearConfetti();
    vi.useRealTimers();
  });

  it('uses the local empty snapshot before preload is available', () => {
    vi.stubGlobal('window', {});

    const state = useAppState();

    expect(state.snapshot.value).toStrictEqual(createEmptySnapshot());
    expect(state.activeAgent.value).toBeNull();
    expect(state.visibleMessages.value).toHaveLength(0);
  });

  it('does not send prompts without preload or an active agent', async () => {
    vi.stubGlobal('window', {});
    const state = useAppState();
    state.snapshot.value.activeAgentId = null;

    await state.sendPrompt('ignored');

    expect(state.visibleMessages.value).toStrictEqual([]);
    expect(state.isSending.value).toBe(false);
  });

  it('keeps loading idle when snapshot loading is requested without preload', async () => {
    vi.stubGlobal('window', {});
    const state = useAppState();
    state.isLoading.value = false;

    await state.loadSnapshot();

    expect(state.isLoading.value).toBe(false);
  });

  it('ignores missing agent selections and does not local-select without preload', async () => {
    vi.stubGlobal('window', {});
    const state = useAppState();
    state.snapshot.value = createInitialSnapshot();
    state.snapshot.value.agents.push({
      id: 'agent-jesse',
      teamId: 'team-codex-claw',
      name: 'Jesse',
      folder: '/Users/nbonamy/src/multi-llm-ts',
      backend: 'codex',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });

    await state.selectAgent('agent-missing');
    expect(state.activeAgent.value?.id).toBe('agent-dina');

    await state.selectAgent('agent-jesse');
    expect(state.activeAgent.value?.id).toBe('agent-dina');
  });

  it('tracks answered client requests even when preload is unavailable', async () => {
    vi.stubGlobal('window', {});
    const state = useAppState();

    await state.respondToClientRequest({
      id: 'request-local',
      payload: {
        decision: 'deny',
      },
    });

    expect(state.answeredClientRequestIds.value.has('request-local')).toBe(true);
  });

  it('stores detailed approvals by agent and maps every resolution through the existing client-response bridge', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    const respondToClientRequest = vi.fn().mockResolvedValue(remoteSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        respondToClientRequest,
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });
    const approval: BackendApprovalRequest = {
      id: 'approval-native-1',
      kind: 'permissions',
      conversationId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
      title: 'Allow workspace and network access',
      description: 'The tool needs both permissions.',
      cwd: '/tmp/project',
      requestedPermissions: [
        { kind: 'filesystem', access: 'write', path: '/tmp/project' },
        { kind: 'network', enabled: true, host: 'example.com', protocol: 'https' },
      ],
      allowedScopes: ['once', 'session'],
      canDeny: true,
    };
    const state = useAppState();
    await state.loadSnapshot();

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'backendApproval.requested',
      payload: { approval },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    listeners[0]?.({
      seq: 2,
      agentId: 'agent-jesse',
      backend: 'codex',
      threadId: 'thread-other',
      type: 'backendApproval.requested',
      payload: { approval: { ...approval, id: 'approval-other', conversationId: 'thread-other' } },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(state.activeBackendApprovals.value).toStrictEqual([approval]);
    await state.resolveBackendApproval('approval-native-1', 'approve', 'session');

    expect(respondToClientRequest).toHaveBeenCalledWith({
      id: 'approval-native-1',
      payload: { decision: 'allow_conversation' },
    });
    expect(state.activeBackendApprovals.value).toStrictEqual([]);
    expect(state.answeredClientRequestIds.value.has('approval-native-1')).toBe(true);

    listeners[0]?.({
      seq: 3,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'backendApproval.requested',
      payload: { approval: { ...approval, id: 'approval-once' } },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    await state.resolveBackendApproval('approval-once', 'approve', 'once');

    expect(respondToClientRequest).toHaveBeenNthCalledWith(2, {
      id: 'approval-once',
      payload: { decision: 'allow' },
    });

    listeners[0]?.({
      seq: 4,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'backendApproval.requested',
      payload: { approval: { ...approval, id: 'approval-deny' } },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    await state.resolveBackendApproval('approval-deny', 'deny', 'once');

    expect(respondToClientRequest).toHaveBeenNthCalledWith(3, {
      id: 'approval-deny',
      payload: { decision: 'deny' },
    });
    expect(state.activeBackendApprovals.value).toStrictEqual([]);
    expect(state.answeredClientRequestIds.value.has('approval-once')).toBe(true);
    expect(state.answeredClientRequestIds.value.has('approval-deny')).toBe(true);
  });

  it('removes externally resolved detailed approvals and marks generic requests answered', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn((listener) => {
          listeners.push(listener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });
    const approval: BackendApprovalRequest = {
      id: 'approval-server',
      kind: 'command',
      conversationId: 'thread-1',
      itemId: 'command-1',
      title: 'Run tests',
      command: 'npm test',
    };
    const state = useAppState();
    await state.loadSnapshot();
    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      type: 'backendApproval.requested',
      payload: { approval },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    listeners[0]?.({
      seq: 2,
      agentId: 'agent-dina',
      type: 'backendApproval.resolved',
      payload: { approval, decision: null, scope: null, reason: 'server' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    listeners[0]?.({
      seq: 3,
      agentId: 'agent-dina',
      type: 'clientRequest.resolved',
      payload: { id: 'question-1' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(state.activeBackendApprovals.value).toStrictEqual([]);
    expect(state.answeredClientRequestIds.value.has('approval-server')).toBe(true);
    expect(state.answeredClientRequestIds.value.has('question-1')).toBe(true);
  });

  it('loads snapshots without subscribing when main events are unavailable', async () => {
    const remoteSnapshot = createInitialSnapshot();
    vi.stubGlobal('window', {
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

    vi.stubGlobal('window', {
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

    vi.stubGlobal('window', {
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
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
      snapshot: eventSnapshot,
    });

    expect(state.snapshot.value).toStrictEqual(eventSnapshot);
    expect(state.activeAgent.value?.name).toBe('Ellie');
  });

  it('does not derive renderer snapshots from main event payloads', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    const payloadSnapshot = createInitialSnapshot();
    payloadSnapshot.agents[0] = {
      ...payloadSnapshot.agents[0],
      id: 'agent-ellie',
      name: 'Ellie',
    };
    payloadSnapshot.activeAgentId = 'agent-ellie';

    vi.stubGlobal('window', {
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
      payload: payloadSnapshot,
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(state.snapshot.value).toStrictEqual(remoteSnapshot);
    expect(state.activeAgent.value?.id).toBe('agent-dina');
  });

  it('sets the active approval preset through the preload bridge', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.agents[0].backendDefaults = {
      kind: 'codex',
      approvalPreset: 'approve-for-me',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandboxMode: 'workspace-write',
    };
    const setAgentApprovalPreset = vi.fn().mockResolvedValue(updatedSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        setAgentApprovalPreset,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.snapshot.value = remoteSnapshot;

    expect(state.activeApprovalPreset.value).toBe('full-access');
    await state.setApprovalPreset('approve-for-me');

    expect(setAgentApprovalPreset).toHaveBeenCalledWith('agent-dina', 'approve-for-me');
    expect(state.snapshot.value).toStrictEqual(updatedSnapshot);
    expect(state.activeApprovalPreset.value).toBe('approve-for-me');
  });

  it('uses the first allowed approval preset when stored defaults are forbidden', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.backendRuntimes = [{
      backend: 'codex',
      status: 'running',
      capabilities: {
        approvalPresets: ['ask-for-approval'],
      },
    }];
    remoteSnapshot.agents[0].backendDefaults = {
      kind: 'codex',
      approvalPreset: 'full-access',
      approvalPolicy: 'never',
      sandboxMode: 'danger-full-access',
    };
    const setAgentApprovalPreset = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        setAgentApprovalPreset,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.snapshot.value = remoteSnapshot;

    expect(state.activeApprovalPreset.value).toBe('ask-for-approval');
    await state.setApprovalPreset('full-access');
    expect(setAgentApprovalPreset).not.toHaveBeenCalled();
  });

  it('updates settings and forwards app quit and restart through the preload bridge', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.theme = {
      ...updatedSnapshot.theme,
      id: 'github-dark',
      mode: 'dark',
    };
    let resolveUpdateSettings: (snapshot: ReturnType<typeof createInitialSnapshot>) => void = () => undefined;
    const updateSettings = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveUpdateSettings = resolve;
    }));
    const quit = vi.fn().mockResolvedValue(undefined);
    const restartApp = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        updateSettings,
        quit,
        restartApp,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    const updatePromise = state.updateSettings({ theme: { id: 'github-dark', mode: 'dark' } });

    expect(state.snapshot.value.theme.id).toBe(remoteSnapshot.theme.id);
    expect(state.snapshot.value.theme.mode).toBe(remoteSnapshot.theme.mode);

    resolveUpdateSettings(updatedSnapshot);
    await updatePromise;
    await state.quit();
    await state.restartApp();

    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark', mode: 'dark' } });
    expect(state.snapshot.value.theme.id).toBe('github-dark');
    expect(quit).toHaveBeenCalledOnce();
    expect(restartApp).toHaveBeenCalledOnce();
  });

  it('JSON-normalizes reactive device pairing sessions before Electron IPC', async () => {
    const checkDevicePairing = vi.fn((session: DevicePairingSession) => {
      structuredClone(session);
      return Promise.resolve(true);
    });
    vi.stubGlobal('window', {
      codexClaw: {
        checkDevicePairing,
      } satisfies Partial<CodexClawApi>,
    });
    const session = reactive<DevicePairingSession>({
      pairingCode: 'opaque-payload',
      manualPairingCode: 'ABCD-EFGH',
      environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    });

    const state = useAppState();
    await expect(state.checkDevicePairing(session)).resolves.toBe(true);
    expect(checkDevicePairing).toHaveBeenCalledWith({
      pairingCode: 'opaque-payload',
      manualPairingCode: 'ABCD-EFGH',
      environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    });
  });

  it('loads source repositories and creates worktrees through clawd', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.sourceFolder = {
      path: '~/src',
      initialized: true,
      recentRepoNames: [],
    };
    const repositories: SourceRepository[] = [{
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      worktrees: [{
        name: 'main',
        path: '/Users/nbonamy/src/codex-claw',
      }],
    }];
    const listSourceRepositories = vi.fn().mockResolvedValue(repositories);
    const listSourceWorktrees = vi.fn().mockResolvedValue([
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'source-folder', path: '/Users/nbonamy/src/codex-claw-source-folder' },
    ]);
    const createSourceWorktree = vi.fn().mockResolvedValue({
      name: 'source-folder',
      path: '/Users/nbonamy/src/codex-claw-source-folder',
    });
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listSourceRepositories,
        listSourceWorktrees,
        createSourceWorktree,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.sourceRepositoryStatus.value).toBe('loaded');
    expect(state.sourceRepositories.value).toStrictEqual(repositories);
    await expect(state.listSourceWorktrees('/Users/nbonamy/src/codex-claw')).resolves.toStrictEqual([
      { name: 'main', path: '/Users/nbonamy/src/codex-claw' },
      { name: 'source-folder', path: '/Users/nbonamy/src/codex-claw-source-folder' },
    ]);

    await expect(state.createSourceWorktree({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
    })).resolves.toStrictEqual({
      name: 'source-folder',
      path: '/Users/nbonamy/src/codex-claw-source-folder',
    });
    expect(listSourceRepositories).toHaveBeenCalledTimes(2);
  });

  it('uses source repository fallbacks when preload helpers are unavailable', async () => {
    vi.stubGlobal('window', { codexClaw: {} satisfies Partial<CodexClawApi> });
    const state = useAppState();
    state.snapshot.value = createInitialSnapshot();
    state.snapshot.value.sourceFolder = {
      path: '~/src',
      initialized: true,
      recentRepoNames: [],
    };

    await expect(state.chooseSourceFolder()).resolves.toBeNull();
    await expect(state.suggestSourceWorktreePath({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
    })).resolves.toBe('');
    await expect(state.listSourceWorktrees('/Users/nbonamy/src/codex-claw')).resolves.toStrictEqual([]);
    await expect(state.chooseSourceWorktreeDestination('/Users/nbonamy/src/codex-claw-source-folder')).resolves.toBeNull();
    await expect(state.createSourceWorktree({
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'feature/source-folder',
    })).rejects.toThrow('Source worktree creation is not available.');

    await state.loadSourceRepositories();

    expect(state.sourceRepositories.value).toStrictEqual([]);
    expect(state.sourceRepositoryStatus.value).toBe('notLoaded');
    expect(state.sourceRepositoryError.value).toBeNull();
    expect(state.snapshot.value.sourceFolder.recentRepoNames).toStrictEqual([]);
  });

  it('records source repository loading errors', async () => {
    const listSourceRepositories = vi.fn().mockRejectedValueOnce(new Error('source folder disappeared'))
      .mockRejectedValueOnce('plain failure');
    vi.stubGlobal('window', {
      codexClaw: {
        listSourceRepositories,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = createInitialSnapshot();
    state.snapshot.value.sourceFolder = {
      path: '~/src',
      initialized: true,
      recentRepoNames: [],
    };

    await state.loadSourceRepositories();

    expect(state.sourceRepositories.value).toStrictEqual([]);
    expect(state.sourceRepositoryStatus.value).toBe('error');
    expect(state.sourceRepositoryError.value).toBe('source folder disappeared');

    await state.loadSourceRepositories();

    expect(state.sourceRepositoryError.value).toBe('plain failure');
  });

  it('connects work providers and hydrates the selected repository backlog', async () => {
    vi.useFakeTimers();
    const initialSnapshot = createInitialSnapshot();
    const connectingSnapshot = createInitialSnapshot();
    connectingSnapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connecting',
      detail: 'Enter code ABCD-1234 in GitHub.',
    }];
    const connectedSnapshot = createInitialSnapshot();
    connectedSnapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    const selectedSnapshot = createInitialSnapshot();
    selectedSnapshot.workBacklog.connections = connectedSnapshot.workBacklog.connections;
    selectedSnapshot.workBacklog.providerConfigurations.github = {
      repositoryId: 'nbonamy/codex-claw',
    };
    const repository = workRepository();
    const item = workItem();
    const connectWorkProvider = vi.fn().mockResolvedValue({
      snapshot: connectingSnapshot,
      authorization: {
        provider: 'github',
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        expiresAt: '2026-06-09T12:05:00.000Z',
      },
    });
    const openWorkProviderAuthorization = vi.fn().mockResolvedValue(connectingSnapshot);
    const completeWorkProviderConnection = vi.fn().mockResolvedValue(connectedSnapshot);
    const listWorkRepositories = vi.fn().mockResolvedValue([repository]);
    const configureWorkBacklog = vi.fn().mockResolvedValue(selectedSnapshot);
    const listWorkItems = vi.fn().mockResolvedValue([item]);
    vi.stubGlobal('window', {
      codexClaw: {
        connectWorkProvider,
        openWorkProviderAuthorization,
        completeWorkProviderConnection,
        listWorkRepositories,
        configureWorkBacklog,
        listWorkItems,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.snapshot.value = initialSnapshot;

    await state.connectWorkProvider('github');
    expect(state.snapshot.value).toStrictEqual(connectingSnapshot);
    expect(state.workProviderAuthorization.value?.userCode).toBe('ABCD-1234');

    await state.openWorkProviderAuthorization('github');
    expect(openWorkProviderAuthorization).toHaveBeenCalledWith('github');
    expect(state.snapshot.value).toStrictEqual(connectingSnapshot);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(completeWorkProviderConnection).toHaveBeenCalledWith('github');
    expect(useConfetti().bursts.value).toHaveLength(1);
    expect(listWorkRepositories).toHaveBeenCalledWith('github');
    expect(configureWorkBacklog).toHaveBeenCalledWith({
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/codex-claw',
        assigneeLogin: null,
        tagName: null,
      },
    });
    expect(listWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw');
    expect(state.workProviderAuthorization.value).toBeNull();
    expect(state.workRepositoriesByProvider.value.github).toStrictEqual([repository]);
    expect(state.workItemsByRepository.value['github:nbonamy/codex-claw']).toStrictEqual([item]);
  });

  it('assigns work items through the existing agent prompt path', async () => {
    const snapshot = createInitialSnapshot();
    const assignment = {
      provider: 'github' as const,
      itemId: 'nbonamy/codex-claw#12',
      agentId: 'agent-dina',
      assignedAt: '2026-06-09T13:00:00.000Z',
      status: 'working' as const,
    };
    const assignedSnapshot = createInitialSnapshot();
    assignedSnapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': assignment,
    };
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.workBacklog.assignments = assignedSnapshot.workBacklog.assignments;
    const assignWorkItemToAgent = vi.fn().mockResolvedValue(assignedSnapshot);
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        assignWorkItemToAgent,
        sendPrompt,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = snapshot;

    const item = reactive(workItem());
    await state.assignWorkItemToAgent({
      agentId: 'agent-dina',
      item,
    });

    expect(assignWorkItemToAgent).toHaveBeenCalledWith('agent-dina', workItem());
    expect(assignWorkItemToAgent.mock.calls[0]?.[1]).not.toBe(item);
    expect(sendPrompt.mock.calls[0]?.[0]).toBe('agent-dina');
    expect(sendPrompt.mock.calls[0]?.[1]).toContain('Issue: #12 Fix cockpit drag target');
    expect(sendPrompt.mock.calls[0]?.[1]).toContain('URL: https://github.com/nbonamy/codex-claw/issues/12');
    expect(state.snapshot.value.workBacklog.assignments).toStrictEqual(assignedSnapshot.workBacklog.assignments);
  });

  it('removes work item assignments through preload without prompting the agent', async () => {
    const assignedSnapshot = createInitialSnapshot();
    const item = reactive(workItem());
    assignedSnapshot.workBacklog.assignments = {
      [workItemAssignmentKey(item)]: {
        provider: 'github',
        itemId: item.id,
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        status: 'working',
      },
    };
    const unassignedSnapshot = createInitialSnapshot();
    const removeWorkItemAssignment = vi.fn().mockResolvedValue(unassignedSnapshot);
    const sendPrompt = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        removeWorkItemAssignment,
        sendPrompt,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = assignedSnapshot;

    await state.removeWorkItemAssignment(item);

    expect(removeWorkItemAssignment).toHaveBeenCalledWith(workItem());
    expect(removeWorkItemAssignment.mock.calls[0]?.[0]).not.toBe(item);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(state.snapshot.value).toStrictEqual(unassignedSnapshot);
  });

  it('formats deterministic work item assignment prompts', () => {
    expect(workItemAssignmentPrompt(workItem())).toBe([
      'Please take this GitHub issue and drive it to completion.',
      '',
      'Work item ID: github:nbonamy/codex-claw#12',
      'When you are done with this work item, call the codex_claw MCP tool `mark-work-item-completed` with this exact Work item ID.',
      '',
      'Repository: nbonamy/codex-claw',
      'Issue: #12 Fix cockpit drag target',
      'URL: https://github.com/nbonamy/codex-claw/issues/12',
      'Labels: bug',
      'Author: nbonamy',
      'Body:',
      'Make issue assignment feel obvious.',
    ].join('\n'));

    expect(workItemAssignmentPrompt(workItem(), {
      assignment: 'Start by reproducing the issue.',
    })).toContain('Assignment instructions:\nStart by reproducing the issue.');
  });

  it('handles missing work provider bridge methods as no-ops', async () => {
    vi.stubGlobal('window', { codexClaw: {} satisfies Partial<CodexClawApi> });
    const state = useAppState();
    state.snapshot.value = createInitialSnapshot();

    await state.connectWorkProvider('github');
    await state.completeWorkProviderConnection('github');
    await state.disconnectWorkProvider('github');
    await state.loadWorkRepositories('github');
    await state.configureWorkBacklog({
      provider: 'github',
      configuration: {
        repositoryId: null,
        tagName: null,
      },
    });
    await state.loadWorkItems('github', '');

    expect(state.workBacklogStatus.value).toBe('notLoaded');
  });

  it('records work provider bridge errors without marking integrations connected', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    const connectWorkProvider = vi.fn().mockRejectedValue('connect failed');
    const completeWorkProviderConnection = vi.fn().mockRejectedValue('finish failed');
    const listWorkRepositories = vi.fn().mockRejectedValue('repos failed');
    const listWorkItems = vi.fn().mockRejectedValue('items failed');
    vi.stubGlobal('window', {
      codexClaw: {
        connectWorkProvider,
        completeWorkProviderConnection,
        listWorkRepositories,
        listWorkItems,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = snapshot;

    await expect(state.connectWorkProvider('github')).rejects.toBe('connect failed');
    expect(state.workBacklogStatus.value).toBe('error');
    expect(state.workBacklogError.value).toBe('connect failed');

    await expect(state.completeWorkProviderConnection('github')).rejects.toBe('finish failed');
    expect(state.workBacklogError.value).toBe('finish failed');

    await state.loadWorkRepositories('github');
    expect(state.workRepositoriesByProvider.value.github).toStrictEqual([]);
    expect(state.workBacklogError.value).toBe('repos failed');

    await state.loadWorkItems('github', 'nbonamy/codex-claw');
    expect(state.workBacklogError.value).toBe('items failed');
  });

  it('records Error objects from work provider bridge failures', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    vi.stubGlobal('window', {
      codexClaw: {
        connectWorkProvider: vi.fn().mockRejectedValue(new Error('connect object failed')),
        listWorkRepositories: vi.fn().mockRejectedValue(new Error('repo object failed')),
        listWorkItems: vi.fn().mockRejectedValue(new Error('item object failed')),
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = snapshot;

    await expect(state.connectWorkProvider('github')).rejects.toThrow('connect object failed');
    expect(state.workBacklogError.value).toBe('connect object failed');

    await state.loadWorkRepositories('github');
    expect(state.workBacklogError.value).toBe('repo object failed');

    await state.loadWorkItems('github', 'nbonamy/codex-claw');
    expect(state.workBacklogError.value).toBe('item object failed');
  });

  it('keeps pending work provider completion in a loaded state', async () => {
    const connectingSnapshot = createInitialSnapshot();
    connectingSnapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connecting',
      detail: 'GitHub authorization is still pending.',
    }];
    const completeWorkProviderConnection = vi.fn().mockResolvedValue(connectingSnapshot);
    const listWorkRepositories = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        completeWorkProviderConnection,
        listWorkRepositories,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();

    await state.completeWorkProviderConnection('github');

    expect(state.snapshot.value.workBacklog.connections[0]?.status).toBe('connecting');
    expect(state.workBacklogStatus.value).toBe('loaded');
    expect(listWorkRepositories).not.toHaveBeenCalled();
  });

  it('disconnects work providers and handles null repository selection', async () => {
    const connectedSnapshot = createInitialSnapshot();
    connectedSnapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    connectedSnapshot.workBacklog.providerConfigurations.github = {
      repositoryId: 'nbonamy/codex-claw',
      tagName: 'bug',
    };
    const disconnectedSnapshot = createInitialSnapshot();
    disconnectedSnapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'disconnected',
    }];
    const disconnectWorkProvider = vi.fn().mockResolvedValue(disconnectedSnapshot);
    const configureWorkBacklog = vi.fn().mockResolvedValue(disconnectedSnapshot);
    const listWorkItems = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        disconnectWorkProvider,
        configureWorkBacklog,
        listWorkItems,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = connectedSnapshot;
    state.workProviderAuthorization.value = {
      provider: 'github',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-06-09T12:05:00.000Z',
    };
    state.workRepositoriesByProvider.value = { github: [workRepository()] };
    state.workItemsByRepository.value = { 'github:nbonamy/codex-claw': [workItem()] };

    await state.configureWorkBacklog({
      provider: 'github',
      configuration: {
        repositoryId: null,
        tagName: null,
      },
    });
    await state.disconnectWorkProvider('github');

    expect(configureWorkBacklog).toHaveBeenCalledWith({
      provider: 'github',
      configuration: {
        repositoryId: null,
        tagName: null,
      },
    });
    expect(listWorkItems).not.toHaveBeenCalled();
    expect(disconnectWorkProvider).toHaveBeenCalledWith('github');
    expect(state.workProviderAuthorization.value).toBeNull();
    expect(state.workRepositoriesByProvider.value.github).toStrictEqual([]);
    expect(state.workItemsByRepository.value).toStrictEqual({});
    expect(state.workBacklogStatus.value).toBe('notLoaded');
  });

  it('configures remote work backlog without adopting the remote snapshot locally', async () => {
    const localSnapshot = createInitialSnapshot();
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.teams[0]!.id = 'team-remote';
    remoteSnapshot.workBacklog.providerConfigurations.github = {
      repositoryId: 'nbonamy/remote',
    };
    const configureWorkBacklog = vi.fn().mockResolvedValue(remoteSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        configureWorkBacklog,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = localSnapshot;
    const location = { kind: 'remote' as const, remoteConnectionId: 'connection-devbox' };

    await state.configureWorkBacklog({
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/remote',
        tagName: null,
      },
    }, location);

    expect(configureWorkBacklog).toHaveBeenCalledWith({
      provider: 'github',
      configuration: {
        repositoryId: 'nbonamy/remote',
        tagName: null,
      },
    }, location);
    expect(state.snapshot.value).toStrictEqual(localSnapshot);
    expect(state.snapshot.value.workBacklog.providerConfigurations.github).toBeUndefined();
  });

  it('loads selected work repositories and empty repository lists', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.connections = [{
      provider: 'github',
      status: 'connected',
      accountLabel: 'nbonamy',
    }];
    snapshot.workBacklog.providerConfigurations.github = {
      repositoryId: 'nbonamy/codex-claw',
    };
    const listWorkRepositories = vi.fn()
      .mockResolvedValueOnce([workRepository()])
      .mockResolvedValueOnce([]);
    const listWorkItems = vi.fn().mockResolvedValue([workItem()]);
    const configureWorkBacklog = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        listWorkRepositories,
        listWorkItems,
        configureWorkBacklog,
      } satisfies Partial<CodexClawApi>,
    });
    const state = useAppState();
    state.snapshot.value = snapshot;

    await state.loadWorkRepositories('github');
    expect(listWorkItems).toHaveBeenCalledWith('github', 'nbonamy/codex-claw');
    expect(configureWorkBacklog).not.toHaveBeenCalled();

    delete state.snapshot.value.workBacklog.providerConfigurations.github;
    await state.loadWorkRepositories('github');
    expect(state.workRepositoriesByProvider.value.github).toStrictEqual([]);
  });

  it('omits optional work item prompt fields and truncates long bodies', () => {
    expect(workItemAssignmentPrompt({
      ...workItem(),
      authorName: undefined,
      body: '',
      labels: [],
    })).toBe([
      'Please take this GitHub issue and drive it to completion.',
      '',
      'Work item ID: github:nbonamy/codex-claw#12',
      'When you are done with this work item, call the codex_claw MCP tool `mark-work-item-completed` with this exact Work item ID.',
      '',
      'Repository: nbonamy/codex-claw',
      'Issue: #12 Fix cockpit drag target',
      'URL: https://github.com/nbonamy/codex-claw/issues/12',
    ].join('\n'));

    expect(workItemAssignmentPrompt({
      ...workItem(),
      body: 'x'.repeat(4100),
    })).toContain('[Body truncated]');
  });

  it('lazy hydrates the active persisted thread after startup is interactive', async () => {
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
    const hydration = deferred<AppSnapshot>();
    const hydrateAgentHistory = vi.fn().mockReturnValue(hydration.promise);
    const selectAgent = vi.fn();
    const onEvent = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        hydrateAgentHistory,
        selectAgent,
        onEvent,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(onEvent).toHaveBeenCalledOnce();
    expect(selectAgent).not.toHaveBeenCalled();
    expect(hydrateAgentHistory).toHaveBeenCalledWith('agent-dina');
    expect(state.isLoading.value).toBe(false);
    expect(state.isHydratingActiveAgentHistory.value).toBe(true);
    expect(state.visibleMessages.value).toStrictEqual([]);

    hydration.resolve(hydratedSnapshot);
    await hydration.promise;
    await nextTick();

    expect(state.isHydratingActiveAgentHistory.value).toBe(false);
    expect(state.visibleMessages.value).toStrictEqual(hydratedSnapshot.messages);
  });

  it('reconciles persisted threads after renderer restart even when the daemon has cached messages', async () => {
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
    const hydrateAgentHistory = vi.fn().mockResolvedValue(reconciledSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(cachedSnapshot),
        hydrateAgentHistory,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await vi.waitFor(() => expect(hydrateAgentHistory).toHaveBeenCalledWith('agent-dina'));
    await vi.waitFor(() => expect(state.activeAgent.value?.status).toStrictEqual({ type: 'idle' }));
    expect(state.visibleMessages.value[0]?.status).toBe('complete');
    expect(state.isSending.value).toBe(false);
  });

  it('does not hydrate startup history for agents without a persisted thread', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const hydrateAgentHistory = vi.fn();
    vi.stubGlobal('window', {
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
    vi.stubGlobal('window', {
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
    vi.stubGlobal('window', {
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

  it('switches active agents and displays that agent conversation only', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.messages = [
      {
        id: 'message-dina',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:00.000Z',
        parts: [{ type: 'text', text: 'Dina transcript' }],
      },
      {
        id: 'message-jesse',
        agentId: 'agent-jesse',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: 'Jesse transcript' }],
      },
    ];
    const jesseSnapshot = {
      ...remoteSnapshot,
      activeAgentId: 'agent-jesse',
    };
    const selectAgent = vi.fn().mockResolvedValue(jesseSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.activeAgent.value?.id).toBe('agent-dina');
    expect(state.visibleMessages.value.map((message) => message.id)).toStrictEqual(['message-dina']);

    await state.selectAgent('agent-jesse');

    expect(selectAgent).toHaveBeenCalledWith('agent-jesse');
    expect(state.activeAgent.value?.id).toBe('agent-jesse');
    expect(state.visibleMessages.value.map((message) => message.id)).toStrictEqual(['message-jesse']);
  });

  it('ignores missing team selections without calling main', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const selectTeam = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectTeam,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.selectTeam('team-missing');

    expect(selectTeam).not.toHaveBeenCalled();
    expect(state.snapshot.value.activeTeamId).toBe('team-codex-claw');
  });

  it('ignores stale agent selection responses when switching quickly', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const jesseSelection = deferred<AppSnapshot>();
    const dinaSelection = deferred<AppSnapshot>();
    const selectAgent = vi.fn((agentId: string) => agentId === 'agent-jesse' ? jesseSelection.promise : dinaSelection.promise);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    void state.selectAgent('agent-jesse');
    void state.selectAgent('agent-dina');
    expect(state.activeAgent.value?.id).toBe('agent-dina');

    jesseSelection.resolve({ ...remoteSnapshot, activeAgentId: 'agent-jesse' });
    dinaSelection.resolve({ ...remoteSnapshot, activeAgentId: 'agent-dina' });
    await vi.waitFor(() => expect(state.activeAgent.value?.id).toBe('agent-dina'));
    expect(selectAgent).toHaveBeenNthCalledWith(1, 'agent-jesse');
    expect(selectAgent).toHaveBeenNthCalledWith(2, 'agent-dina');
  });

  it('updates agent selection immediately while keeping team selection loading', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const agentSelection = deferred<AppSnapshot>();
    const teamSelection = deferred<AppSnapshot>();
    const selectAgent = vi.fn().mockReturnValue(agentSelection.promise);
    const selectTeam = vi.fn().mockReturnValue(teamSelection.promise);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        selectTeam,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    const agentPromise = state.selectAgent('agent-jesse');
    expect(state.isLoading.value).toBe(false);
    expect(state.activeAgent.value?.id).toBe('agent-jesse');
    agentSelection.resolve({
      ...remoteSnapshot,
      activeAgentId: 'agent-jesse',
    });
    await agentPromise;
    expect(state.isLoading.value).toBe(false);
    expect(state.activeAgent.value?.id).toBe('agent-jesse');

    const teamPromise = state.selectTeam('team-codex-claw');
    expect(state.isLoading.value).toBe(true);
    teamSelection.resolve({
      ...remoteSnapshot,
      activeAgentId: 'agent-dina',
      activeTeamId: 'team-codex-claw',
    });
    await teamPromise;
    expect(state.isLoading.value).toBe(false);
    expect(state.activeAgent.value?.id).toBe('agent-dina');
  });

  it('sends prompts through preload and replaces the snapshot with the main result', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.messages.push({
      id: 'message-user',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'hello' }],
    });

    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    const send = state.sendPrompt('hello');

    expect(state.isSending.value).toBe(true);
    await send;

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'hello');
    expect(state.isSending.value).toBe(false);
    expect(state.visibleMessages.value.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
  });

  it('can send prompts to a specific agent from overview surfaces', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.messages.push({
      id: 'message-jesse',
      agentId: 'agent-jesse',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'ship this' }],
    });

    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.sendAgentPrompt('agent-jesse', '  ship this  ');

    expect(sendPrompt).toHaveBeenCalledWith('agent-jesse', 'ship this');
    expect(state.snapshot.value).toStrictEqual(updatedSnapshot);
  });

  it('deletes, edits, and retries active messages through preload message actions', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.messages = [
      {
        id: 'user-turn-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: 'original prompt' }],
      },
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [{ type: 'text', text: 'original answer' }],
      },
    ];
    const afterDelete = { ...remoteSnapshot, messages: [] };
    const afterEdit = {
      ...remoteSnapshot,
      messages: [remoteSnapshot.messages[0]],
    };
    const afterRetry = {
      ...remoteSnapshot,
      messages: [remoteSnapshot.messages[1]],
    };
    const deleteMessage = vi.fn().mockResolvedValue(afterDelete);
    const editMessage = vi.fn().mockResolvedValue(afterEdit);
    const retryMessage = vi.fn().mockResolvedValue(afterRetry);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        deleteMessage,
        editMessage,
        retryMessage,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await state.deleteMessage(0);
    expect(deleteMessage).toHaveBeenCalledWith('agent-dina', 'user-turn-1');

    state.snapshot.value = remoteSnapshot;
    await state.editMessage({ content: '  edited prompt  ', index: 0 });
    expect(editMessage).toHaveBeenCalledWith('agent-dina', 'user-turn-1', 'edited prompt');

    state.snapshot.value = remoteSnapshot;
    await state.retryMessage(1);
    expect(retryMessage).toHaveBeenCalledWith('agent-dina', 'assistant-turn-1');
  });

  it('blocks message actions when the active backend does not support them', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].backend = 'claude';
    remoteSnapshot.agents[0].backendDefaults = { kind: 'claude' };
    remoteSnapshot.messages = [
      {
        id: 'user-turn-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: 'original prompt' }],
      },
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [{ type: 'text', text: 'original answer' }],
      },
    ];
    const deleteMessage = vi.fn().mockResolvedValue(remoteSnapshot);
    const editMessage = vi.fn().mockResolvedValue(remoteSnapshot);
    const retryMessage = vi.fn().mockResolvedValue(remoteSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        deleteMessage,
        editMessage,
        retryMessage,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await state.deleteMessage(0);
    await state.editMessage({ content: 'edited prompt', index: 0 });
    await state.retryMessage(1);

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(editMessage).not.toHaveBeenCalled();
    expect(retryMessage).not.toHaveBeenCalled();
  });

  it('queues busy prompts and drains them after the active turn completes', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].status = { type: 'working' };
    const drainedSnapshot = createInitialSnapshot();
    drainedSnapshot.messages.push({
      id: 'message-drained',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'run this after the turn' }],
    });
    const sendPrompt = vi.fn().mockResolvedValue(drainedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.sendPrompt('run this after the turn');

    expect(sendPrompt).not.toHaveBeenCalled();
    expect(state.activeQueuedPrompts.value).toStrictEqual([
      expect.objectContaining({
        text: 'run this after the turn',
      }),
    ]);

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
      snapshot: createInitialSnapshot(),
    });

    await vi.waitFor(() => {
      expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'run this after the turn');
    });
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
    expect(state.visibleMessages.value.at(-1)?.id).toBe('message-drained');
  });

  it('preserves attachment descriptors in a busy conversation queue until normal drain', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].status = { type: 'working' };
    const sendPrompt = vi.fn().mockResolvedValue(createInitialSnapshot());
    const steerPrompt = vi.fn().mockResolvedValue(remoteSnapshot);
    const attachments = [
      {
        type: 'image' as const,
        path: '/tmp/screenshot.png',
        detail: 'original' as const,
        name: 'screenshot.png',
        mimeType: 'image/png',
        previewUrl: 'data:image/png;base64,cG5n',
      },
      { type: 'file' as const, path: '/tmp/report.txt', name: 'report.txt', mimeType: 'text/plain' },
    ];

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        steerPrompt,
        onEvent: vi.fn((nextListener) => {
          listeners.push(nextListener);
          return () => undefined;
        }),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.sendPrompt('review these files', { attachments });

    expect(state.activeQueuedPrompts.value).toStrictEqual([
      expect.objectContaining({
        text: 'review these files',
        options: { attachments },
      }),
    ]);

    const queuedPromptId = state.activeQueuedPrompts.value[0]?.id;
    await state.steerQueuedPrompt(queuedPromptId as string);
    expect(steerPrompt).not.toHaveBeenCalled();
    expect(state.activeQueuedPrompts.value).toHaveLength(1);

    listeners[0]?.({
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
      snapshot: createInitialSnapshot(),
    });

    await vi.waitFor(() => {
      expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'review these files', { attachments });
    });
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
  });

  it('steers busy drafts and queued prompts through preload', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].status = { type: 'working' };
    const steerPrompt = vi.fn().mockResolvedValue(remoteSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        steerPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.steerPrompt('use the smaller patch');

    expect(steerPrompt).toHaveBeenCalledWith('agent-dina', 'use the smaller patch');

    await state.sendPrompt('queued but steerable');
    const queuedPromptId = state.activeQueuedPrompts.value[0]?.id;
    expect(queuedPromptId).toBeTruthy();

    await state.steerQueuedPrompt(queuedPromptId as string);

    expect(steerPrompt).toHaveBeenCalledWith('agent-dina', 'queued but steerable');
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
  });

  it('interrupts the active busy agent through preload', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].status = { type: 'working' };
    const interruptedSnapshot = createInitialSnapshot();
    interruptedSnapshot.agents[0].status = { type: 'working' };
    const interruptAgent = vi.fn().mockResolvedValue(interruptedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        interruptAgent,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.interruptActiveAgent();

    expect(interruptAgent).toHaveBeenCalledWith('agent-dina');
    expect(state.snapshot.value.agents[0].status).toStrictEqual({ type: 'working' });
  });

  it('removes queued prompts locally', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].status = { type: 'working' };

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.sendPrompt('delete this queued prompt');
    const queuedPromptId = state.activeQueuedPrompts.value[0]?.id;

    state.removeQueuedPrompt(queuedPromptId as string);

    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
  });

  it('tracks sending state per agent so another agent can be used while one starts', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const dinaQueuedSnapshot = {
      ...createInitialSnapshot(),
      activeAgentId: 'agent-jesse',
    };
    const jesseQueuedSnapshot = {
      ...createInitialSnapshot(),
      activeAgentId: 'agent-jesse',
    };
    const dinaSend = deferred<typeof dinaQueuedSnapshot>();
    const sendPrompt = vi.fn((agentId: string) => {
      if (agentId === 'agent-dina') {
        return dinaSend.promise;
      }

      return Promise.resolve(jesseQueuedSnapshot);
    });
    const selectAgent = vi.fn().mockResolvedValue({
      ...remoteSnapshot,
      activeAgentId: 'agent-jesse',
    });

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    const firstSend = state.sendPrompt('work in dina');
    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'work in dina');
    expect(state.isSending.value).toBe(true);

    await state.selectAgent('agent-jesse');
    expect(state.activeAgent.value?.id).toBe('agent-jesse');
    expect(state.isSending.value).toBe(false);

    await state.sendPrompt('work in jesse');
    expect(sendPrompt).toHaveBeenCalledWith('agent-jesse', 'work in jesse');

    dinaSend.resolve(dinaQueuedSnapshot);
    await firstSend;
    expect(state.activeAgent.value?.id).toBe('agent-jesse');
  });

  it('applies streamed main-process events to the visible conversation', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    vi.stubGlobal('window', {
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

    const streamedSnapshot = createInitialSnapshot();
    streamedSnapshot.messages.push({
      id: 'message-streamed',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      createdAt: '2026-06-05T00:00:02.000Z',
      parts: [{ type: 'text', text: 'streamed' }],
    });

    emitMainEvent({
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'streamed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
      snapshot: streamedSnapshot,
    });

    expect(state.visibleMessages.value.at(-1)?.parts).toStrictEqual([{ type: 'text', text: 'streamed' }]);
  });

  it('responds to client requests through preload and tracks answered request ids', async () => {
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.agents[0].status = { type: 'working' };
    const respondToClientRequest = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(createInitialSnapshot()),
        onEvent: vi.fn(),
        respondToClientRequest,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.respondToClientRequest({
      id: 'approval-1',
      payload: {
        decision: 'allow',
      },
    });

    expect(respondToClientRequest).toHaveBeenCalledWith({
      id: 'approval-1',
      payload: {
        decision: 'allow',
      },
    });
    expect(state.answeredClientRequestIds.value.has('approval-1')).toBe(true);
    expect(state.snapshot.value.agents[0].status).toStrictEqual({ type: 'working' });
  });

  it('chooses folders and replaces the snapshot after agent metadata actions', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const teamSnapshot = {
      ...remoteSnapshot,
      teams: [
        ...remoteSnapshot.teams,
        {
          id: 'team-skwad-core',
          name: 'Skwad Core',
          avatar: 'SC',
          color: '#46A857',
          agentIds: [],
        },
      ],
      activeTeamId: 'team-skwad-core',
      activeAgentId: null,
    };
    const selectedTeamSnapshot = {
      ...teamSnapshot,
      teams: [teamSnapshot.teams[1]!, teamSnapshot.teams[0]!],
      activeTeamId: 'team-skwad-core',
      activeAgentId: null,
    };
    const selectedCoreTeamSnapshot = {
      ...selectedTeamSnapshot,
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-dina',
    };
    const updatedTeamSnapshot = {
      ...selectedCoreTeamSnapshot,
      teams: selectedCoreTeamSnapshot.teams.map((team) => team.id === 'team-codex-claw'
        ? { ...team, name: 'Core Team', avatar: 'CT', color: '#46A857' }
        : team),
    };
    const reorderedAgentsSnapshot = {
      ...updatedTeamSnapshot,
      teams: updatedTeamSnapshot.teams.map((team) => team.id === 'team-codex-claw'
        ? { ...team, agentIds: ['agent-jesse', 'agent-dina'] }
        : team),
    };
    const createdSnapshot = {
      ...reorderedAgentsSnapshot,
      agents: [
        ...reorderedAgentsSnapshot.agents,
        {
          id: 'agent-jules',
          teamId: 'team-codex-claw',
          name: 'Jules',
          avatar: '🤖',
          folder: '/Users/nbonamy/src/jules',
          status: { type: 'idle' as const },
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      ],
      activeAgentId: 'agent-jules',
    };
    const updatedSnapshot = {
      ...createdSnapshot,
      agents: createdSnapshot.agents.map((agent) => agent.id === 'agent-jules' ? { ...agent, name: 'Jules Prime' } : agent),
    };
    const duplicatedSnapshot = {
      ...updatedSnapshot,
      activeAgentId: 'agent-jules-copy',
    };
    const movedSnapshot = {
      ...duplicatedSnapshot,
      activeTeamId: 'team-skwad-core',
      agents: duplicatedSnapshot.agents.map((agent) => agent.id === 'agent-jules'
        ? { ...agent, teamId: 'team-skwad-core' }
        : agent),
    };
    const benchSnapshot = {
      ...movedSnapshot,
      bench: [
        {
          id: 'bench-jules-prime',
          name: 'Jules Prime',
          avatar: '🤖',
          folder: '/Users/nbonamy/src/jules',
          backend: 'codex' as const,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      ],
    };
    const restartedSnapshot = {
      ...benchSnapshot,
      messages: [],
    };
    const deployedBenchSnapshot = {
      ...restartedSnapshot,
      agents: [
        ...restartedSnapshot.agents,
        {
          id: 'agent-jules-bench',
          teamId: 'team-skwad-core',
          name: 'Jules Prime',
          avatar: '🤖',
          folder: '/Users/nbonamy/src/jules',
          status: { type: 'idle' as const },
          createdAt: '2026-06-05T00:00:01.000Z',
          updatedAt: '2026-06-05T00:00:01.000Z',
        },
      ],
      activeTeamId: 'team-skwad-core',
      activeAgentId: 'agent-jules-bench',
    };
    const removedBenchSnapshot = {
      ...deployedBenchSnapshot,
      bench: [],
    };
    const closedSnapshot = {
      ...removedBenchSnapshot,
      agents: removedBenchSnapshot.agents.filter((agent) => agent.id !== 'agent-jules'),
      activeAgentId: 'agent-dina',
    };
    const closedTeamSnapshot = {
      ...closedSnapshot,
      teams: closedSnapshot.teams.filter((team) => team.id !== 'team-skwad-core'),
      activeTeamId: 'team-codex-claw',
    };
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/jules');
    const createTeam = vi.fn().mockResolvedValue(teamSnapshot);
    const updateTeam = vi.fn().mockResolvedValue(updatedTeamSnapshot);
    const reorderTeams = vi.fn().mockResolvedValue(selectedTeamSnapshot);
    const reorderAgents = vi.fn().mockResolvedValue(reorderedAgentsSnapshot);
    const closeTeam = vi.fn().mockResolvedValue(closedTeamSnapshot);
    const selectTeam = vi.fn().mockResolvedValue(selectedCoreTeamSnapshot);
    const createAgent = vi.fn().mockResolvedValue(createdSnapshot);
    const updateAgent = vi.fn().mockResolvedValue(updatedSnapshot);
    const duplicateAgent = vi.fn().mockResolvedValue(duplicatedSnapshot);
    const moveAgentToTeam = vi.fn().mockResolvedValue(movedSnapshot);
    const saveAgentToBench = vi.fn().mockResolvedValue(benchSnapshot);
    const restartAgent = vi.fn().mockResolvedValue(restartedSnapshot);
    const deployBenchTemplate = vi.fn().mockResolvedValue(deployedBenchSnapshot);
    const removeBenchTemplate = vi.fn().mockResolvedValue(removedBenchSnapshot);
    const closeAgent = vi.fn().mockResolvedValue(closedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
        chooseAgentFolder,
        createTeam,
        updateTeam,
        reorderTeams,
        closeTeam,
        selectTeam,
        createAgent,
        updateAgent,
        duplicateAgent,
        moveAgentToTeam,
        reorderAgents,
        saveAgentToBench,
        restartAgent,
        deployBenchTemplate,
        removeBenchTemplate,
        closeAgent,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await expect(state.chooseAgentFolder()).resolves.toBe('/Users/nbonamy/src/jules');
    await state.createTeam({ name: 'Skwad Core', color: '#46A857' });
    await state.reorderTeams({ teamId: 'team-skwad-core', beforeTeamId: 'team-codex-claw' });
    await state.selectTeam('team-codex-claw');
    await state.updateTeam({ id: 'team-codex-claw', name: 'Core Team', color: '#46A857' });
    await state.reorderAgents({ teamId: 'team-codex-claw', agentId: 'agent-jesse', beforeAgentId: 'agent-dina' });
    await state.createAgent({ name: 'Jules', avatar: '🤖', folder: '/Users/nbonamy/src/jules', backend: 'claude' });
    await state.updateAgent({ id: 'agent-jules', name: 'Jules Prime', avatar: '🤖', folder: '/Users/nbonamy/src/jules', backend: 'claude' });
    await state.duplicateAgent('agent-jules');
    await state.moveAgentToTeam({ agentId: 'agent-jules', teamId: 'team-skwad-core' });
    await state.saveAgentToBench('agent-jules');
    await state.restartAgent('agent-jules');
    await state.deployBenchTemplate('bench-jules-prime');
    await state.deployBenchTemplate({ templateId: 'bench-jules-prime', teamId: 'team-codex-claw' });
    await state.removeBenchTemplate('bench-jules-prime');
    await state.closeAgent('agent-jules');
    await state.closeTeam('team-skwad-core');

    expect(createTeam).toHaveBeenCalledWith({ name: 'Skwad Core', color: '#46A857' });
    expect(reorderTeams).toHaveBeenCalledWith({ teamId: 'team-skwad-core', beforeTeamId: 'team-codex-claw' });
    expect(selectTeam).toHaveBeenCalledWith('team-codex-claw');
    expect(updateTeam).toHaveBeenCalledWith({ id: 'team-codex-claw', name: 'Core Team', color: '#46A857' });
    expect(reorderAgents).toHaveBeenCalledWith({ teamId: 'team-codex-claw', agentId: 'agent-jesse', beforeAgentId: 'agent-dina' });
    expect(createAgent).toHaveBeenCalledWith({ name: 'Jules', avatar: '🤖', folder: '/Users/nbonamy/src/jules', backend: 'claude' });
    expect(updateAgent).toHaveBeenCalledWith({ id: 'agent-jules', name: 'Jules Prime', avatar: '🤖', folder: '/Users/nbonamy/src/jules', backend: 'claude' });
    expect(duplicateAgent).toHaveBeenCalledWith('agent-jules');
    expect(moveAgentToTeam).toHaveBeenCalledWith({ agentId: 'agent-jules', teamId: 'team-skwad-core' });
    expect(saveAgentToBench).toHaveBeenCalledWith('agent-jules');
    expect(restartAgent).toHaveBeenCalledWith('agent-jules');
    expect(deployBenchTemplate).toHaveBeenNthCalledWith(1, 'bench-jules-prime', 'team-skwad-core');
    expect(deployBenchTemplate).toHaveBeenNthCalledWith(2, 'bench-jules-prime', 'team-codex-claw');
    expect(removeBenchTemplate).toHaveBeenCalledWith('bench-jules-prime');
    expect(closeAgent).toHaveBeenCalledWith('agent-jules');
    expect(closeTeam).toHaveBeenCalledWith('team-skwad-core');
    expect(state.snapshot.value).toStrictEqual(closedTeamSnapshot);
  });

  it('keeps remote Bench catalogs cached separately from the local snapshot', async () => {
    const localSnapshot = createInitialSnapshot();
    localSnapshot.remoteConnections.connections = [{
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      status: 'ready',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }];
    localSnapshot.teams[0]!.remoteConnectionId = 'connection-devbox';
    localSnapshot.teams[0]!.remoteTeamId = 'team-remote';
    localSnapshot.agents[0]!.teamId = 'team-codex-claw';
    localSnapshot.agents[0]!.folder = '/home/nicolas/src/codex-claw';
    const remoteLocation = { kind: 'remote' as const, remoteConnectionId: 'connection-devbox' };
    const remoteBenchSnapshot = {
      ...createInitialSnapshot(),
      bench: [{
        id: 'bench-remote-dina',
        name: 'Remote Dina',
        folder: '/home/nicolas/src/codex-claw',
        backend: 'codex' as const,
        createdAt: '2026-06-13T00:00:00.000Z',
        updatedAt: '2026-06-13T00:00:00.000Z',
      }],
    };
    const remoteBenchRemovedSnapshot = {
      ...createInitialSnapshot(),
      bench: [],
    };
    const projectedRemoteTeamSnapshot = {
      ...localSnapshot,
      agents: [
        ...localSnapshot.agents,
        {
          id: 'agent-from-remote-bench',
          teamId: 'team-codex-claw',
          name: 'Remote Dina',
          folder: '/home/nicolas/src/codex-claw',
          backend: 'codex' as const,
          status: { type: 'idle' as const },
          createdAt: '2026-06-13T00:00:00.000Z',
          updatedAt: '2026-06-13T00:00:00.000Z',
        },
      ],
    };
    const getBenchSnapshot = vi.fn().mockResolvedValue(remoteBenchSnapshot);
    const saveAgentToBench = vi.fn().mockResolvedValue(remoteBenchSnapshot);
    const deployBenchTemplate = vi.fn().mockResolvedValue(projectedRemoteTeamSnapshot);
    const removeBenchTemplate = vi.fn().mockResolvedValue(remoteBenchRemovedSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(localSnapshot),
        onEvent: vi.fn(),
        getBenchSnapshot,
        saveAgentToBench,
        deployBenchTemplate,
        removeBenchTemplate,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await expect(state.loadBench(remoteLocation)).resolves.toStrictEqual(remoteBenchSnapshot.bench);
    expect(state.remoteBenchByConnectionId.value['connection-devbox']).toStrictEqual(remoteBenchSnapshot.bench);

    await state.saveAgentToBench('agent-dina');
    expect(state.snapshot.value.bench).toStrictEqual([]);
    expect(state.remoteBenchByConnectionId.value['connection-devbox']).toStrictEqual(remoteBenchSnapshot.bench);

    await expect(state.deployBenchTemplate({ templateId: 'bench-remote-dina', teamId: 'team-codex-claw' })).resolves.toMatchObject({
      id: 'agent-from-remote-bench',
    });
    expect(state.snapshot.value).toStrictEqual(projectedRemoteTeamSnapshot);

    await state.removeBenchTemplate({ templateId: 'bench-remote-dina', teamId: 'team-codex-claw' });
    expect(state.snapshot.value).toStrictEqual(projectedRemoteTeamSnapshot);
    expect(state.remoteBenchByConnectionId.value['connection-devbox']).toStrictEqual([]);

    expect(getBenchSnapshot).toHaveBeenCalledWith(remoteLocation);
    expect(saveAgentToBench).toHaveBeenCalledWith('agent-dina');
    expect(deployBenchTemplate).toHaveBeenCalledWith('bench-remote-dina', 'team-codex-claw', remoteLocation);
    expect(removeBenchTemplate).toHaveBeenCalledWith('bench-remote-dina', remoteLocation);
  });

  it('returns safe defaults when optional agent preload helpers are unavailable', async () => {
    const remoteSnapshot = createInitialSnapshot();
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    const before = state.snapshot.value;

    await expect(state.chooseAgentFolder()).resolves.toBeNull();
    await state.createTeam({ name: 'Ignored Team', color: '#46A857' });
    await state.updateTeam({ id: 'team-codex-claw', name: 'Ignored Team', color: '#46A857' });
    await state.reorderTeams({ teamId: 'team-codex-claw', beforeTeamId: null });
    await state.closeTeam('team-codex-claw');
    await state.selectTeam('team-codex-claw');
    await state.createAgent({ name: 'Ignored', folder: '/tmp/ignored' });
    await state.updateAgent({ id: 'agent-dina', name: 'Ignored', folder: '/tmp/ignored' });
    await state.duplicateAgent('agent-dina');
    await state.moveAgentToTeam({ agentId: 'agent-dina', teamId: 'team-codex-claw' });
    await state.reorderAgents({ teamId: 'team-codex-claw', agentId: 'agent-dina', beforeAgentId: null });
    await state.saveAgentToBench('agent-dina');
    await state.deployBenchTemplate('missing-template');
    await state.removeBenchTemplate('missing-template');
    await state.restartAgent('agent-dina');
    await state.closeAgent('agent-dina');

    expect(state.snapshot.value).toBe(before);
  });

  it('creates, updates, and deletes loops through the preload bridge', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.bench.push({
      id: 'bench-dina',
      name: 'Dina',
      folder: '/Users/nbonamy/src/codex-claw',
      backend: 'codex',
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:00:00.000Z',
    });
    const loopInput = {
      name: 'GitHub bugs',
      source: {
        provider: 'github' as const,
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench' as const,
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing' as const,
          teamId: 'team-codex-claw',
        },
      },
    };
    const createdSnapshot = {
      ...remoteSnapshot,
      loops: [{
        id: 'loop-bugs',
        enabled: true,
        instructions: {},
        executionLog: [],
        createdAt: '2026-06-09T10:01:00.000Z',
        updatedAt: '2026-06-09T10:01:00.000Z',
        ...loopInput,
      }],
    };
    const updatedSnapshot = {
      ...createdSnapshot,
      loops: [{
        ...createdSnapshot.loops[0],
        enabled: false,
        name: 'Paused bugs',
      }],
    };
    const historyClearedSnapshot = {
      ...updatedSnapshot,
      loops: [{
        ...updatedSnapshot.loops[0],
        executionLog: [],
      }],
    };
    const runSnapshot = {
      ...updatedSnapshot,
      loops: [{
        ...updatedSnapshot.loops[0],
        lastRunAt: '2026-06-09T10:02:00.000Z',
        executionLog: [{
          id: 'loop-exec-1',
          loopId: 'loop-bugs',
          startedAt: '2026-06-09T10:02:00.000Z',
          status: 'working' as const,
          createdCount: 1,
          createdAgents: [],
        }],
      }],
    };
    const executionDeletedSnapshot = {
      ...runSnapshot,
      loops: [{
        ...runSnapshot.loops[0],
        executionLog: [],
      }],
    };
    const deletedSnapshot = {
      ...historyClearedSnapshot,
      loops: [],
    };
    const createLoop = vi.fn().mockResolvedValue(createdSnapshot);
    const updateLoop = vi.fn().mockResolvedValue(updatedSnapshot);
    const runLoop = vi.fn().mockResolvedValue(runSnapshot);
    const clearLoopHistory = vi.fn().mockResolvedValue(historyClearedSnapshot);
    const deleteLoopExecution = vi.fn().mockResolvedValue(executionDeletedSnapshot);
    const deleteLoop = vi.fn().mockResolvedValue(deletedSnapshot);
    const conversationMessages: RendererMessage[] = [{
      id: 'message-dina-user',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-09T10:00:00.000Z',
      parts: [{ type: 'text', text: 'hello' }],
    }];
    const readConversationMessages = vi.fn().mockResolvedValue(conversationMessages);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
        createLoop,
        updateLoop,
        runLoop,
        clearLoopHistory,
        deleteLoopExecution,
        deleteLoop,
        readConversationMessages,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.createLoop(loopInput);
    await state.updateLoop({
      ...loopInput,
      id: 'loop-bugs',
      enabled: false,
      name: 'Paused bugs',
    });
    await state.runLoop('loop-bugs');
    await state.deleteLoopExecution('loop-bugs', 'loop-exec-1');
    await state.clearLoopHistory('loop-bugs');
    await state.deleteLoop('loop-bugs');
    await expect(state.readConversationMessages({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina')).resolves.toStrictEqual(conversationMessages);
    const reactiveConversationRef = reactive({
      backend: 'claude' as const,
      folder: '/Users/nbonamy/src/codex-claw',
      sessionId: 'session-dina',
    });
    await expect(state.readConversationMessages(reactiveConversationRef as BackendConversationRef, 'agent-dina')).resolves.toStrictEqual(conversationMessages);

    expect(createLoop).toHaveBeenCalledWith(loopInput);
    expect(updateLoop).toHaveBeenCalledWith({
      ...loopInput,
      id: 'loop-bugs',
      enabled: false,
      name: 'Paused bugs',
    });
    expect(runLoop).toHaveBeenCalledWith('loop-bugs');
    expect(deleteLoopExecution).toHaveBeenCalledWith('loop-bugs', 'loop-exec-1');
    expect(clearLoopHistory).toHaveBeenCalledWith('loop-bugs');
    expect(deleteLoop).toHaveBeenCalledWith('loop-bugs');
    expect(readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
    expect(readConversationMessages).toHaveBeenLastCalledWith({
      backend: 'claude',
      folder: '/Users/nbonamy/src/codex-claw',
      sessionId: 'session-dina',
    }, 'agent-dina');
    expect(readConversationMessages.mock.calls.at(-1)?.[0]).not.toBe(reactiveConversationRef);
    expect(state.snapshot.value).toStrictEqual(deletedSnapshot);
  });

  it('lists and resumes active agent conversations through preload', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const resumedSnapshot = {
      ...remoteSnapshot,
      agents: remoteSnapshot.agents.map((agent) => (
        agent.id === 'agent-dina'
          ? { ...agent, backendSession: { kind: 'codex' as const, threadId: 'thread-dina' } }
          : agent
      )),
      messages: [{
        id: 'user-thread-dina',
        agentId: 'agent-dina',
        role: 'user' as const,
        status: 'complete' as const,
        createdAt: '2026-06-09T10:00:00.000Z',
        parts: [{ type: 'text' as const, text: 'hello again' }],
      }],
    };
    const conversations: ConversationSummary[] = [{
      id: 'thread-dina',
      title: 'hello again',
      updatedAt: '2026-06-09T10:00:00.000Z',
      messageCount: 1,
      ref: { backend: 'codex', threadId: 'thread-dina' },
    }];
    const listAgentConversations = vi.fn().mockResolvedValue(conversations);
    const resumeAgentConversation = vi.fn().mockResolvedValue(resumedSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
        listAgentConversations,
        resumeAgentConversation,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await expect(state.listAgentConversations('agent-dina')).resolves.toStrictEqual(conversations);

    const reactiveConversationRef = reactive({
      backend: 'codex' as const,
      threadId: 'thread-dina',
    });
    await state.resumeAgentConversation('agent-dina', reactiveConversationRef as BackendConversationRef);

    expect(listAgentConversations).toHaveBeenCalledWith('agent-dina');
    expect(resumeAgentConversation).toHaveBeenCalledWith('agent-dina', { backend: 'codex', threadId: 'thread-dina' });
    expect(resumeAgentConversation.mock.calls.at(-1)?.[1]).not.toBe(reactiveConversationRef);
    expect(state.snapshot.value).toStrictEqual(resumedSnapshot);
  });

  it('ignores invalid reorder requests before calling main', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const reorderTeams = vi.fn().mockResolvedValue(remoteSnapshot);
    const reorderAgents = vi.fn().mockResolvedValue(remoteSnapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
        reorderTeams,
        reorderAgents,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await state.reorderTeams({ teamId: 'missing-team', beforeTeamId: null });
    await state.reorderTeams({ teamId: 'team-codex-claw', beforeTeamId: 'missing-team' });
    await state.reorderAgents({ teamId: 'missing-team', agentId: 'agent-dina', beforeAgentId: null });
    await state.reorderAgents({ teamId: 'team-codex-claw', agentId: 'missing-agent', beforeAgentId: null });
    await state.reorderAgents({ teamId: 'team-codex-claw', agentId: 'agent-dina', beforeAgentId: 'missing-agent' });

    expect(reorderTeams).not.toHaveBeenCalled();
    expect(reorderAgents).not.toHaveBeenCalled();
  });

  it('loads backend models, selects the default reasoning effort, and sends it with prompts', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.messages.push({
      id: 'message-user',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-05T00:00:01.000Z',
      parts: [{ type: 'text', text: 'use the selected model' }],
    });
    const listBackendModels = vi.fn().mockResolvedValue([
      {
        id: 'codex-fast',
        model: 'gpt-5.1-codex-fast',
        displayName: 'GPT-5.1 Codex Fast',
        description: 'Fast coding work',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'low', description: 'Quick' },
          { reasoningEffort: 'medium', description: 'Balanced' },
        ],
        defaultReasoningEffort: 'medium',
        isDefault: false,
      },
      {
        id: 'codex-max',
        model: 'gpt-5.1-codex-max',
        displayName: 'GPT-5.1 Codex Max',
        description: 'Deep coding work',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'medium', description: 'Balanced' },
          { reasoningEffort: 'high', description: 'Deep' },
        ],
        defaultReasoningEffort: 'high',
        isDefault: true,
      },
    ]);
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listBackendModels,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.loadBackendModels();

    expect(state.modelCatalogStatus.value).toBe('loaded');
    expect(state.selectedModelId.value).toBe('codex-max');
    expect(state.selectedReasoningEffort.value).toBe('high');

    state.selectModel('codex-fast');
    state.selectReasoningEffort('low');
    await state.sendPrompt('use the selected model');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'use the selected model', {
      model: 'gpt-5.1-codex-fast',
      planMode: false,
      reasoningEffort: 'low',
    });
  });

  it('includes selected plan mode in prompt options', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    state.selectedModelId.value = null;
    state.selectedReasoningEffort.value = null;
    state.setPlanMode(true);

    await state.sendPrompt('make a plan and keep going');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'make a plan and keep going', {
      planMode: true,
    });
  });

  it('includes prompted plan mode for Claude agents', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].backend = 'claude';
    remoteSnapshot.agents[0].backendDefaults = { kind: 'claude' };
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.agents[0].backend = 'claude';
    updatedSnapshot.agents[0].backendDefaults = { kind: 'claude' };
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    state.setPlanMode(true);

    await state.sendPrompt('make a Claude plan');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'make a Claude plan', {
      planMode: true,
    });
  });

  it('sets a Codex goal from slash goal without sending a prompt', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.agents[0].goal = {
      threadId: 'thread-1',
      objective: 'ship the feature',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const sendPrompt = vi.fn().mockResolvedValue(createInitialSnapshot());
    const setAgentGoal = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        setAgentGoal,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await state.sendPrompt('/goal ship the feature');

    expect(setAgentGoal).toHaveBeenCalledWith('agent-dina', 'ship the feature');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(state.activeGoal.value?.objective).toBe('ship the feature');
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
  });

  it('clears a Codex goal from slash goal clear even while busy', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].status = { type: 'working' };
    remoteSnapshot.agents[0].goal = {
      threadId: 'thread-1',
      objective: 'ship the feature',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const updatedSnapshot = createInitialSnapshot();
    updatedSnapshot.agents[0].status = { type: 'working' };
    const sendPrompt = vi.fn().mockResolvedValue(createInitialSnapshot());
    const clearAgentGoal = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        clearAgentGoal,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    await state.sendPrompt('/goal clear');

    expect(clearAgentGoal).toHaveBeenCalledWith('agent-dina');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(state.activeGoal.value).toBeNull();
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
  });

  it('enables plan mode from bare slash plan without sending a prompt', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const sendPrompt = vi.fn().mockResolvedValue(createInitialSnapshot());

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    state.backendModels.value = [];
    state.selectedModelId.value = null;
    state.selectedReasoningEffort.value = null;
    state.setPlanMode(false);

    await state.sendPrompt('/plan');

    expect(state.planMode.value).toBe(true);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
  });

  it('strips slash plan arguments and submits the prompt in plan mode', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    state.backendModels.value = [];
    state.selectedModelId.value = null;
    state.selectedReasoningEffort.value = null;
    state.setPlanMode(false);

    await state.sendPrompt('/plan build the plan');

    expect(state.planMode.value).toBe(true);
    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'build the plan', {
      planMode: true,
    });
  });

  it('does not queue or send bare slash plan while an agent is busy', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].status = { type: 'working' };
    const sendPrompt = vi.fn().mockResolvedValue(createInitialSnapshot());

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    state.backendModels.value = [];
    state.selectedModelId.value = null;
    state.selectedReasoningEffort.value = null;
    state.setPlanMode(false);

    await state.sendPrompt('/plan');

    expect(state.planMode.value).toBe(true);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
  });

  it('loads active agent skills and includes dollar-selected skills in prompt options', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const updatedSnapshot = createInitialSnapshot();
    const listBackendSkills = vi.fn().mockResolvedValue([
      {
        name: 'frontend-design',
        description: 'Design polished frontend pages and UI.',
        path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
        scope: 'project',
        enabled: true,
      },
      {
        name: 'skill-creator',
        description: 'Create or update Codex skills.',
        path: '/Users/nbonamy/.codex/skills/skill-creator/SKILL.md',
        scope: 'user',
        enabled: true,
      },
    ]);
    const sendPrompt = vi.fn().mockResolvedValue(updatedSnapshot);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listBackendSkills,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    state.setPlanMode(false);

    expect(state.skillCatalogStatus.value).toBe('loaded');
    expect(listBackendSkills).toHaveBeenCalledWith('agent-dina');
    expect(state.backendSkills.value.map((skill) => skill.name)).toStrictEqual([
      'frontend-design',
      'skill-creator',
    ]);

    await state.sendPrompt('$frontend-design make the dialog beautiful');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', '$frontend-design make the dialog beautiful', {
      planMode: false,
      skills: [
        {
          name: 'frontend-design',
          path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
        },
      ],
    });
  });

  it('loads active agent files from preload for composer mentions', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const listAgentFiles = vi.fn().mockResolvedValue([
      { name: 'README.md', path: 'README.md' },
      { name: 'research.md', path: 'docs/research.md' },
    ]);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listAgentFiles,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.fileCatalogStatus.value).toBe('loaded');
    expect(listAgentFiles).toHaveBeenCalledWith('agent-dina');
    expect(state.agentFiles.value).toStrictEqual([
      { name: 'README.md', path: 'README.md' },
      { name: 'research.md', path: 'docs/research.md' },
    ]);
  });

  it('refreshes active agent skills after a skills changed event', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();
    const listBackendSkills = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          name: 'skill-creator',
          description: 'Create or update Codex skills.',
          path: '/Users/nbonamy/.codex/skills/skill-creator/SKILL.md',
          scope: 'user',
          enabled: true,
        },
      ]);

    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        listBackendSkills,
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
      type: 'skills.changed',
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    await vi.waitFor(() => {
      expect(listBackendSkills).toHaveBeenCalledTimes(2);
      expect(state.backendSkills.value.map((skill) => skill.name)).toStrictEqual(['skill-creator']);
    });
  });

  it('captures side panel requests from main events', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();

    vi.stubGlobal('window', {
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
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(state.sidePanelRequest.value).toStrictEqual({
      kind: 'gitDiff',
      scope: 'workingTree',
      title: 'Current diff',
      subtitle: 'Working tree',
      diff: 'diff --git a/a.ts b/a.ts\n',
    });
  });

  it('ignores malformed side panel events', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();

    vi.stubGlobal('window', {
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
      type: 'thread.statusChanged',
      payload: { kind: 'markdown', content: '# Wrong event' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as MainToRendererEvent);
    listeners[0]?.({
      seq: 2,
      agentId: 'agent-dina',
      type: 'sidePanel.markdownRequested',
      payload: null,
      occurredAt: '2026-06-05T00:00:02.000Z',
    } as MainToRendererEvent);
    listeners[0]?.({
      seq: 3,
      agentId: 'agent-dina',
      type: 'sidePanel.markdownRequested',
      payload: { kind: 'diff', content: '# Wrong kind' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    } as MainToRendererEvent);
    listeners[0]?.({
      seq: 4,
      agentId: 'agent-dina',
      type: 'sidePanel.markdownRequested',
      payload: { kind: 'markdown', content: 123 },
      occurredAt: '2026-06-05T00:00:04.000Z',
    } as MainToRendererEvent);
    listeners[0]?.({
      seq: 5,
      agentId: 'agent-dina',
      type: 'sidePanel.gitDiffRequested',
      payload: { kind: 'gitDiff', diff: 123 },
      occurredAt: '2026-06-05T00:00:05.000Z',
    } as MainToRendererEvent);

    expect(state.sidePanelRequest.value).toBeNull();

    listeners[0]?.({
      seq: 6,
      agentId: 'agent-dina',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        title: 123,
        path: false,
        content: '# Valid',
      },
      occurredAt: '2026-06-05T00:00:05.000Z',
    } as MainToRendererEvent);

    expect(state.sidePanelRequest.value).toStrictEqual({
      kind: 'markdown',
      content: '# Valid',
    });
  });

  it('syncs composer mode and active goal from app-owned main events', async () => {
    const listeners: Array<(event: MainToRendererEvent) => void> = [];
    const remoteSnapshot = createInitialSnapshot();

    vi.stubGlobal('window', {
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
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.modeUpdated',
      payload: { mode: 'plan' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    const goalSnapshot = createInitialSnapshot();
    goalSnapshot.agents[0].goal = {
      threadId: 'thread-1',
      objective: 'ship it',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 0,
      updatedAt: 0,
    };

    listeners[0]?.({
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.goalUpdated',
      payload: {
        goal: {
          threadId: 'thread-1',
          objective: 'ship it',
          status: 'active',
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
      snapshot: goalSnapshot,
    });

    expect(state.planMode.value).toBe(true);
    expect(state.activeGoal.value?.objective).toBe('ship it');

    listeners[0]?.({
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.modeUpdated',
      payload: { mode: 'default' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    listeners[0]?.({
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.goalCleared',
      payload: {},
      occurredAt: '2026-06-05T00:00:04.000Z',
      snapshot: createInitialSnapshot(),
    });

    expect(state.planMode.value).toBe(false);
    expect(state.activeGoal.value).toBeNull();
  });

  it('handles model catalog loading guards, errors, and invalid selections', async () => {
    const listBackendModels = vi.fn().mockRejectedValue(new Error('models unavailable'));
    vi.stubGlobal('window', {
      codexClaw: {
        listBackendModels,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.modelCatalogStatus.value = 'loading';
    await state.loadBackendModels();

    expect(listBackendModels).not.toHaveBeenCalled();

    state.modelCatalogStatus.value = 'notLoaded';
    state.modelCatalogError.value = null;
    await state.loadBackendModels();

    expect(state.modelCatalogStatus.value).toBe('error');
    expect(state.modelCatalogError.value).toBe('models unavailable');

    state.selectedModelId.value = null;
    state.selectedReasoningEffort.value = null;
    state.selectModel('missing-model');
    state.selectReasoningEffort('high');

    expect(state.selectedModelId.value).toBeNull();
    expect(state.selectedReasoningEffort.value).toBeNull();
  });

  it('keeps an already selected model when the catalog reloads', async () => {
    vi.stubGlobal('window', {
      codexClaw: {
        listBackendModels: vi.fn().mockResolvedValue([
          {
            id: 'codex-existing',
            model: 'gpt-5.1-codex-existing',
            displayName: 'Existing',
            hidden: false,
            supportedReasoningEfforts: [],
            isDefault: false,
          },
          {
            id: 'codex-default',
            model: 'gpt-5.1-codex-default',
            displayName: 'Default',
            hidden: false,
            supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Balanced' }],
            defaultReasoningEffort: 'medium',
            isDefault: true,
          },
        ]),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.modelCatalogStatus.value = 'notLoaded';
    state.selectedModelId.value = 'codex-existing';
    state.selectedReasoningEffort.value = null;

    await state.loadBackendModels();

    expect(state.selectedModelId.value).toBe('codex-existing');
    expect(state.selectedReasoningEffort.value).toBeNull();
  });
});

function workRepository(): WorkRepository {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw',
    owner: 'nbonamy',
    name: 'codex-claw',
    fullName: 'nbonamy/codex-claw',
    url: 'https://github.com/nbonamy/codex-claw',
    isPrivate: true,
  };
}

function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit drag target',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    authorName: 'nbonamy',
    body: 'Make issue assignment feel obvious.',
    labels: [{ name: 'bug', color: 'ff0000' }],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}
