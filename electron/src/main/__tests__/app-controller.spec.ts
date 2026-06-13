import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppController } from '../app-controller';
import { createInitialSnapshot } from '@codex-claw/shared/snapshot';
import type { AgentFileReadResult, AgentFileSearchItem, AppSnapshot, AppleSpeechTranscriptionOptions, AppleSpeechTranscriptionResult, BackendConversationRef, ConversationSummary, CreateLoopInput, CreateSourceWorktreeInput, Loop, LoopCleanup, LoopTeamTarget, MainToRendererEvent, RendererMessage, SourceRepository, SourceWorktree, UpdateLoopInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind } from '@codex-claw/shared/contracts';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import type { AppStatePersistence } from '@codex-claw/shared/state-persistence';
import type { AgentBackendDriver, BackendSendResult } from '../backends/types';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { ipcChannels } from '@codex-claw/shared/ipc';

describe('AppController', () => {
  it('starts and health-checks the configured backend process client', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const backendClient = {
      start: vi.fn().mockResolvedValue(undefined),
      health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
      request: vi.fn().mockResolvedValue({}),
      onEvent: vi.fn(() => () => undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AppController(persistence, undefined, backendClient);

    await controller.initialize();
    await controller.shutdown();

    expect(backendClient.start).toHaveBeenCalledOnce();
    expect(backendClient.health).toHaveBeenCalledOnce();
    expect(backendClient.close).toHaveBeenCalledOnce();
  });

  it('applies backend events emitted by the clawd process client', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const unsubscribe = vi.fn();
    let emitBackendEvent: (event: ClawBackendEvent) => void = () => undefined;
    const backendClient = createBackendClientWithEventEmitter((listener) => {
      emitBackendEvent = listener;
      return unsubscribe;
    });
    const controller = new AppController(persistence, undefined, backendClient);
    const send = vi.fn();

    setMainWindowSend(controller, send);
    await controller.initialize();
    await getBackendDriver(controller, 'codex');
    emitBackendEvent({
      seq: 42,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '2026-06-13T00:00:00.000Z',
    });
    await controller.shutdown();

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      seq: 42,
      backend: 'codex',
      agentId: 'agent-dina',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('routes source repository discovery through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
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
    const request = vi.fn().mockResolvedValue(repositories);
    const controller = new AppController(createPersistence(snapshot), undefined, createBackendClient({ request }));

    await controller.initialize();

    await expect(listSourceRepositories(controller)).resolves.toStrictEqual(repositories);
    expect(request).toHaveBeenCalledWith('source/listRepositories', {
      sourceFolderPath: '/Users/nbonamy/src',
    });
  });

  it('routes source worktree creation through clawd and records the recent repository', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder = {
      path: '/Users/nbonamy/src',
      initialized: true,
      recentRepoNames: [],
    };
    const worktree: SourceWorktree = {
      name: 'backend-split',
      path: '/Users/nbonamy/src/codex-claw-backend-split',
    };
    const request = vi.fn()
      .mockResolvedValueOnce(worktree)
      .mockResolvedValueOnce([{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [],
      } satisfies SourceRepository]);
    const persistence = createPersistence(snapshot);
    const controller = new AppController(persistence, undefined, createBackendClient({ request }));
    const input: CreateSourceWorktreeInput = {
      repoPath: '/Users/nbonamy/src/codex-claw',
      branchName: 'backend-split',
    };

    await controller.initialize();

    await expect(createSourceWorktree(controller, input)).resolves.toStrictEqual(worktree);
    expect(request).toHaveBeenNthCalledWith(1, 'source/createWorktree', { input });
    expect(request).toHaveBeenNthCalledWith(2, 'source/listRepositories', {
      sourceFolderPath: '/Users/nbonamy/src',
    });
    expect(snapshot.sourceFolder.recentRepoNames).toStrictEqual(['codex-claw']);
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('routes Apple Speech transcription through clawd using a JSON-safe audio payload', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const transcription: AppleSpeechTranscriptionResult = { text: 'ship it' };
    const request = vi.fn().mockResolvedValue(transcription);
    const controller = new AppController(createPersistence(snapshot), undefined, createBackendClient({ request }));
    const audioData = new Uint8Array([1, 2, 3]).buffer;

    await controller.initialize();

    await expect(transcribeAppleSpeech(controller, audioData, { locale: 'en-US' })).resolves.toStrictEqual(transcription);
    expect(request).toHaveBeenCalledWith('transcription/appleSpeech', {
      audioBase64: Buffer.from(audioData).toString('base64'),
      options: { locale: 'en-US' },
      assetsPath: path.resolve(process.cwd(), 'assets'),
    });
  });

  it('routes work provider actions through clawd when the backend client is connected', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const configuredSnapshot = {
      ...snapshot,
      workBacklog: {
        ...snapshot.workBacklog,
        providerConfigurations: {
          github: { repositoryId: 'nbonamy/codex-claw' },
        },
      },
    };
    const request = vi.fn(async (method: string) => {
      if (method === 'workProvider/connect') {
        return { snapshot, authorization: { provider: 'github', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresAt: '2026-06-13T00:00:00.000Z' } };
      }
      if (method === 'workProvider/configureBacklog') {
        return configuredSnapshot;
      }
      if (method === 'workProvider/listItems') {
        return [{ provider: 'github', id: 'github:nbonamy/codex-claw#12', title: 'Fix bug', url: 'https://github.com/nbonamy/codex-claw/issues/12' }];
      }
      return snapshot;
    });
    const controller = new AppController(createPersistence(snapshot), undefined, createBackendClient({ request }));

    await controller.initialize();

    await expect(connectWorkProvider(controller, 'github')).resolves.toMatchObject({
      authorization: { provider: 'github', userCode: 'ABCD-1234' },
    });
    await expect(configureWorkBacklog(controller, { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } })).resolves.toStrictEqual(configuredSnapshot);
    await expect(listWorkItems(controller, 'github', 'nbonamy/codex-claw')).resolves.toStrictEqual([{
      provider: 'github',
      id: 'github:nbonamy/codex-claw#12',
      title: 'Fix bug',
      url: 'https://github.com/nbonamy/codex-claw/issues/12',
    }]);

    expect(request).toHaveBeenNthCalledWith(1, 'workProvider/connect', { provider: 'github' });
    expect(request).toHaveBeenNthCalledWith(2, 'workProvider/configureBacklog', { input: { provider: 'github', configuration: { repositoryId: 'nbonamy/codex-claw' } } });
    expect(request).toHaveBeenNthCalledWith(3, 'workProvider/listItems', { provider: 'github', repositoryId: 'nbonamy/codex-claw' });
  });

  it('routes loop mutations and runs through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    const backendSnapshot = {
      ...snapshot,
      loops: [loopFixture({
        cleanup: { deleteAgent: false },
        teamTarget: { mode: 'existing', teamId: 'team-codex-claw' },
      })],
    };
    const request = vi.fn().mockResolvedValue(backendSnapshot);
    const controller = new AppController(createPersistence(snapshot), undefined, createBackendClient({ request }));
    const createInput: CreateLoopInput = {
      name: 'GitHub bugs',
      enabled: true,
      source: {
        provider: 'github',
        repositoryId: 'nbonamy/codex-claw',
      },
      action: {
        type: 'create-agent-from-bench',
        benchTemplateId: 'bench-dina',
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
      instructions: {},
    };
    const updateInput: UpdateLoopInput = {
      ...createInput,
      id: 'loop-bugs',
    };

    await controller.initialize();

    await expect(createLoop(controller, createInput)).resolves.toBe(backendSnapshot);
    await expect(updateLoop(controller, updateInput)).resolves.toBe(backendSnapshot);
    await expect(runLoop(controller, 'loop-bugs')).resolves.toBe(backendSnapshot);
    await expect(clearLoopHistory(controller, 'loop-bugs')).resolves.toBe(backendSnapshot);
    await expect(deleteLoopExecution(controller, 'loop-bugs', 'loop-exec-1')).resolves.toBe(backendSnapshot);
    await expect(deleteLoop(controller, 'loop-bugs')).resolves.toBe(backendSnapshot);

    expect(request).toHaveBeenNthCalledWith(1, 'loop/create', { input: createInput });
    expect(request).toHaveBeenNthCalledWith(2, 'loop/update', { input: updateInput });
    expect(request).toHaveBeenNthCalledWith(3, 'loop/run', { loopId: 'loop-bugs' });
    expect(request).toHaveBeenNthCalledWith(4, 'loop/history/clear', { loopId: 'loop-bugs' });
    expect(request).toHaveBeenNthCalledWith(5, 'loop/execution/delete', { loopId: 'loop-bugs', executionId: 'loop-exec-1' });
    expect(request).toHaveBeenNthCalledWith(6, 'loop/delete', { loopId: 'loop-bugs' });
  });

  it('refreshes git status through the backend driver capability', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const getGitStatus = vi.fn().mockResolvedValue({
      folder: '/Users/nbonamy/src/id8',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 2,
      addedLines: 12,
      removedLines: 4,
      hasUntracked: false,
      state: 'dirty',
      updatedAt: '2026-06-11T10:00:00.000Z',
    });
    const backendDriver = createFakeCodexBackendDriver({ getGitStatus });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await refreshAgentGitStatus(controller, 'agent-dina');

    expect(getGitStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(snapshot.agentGitStatuses['agent-dina']).toStrictEqual({
      folder: '/Users/nbonamy/src/id8',
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: 2,
      addedLines: 12,
      removedLines: 4,
      hasUntracked: false,
      state: 'dirty',
      updatedAt: '2026-06-11T10:00:00.000Z',
    });
  });

  it('opens repo git diff previews through the backend driver capability', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const send = vi.fn();
    const getGitDiff = vi.fn().mockResolvedValue('diff --git a/a.ts b/a.ts\n');
    const backendDriver = createFakeCodexBackendDriver({ getGitDiff });

    await controller.initialize();
    setMainWindowSend(controller, send);
    setCodexBackendDriver(controller, backendDriver);
    await openAgentGitDiff(controller, 'agent-dina');

    expect(getGitDiff).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      agentId: 'agent-dina',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        title: 'Git Diff',
        subtitle: '~/src/codex-claw',
        diff: 'diff --git a/a.ts b/a.ts\n',
      },
    }));
  });

  it('forgets backend session caches when restarting an agent', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      forgetAgentSession: vi.fn(),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await restartAgent(controller, 'agent-dina');

    expect(backendDriver.forgetAgentSession).toHaveBeenCalledWith('agent-dina');
    expect(snapshot.agents[0].backendSession).toBeUndefined();
    expect(snapshot.messages.filter((message) => message.agentId === 'agent-dina')).toStrictEqual([]);
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('persists token usage updates emitted by Codex', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
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
    emitAndApply(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'thread.tokenUsageUpdated',
      payload: { contextUsage },
    });
    await flushMicrotasks();

    expect(snapshot.agents[0].contextUsage).toStrictEqual(contextUsage);
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('persists account rate-limit updates emitted by Codex', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
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
    emitAndApply(controller, {
      type: 'account.rateLimitsUpdated',
      payload: { rateLimits },
    });
    await flushMicrotasks();

    expect(snapshot.accountRateLimits).toStrictEqual(rateLimits);
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('persists Codex plan updates and previews the completed plan as markdown', async () => {
    const snapshot = createInitialSnapshot();
    const send = vi.fn();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setMainWindowSend(controller, send);
    emitAndApply(controller, {
      agentId: 'agent-dina',
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
      explanation: 'Current plan',
      steps: [
        { step: 'Inspect app-server event', status: 'completed' },
        { step: 'Preview markdown', status: 'inProgress' },
      ],
      markdown: 'Current plan\n- [x] Inspect app-server event\n- [ ] Preview markdown',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Plan',
        content: 'Current plan\n- [x] Inspect app-server event\n- [ ] Preview markdown',
      },
    }));

    emitAndApply(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T10:11:20.000Z',
    });

    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Plan',
        content: 'Current plan\n- [x] Inspect app-server event\n- [ ] Preview markdown',
      },
    }));
  });

  it('persists and previews completed Codex plan items', async () => {
    const snapshot = createInitialSnapshot();
    const send = vi.fn();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setMainWindowSend(controller, send);
    emitAndApply(controller, {
      agentId: 'agent-dina',
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
      explanation: '',
      steps: [],
      markdown: '# Dummy False Plan\n\n- [ ] Do not implement',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
    await flushMicrotasks();
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Plan',
        content: '# Dummy False Plan\n\n- [ ] Do not implement',
      },
    }));

    emitAndApply(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T10:11:20.000Z',
    });
    await flushMicrotasks();

    expect(send).toHaveBeenLastCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-plan',
      type: 'sidePanel.markdownRequested',
      payload: {
        kind: 'markdown',
        purpose: 'plan',
        title: 'Plan',
        content: '# Dummy False Plan\n\n- [ ] Do not implement',
      },
    }));
  });

  it('sets and clears an agent goal through the backend driver', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      setGoal: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        goal: {
          threadId: 'thread-dina',
          objective: 'Ship the goal shelf',
          status: 'active',
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      }),
      clearGoal: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        cleared: true,
      }),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await setAgentGoal(controller, 'agent-dina', ' Ship the goal shelf ');

    expect(backendDriver.setGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'Ship the goal shelf');
    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-dina' });
    expect(snapshot.agents[0].goal?.objective).toBe('Ship the goal shelf');
    expect(persistence.save).toHaveBeenCalledWith(snapshot);

    await clearAgentGoal(controller, 'agent-dina');

    expect(backendDriver.clearGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(snapshot.agents[0].goal).toBeUndefined();
  });

  it('sets a generic conversation title when a goal creates a backend session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 15, 42));
    try {
      const snapshot = createInitialSnapshot();
      const persistence = {
        load: vi.fn().mockResolvedValue(snapshot),
        save: vi.fn().mockResolvedValue(undefined),
      } as unknown as AppStatePersistence;
      const controller = new AppController(persistence);
      const setConversationTitle = vi.fn().mockResolvedValue(undefined);
      const backendDriver = createFakeCodexBackendDriver({
        setConversationTitle,
        setGoal: vi.fn().mockResolvedValue({
          backendSession: { kind: 'codex', threadId: 'thread-dina' },
          goal: {
            threadId: 'thread-dina',
            objective: 'Ship the goal shelf',
            status: 'active',
            tokenBudget: null,
            tokensUsed: 0,
            timeUsedSeconds: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        }),
      });

      await controller.initialize();
      setCodexBackendDriver(controller, backendDriver);
      await setAgentGoal(controller, 'agent-dina', 'Ship the goal shelf');

      expect(setConversationTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent-dina',
          backendSession: { kind: 'codex', threadId: 'thread-dina' },
        }),
        'Dina - Jun 10, 2026 3:42 PM',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets an approval preset through the backend driver', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      setApprovalPreset: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        approvalPreset: 'approve-for-me',
      }),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await setAgentApprovalPreset(controller, 'agent-dina', 'approve-for-me');

    expect(backendDriver.setApprovalPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'approve-for-me');
    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-dina' });
    expect(snapshot.agents[0].backendDefaults).toStrictEqual({
      kind: 'codex',
      approvalPreset: 'approve-for-me',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandboxMode: 'workspace-write',
    });
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('interrupts the active Codex turn and keeps status until completion arrives', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      interrupt: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-1' }),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await interruptAgent(controller, 'agent-dina');

    expect(backendDriver.interrupt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
  });

  it('routes Claude prompts through the Claude backend driver', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backend = 'claude';
    snapshot.agents[0].backendDefaults = { kind: 'claude' };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeClaudeBackendDriver({
      sendPrompt: vi.fn().mockResolvedValue({
        backendSession: { kind: 'claude', sessionId: 'claude-session-1', transport: 'stdio' },
        turnId: 'claude-turn-1',
      }),
    });

    await controller.initialize();
    setClaudeBackendDriver(controller, backendDriver);
    await sendPrompt(controller, 'agent-dina', 'hello claude');
    await flushMicrotasks();

    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina', backend: 'claude' }), 'hello claude');
    expect(snapshot.messages.at(-1)).toMatchObject({
      agentId: 'agent-dina',
      role: 'user',
      parts: [{ type: 'text', text: 'hello claude' }],
    });
    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'claude', sessionId: 'claude-session-1', transport: 'stdio' });
  });

  it('sets a generic conversation title when a prompt creates a backend session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 15, 42));
    try {
      const snapshot = createInitialSnapshot();
      const persistence = {
        load: vi.fn().mockResolvedValue(snapshot),
        save: vi.fn().mockResolvedValue(undefined),
      } as unknown as AppStatePersistence;
      const controller = new AppController(persistence);
      const setConversationTitle = vi.fn().mockResolvedValue(undefined);
      const backendDriver = createFakeCodexBackendDriver({ setConversationTitle });

      await controller.initialize();
      setCodexBackendDriver(controller, backendDriver);
      await sendPrompt(controller, 'agent-dina', 'hello codex');
      await flushMicrotasks();

      expect(setConversationTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent-dina',
          backendSession: { kind: 'codex', threadId: 'thread-dina' },
        }),
        'Dina - Jun 10, 2026 3:42 PM',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retitle an existing backend session', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-existing' };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const setConversationTitle = vi.fn().mockResolvedValue(undefined);
    const backendDriver = createFakeCodexBackendDriver({ setConversationTitle });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await sendPrompt(controller, 'agent-dina', 'continue');
    await flushMicrotasks();

    expect(setConversationTitle).not.toHaveBeenCalled();
  });

  it('keeps prompt startup successful when title assignment fails', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      setConversationTitle: vi.fn().mockRejectedValue(new Error('name unavailable')),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await sendPrompt(controller, 'agent-dina', 'hello codex');
    await flushMicrotasks();

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-dina' });
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
  });

  it('reads historical conversation messages through the referenced backend driver', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.loops = [loopFixture({
      cleanup: {
        deleteAgent: false,
      },
      teamTarget: {
        mode: 'existing',
        teamId: 'team-codex-claw',
      },
    })];
    snapshot.loops[0]!.executionLog = [{
      id: 'loop-exec-1',
      loopId: 'loop-bugs',
      startedAt: '2026-06-09T10:00:00.000Z',
      status: 'completed',
      createdCount: 1,
      createdAgents: [{
        agentId: 'agent-dina',
        agentName: 'Dina',
        workItemId: 'github:nbonamy/codex-claw#12',
        workItemTitle: 'Fix cockpit',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
        conversationRef: { backend: 'codex', threadId: 'thread-dina' },
      }],
    }];
    const messages = [{
      id: 'user-thread-dina-user-1',
      agentId: 'agent-dina',
      role: 'user' as const,
      status: 'complete' as const,
      createdAt: '2026-06-09T10:00:00.000Z',
      parts: [{ type: 'text' as const, text: 'hello' }],
    }];
    const backendDriver = createFakeCodexBackendDriver({
      readConversationMessages: vi.fn().mockResolvedValue(messages),
    });
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);

    await expect(readConversationMessages(controller, { backend: 'codex', threadId: 'thread-dina' }, 'agent-dina')).resolves.toStrictEqual(messages);
    expect(backendDriver.readConversationMessages).toHaveBeenCalledWith({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina');
  });

  it('lists agent conversations through the agent backend driver', async () => {
    const snapshot = createInitialSnapshot();
    const conversations: ConversationSummary[] = [{
      id: 'thread-dina',
      title: 'Read docs',
      updatedAt: '2026-06-09T10:00:00.000Z',
      messageCount: 3,
      ref: { backend: 'codex', threadId: 'thread-dina' },
    }];
    const backendDriver = createFakeCodexBackendDriver({
      listConversations: vi.fn().mockResolvedValue(conversations),
    });
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);

    await expect(listAgentConversations(controller, 'agent-dina')).resolves.toStrictEqual(conversations);
    expect(backendDriver.listConversations).toHaveBeenCalledWith(snapshot.agents[0]);
  });

  it('resumes an agent conversation through the backend driver and persists the selected session', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    snapshot.messages = [{
      id: 'user-old',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-09T09:00:00.000Z',
      parts: [{ type: 'text', text: 'old' }],
    }, {
      id: 'user-jesse',
      agentId: 'agent-jesse',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-09T09:01:00.000Z',
      parts: [{ type: 'text', text: 'keep' }],
    }];
    const resumedMessages: RendererMessage[] = [{
      id: 'user-thread-dina',
      agentId: 'agent-dina',
      role: 'user',
      status: 'complete',
      createdAt: '2026-06-09T10:00:00.000Z',
      parts: [{ type: 'text', text: 'resumed' }],
    }];
    const backendDriver = createFakeCodexBackendDriver({
      resumeConversation: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        messages: resumedMessages,
      }),
    });
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);

    await expect(resumeAgentConversation(controller, 'agent-dina', { backend: 'codex', threadId: 'thread-dina' })).resolves.toBe(snapshot);

    expect(backendDriver.resumeConversation).toHaveBeenCalledWith(snapshot.agents[0], { backend: 'codex', threadId: 'thread-dina' });
    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-dina' });
    expect(snapshot.messages.map((message) => [message.agentId, message.parts[0]?.type === 'text' ? message.parts[0].text : ''])).toStrictEqual([
      ['agent-jesse', 'keep'],
      ['agent-dina', 'resumed'],
    ]);
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('rejects conversation resume for busy agents before reaching the backend driver', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const backendDriver = createFakeCodexBackendDriver({
      resumeConversation: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        messages: [],
      }),
    });
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);

    await expect(resumeAgentConversation(controller, 'agent-dina', { backend: 'codex', threadId: 'thread-dina' })).rejects.toThrow('Agent must be idle before resuming a conversation.');
    expect(backendDriver.resumeConversation).not.toHaveBeenCalled();
  });

  it('rejects unrecorded historical conversation refs before reaching a backend driver', async () => {
    const snapshot = createInitialSnapshot();
    const backendDriver = createFakeCodexBackendDriver({
      readConversationMessages: vi.fn().mockResolvedValue([]),
    });
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);

    await expect(readConversationMessages(controller, { backend: 'codex', threadId: 'thread-dina' }, 'agent-dina')).rejects.toThrow('Conversation reference is not available.');
    expect(backendDriver.readConversationMessages).not.toHaveBeenCalled();
  });

  it('rejects invalid historical conversation refs before reaching a backend driver', async () => {
    const snapshot = createInitialSnapshot();
    const backendDriver = createFakeCodexBackendDriver({
      readConversationMessages: vi.fn().mockResolvedValue([]),
    });
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);

    await expect(readConversationMessages(controller, { backend: 'codex' }, 'agent-dina')).rejects.toThrow('Invalid conversation reference.');
    expect(backendDriver.readConversationMessages).not.toHaveBeenCalled();
  });

  it('routes agent file listing and reads through clawd', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.sourceFolder.initialized = true;
    snapshot.agents[0].folder = '/Users/nbonamy/src/codex-claw';
    const files: AgentFileSearchItem[] = [{ name: 'README.md', path: 'README.md' }];
    const readResult: AgentFileReadResult = { path: 'README.md', content: '# Read me\n' };
    const request = vi.fn()
      .mockResolvedValueOnce(files)
      .mockResolvedValueOnce(readResult);
    const controller = new AppController(createPersistence(snapshot), undefined, createBackendClient({ request }));

    await controller.initialize();

    await expect(listAgentFiles(controller, 'agent-dina')).resolves.toStrictEqual(files);
    await expect(readAgentFile(controller, 'agent-dina', 'README.md')).resolves.toStrictEqual(readResult);
    await expect(readAgentFile(controller, 'agent-missing', 'README.md')).rejects.toThrow('Agent not found');
    expect(request).toHaveBeenNthCalledWith(1, 'agent/listFiles', {
      folder: '/Users/nbonamy/src/codex-claw',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'agent/readFile', {
      folder: '/Users/nbonamy/src/codex-claw',
      filePath: 'README.md',
    });
  });

  it('prompts a git diff side panel preview from turn diff updates', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    await controller.initialize();
    const send = vi.fn();
    (controller as unknown as {
      mainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
      refreshAgentGitStatus(agentId: string): Promise<void>;
    }).mainWindow = { webContents: { send } };
    (controller as unknown as {
      refreshAgentGitStatus(agentId: string): Promise<void>;
    }).refreshAgentGitStatus = vi.fn().mockResolvedValue(undefined);
    const diff = [
      'diff --git a/src/main.ts b/src/main.ts',
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    emitAndApply(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'diff.updated',
      payload: {
        turnId: 'turn-1',
        addedLines: 1,
        removedLines: 1,
        diff,
      },
    });

    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      type: 'diff.updated',
      payload: expect.objectContaining({ diff }),
    }));
    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'sidePanel.gitDiffRequested',
      payload: {
        kind: 'gitDiff',
        title: 'Git Diff',
        subtitle: 'Current turn',
        diff,
      },
    }));
  });

  it('ignores malformed turn diff preview payloads', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    await controller.initialize();
    const send = vi.fn();
    (controller as unknown as {
      mainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
      refreshAgentGitStatus(agentId: string): Promise<void>;
    }).mainWindow = { webContents: { send } };
    (controller as unknown as {
      refreshAgentGitStatus(agentId: string): Promise<void>;
    }).refreshAgentGitStatus = vi.fn().mockResolvedValue(undefined);

    emitAndApply(controller, {
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-1',
      type: 'diff.updated',
      payload: {
        turnId: 'turn-1',
        addedLines: 1,
        removedLines: 1,
      },
    });

    expect(send).toHaveBeenCalledWith('app:event', expect.objectContaining({
      type: 'diff.updated',
    }));
    expect(send).not.toHaveBeenCalledWith('app:event', expect.objectContaining({
      type: 'sidePanel.gitDiffRequested',
    }));
  });

  it('deletes a message by rolling back from its Codex turn and replacing history', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
      userMessage('user-turn-2', 'turn-2', 'second prompt'),
      assistantMessage('assistant-turn-2', 'turn-2', 'second answer'),
    ];
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      rollbackToTurn: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        messages: snapshot.messages.slice(0, 2),
      }),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await deleteMessage(controller, 'agent-dina', 'user-turn-2');

    expect(backendDriver.rollbackToTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'turn-2');
    expect(snapshot.messages.map((message) => message.id)).toStrictEqual(['user-turn-1', 'assistant-turn-1']);
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('retries an assistant message by rolling back and resending the matching user prompt', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
    ];
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      rollbackToTurn: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        messages: [],
      }),
      sendPrompt: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-retry' }),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await retryMessage(controller, 'agent-dina', 'assistant-turn-1');

    expect(backendDriver.rollbackToTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'turn-1');
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'first prompt');
  });

  it('edits a user message by rolling back and resending the edited prompt', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-dina' };
    snapshot.messages = [
      userMessage('user-turn-1', 'turn-1', 'first prompt'),
      assistantMessage('assistant-turn-1', 'turn-1', 'first answer'),
    ];
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      rollbackToTurn: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        messages: [],
      }),
      sendPrompt: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-edit' }),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await editMessage(controller, 'agent-dina', 'user-turn-1', ' edited prompt ');

    expect(backendDriver.rollbackToTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'turn-1');
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'edited prompt');
  });
});

function loopFixture(input: { cleanup: LoopCleanup; teamTarget: LoopTeamTarget }): Loop {
  return {
    id: 'loop-bugs',
    name: 'GitHub bugs',
    enabled: true,
    source: {
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      tagName: 'bug',
    },
    action: {
      type: 'create-agent-from-bench',
      benchTemplateId: 'bench-dina',
      teamTarget: input.teamTarget,
      cleanup: input.cleanup,
    },
    instructions: {},
    executionLog: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:00:00.000Z',
  };
}

function emitAndApply(
  controller: AppController,
  event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
): void {
  (controller as unknown as {
    emitAndApply(
      event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
    ): void;
  }).emitAndApply(event);
}

function setCodexBackendDriver(
  controller: AppController,
  backendDriver: AgentBackendDriver,
): void {
  (controller as unknown as {
    backendDrivers: Map<string, AgentBackendDriver>;
  }).backendDrivers.set('codex', backendDriver);
}

function setClaudeBackendDriver(
  controller: AppController,
  backendDriver: AgentBackendDriver,
): void {
  (controller as unknown as {
    backendDrivers: Map<string, AgentBackendDriver>;
  }).backendDrivers.set('claude', backendDriver);
}

function setMainWindowSend(controller: AppController, send: ReturnType<typeof vi.fn>): void {
  (controller as unknown as {
    mainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
  }).mainWindow = {
    webContents: {
      send,
    },
  };
}

function createFakeCodexBackendDriver(overrides: Partial<AgentBackendDriver> = {}): AgentBackendDriver {
  return {
    backend: 'codex',
    getRuntimeStatus: () => ({ backend: 'codex', status: 'notConfigured' }),
    getCapabilities: () => codexBackendCapabilities,
    sendPrompt: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-1' }),
    interrupt: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, turnId: 'turn-1' }),
    respondToRequest: vi.fn().mockResolvedValue(undefined),
    rollbackToTurn: vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'thread-dina' }, messages: [] }),
    onEvent: vi.fn(() => () => undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createFakeClaudeBackendDriver(overrides: Partial<AgentBackendDriver> = {}): AgentBackendDriver {
  return {
    backend: 'claude',
    getRuntimeStatus: () => ({ backend: 'claude', status: 'notConfigured' }),
    getCapabilities: () => claudeBackendCapabilities,
    sendPrompt: vi.fn().mockResolvedValue({ backendSession: { kind: 'claude', sessionId: 'claude-session-1', transport: 'stdio' }, turnId: 'claude-turn-1' }),
    interrupt: vi.fn().mockResolvedValue({ backendSession: { kind: 'claude', sessionId: 'claude-session-1', transport: 'stdio' }, turnId: 'claude-turn-1' }),
    respondToRequest: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(() => () => undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function sendPrompt(controller: AppController, agentId: string, prompt: string): Promise<void> {
  await (controller as unknown as {
    sendPrompt(agentId: string, prompt: string): Promise<void>;
  }).sendPrompt(agentId, prompt);
}

async function restartAgent(controller: AppController, agentId: string): Promise<void> {
  await (controller as unknown as {
    restartAgent(agentId: string): Promise<void>;
  }).restartAgent(agentId);
}

async function openAgentGitDiff(controller: AppController, agentId: string): Promise<void> {
  await (controller as unknown as {
    openAgentGitDiff(agentId: string): Promise<void>;
  }).openAgentGitDiff(agentId);
}

async function refreshAgentGitStatus(controller: AppController, agentId: string): Promise<void> {
  await (controller as unknown as {
    refreshAgentGitStatus(agentId: string): Promise<void>;
  }).refreshAgentGitStatus(agentId);
}

async function getBackendDriver(controller: AppController, backend: 'codex' | 'claude'): Promise<AgentBackendDriver> {
  return (controller as unknown as {
    getBackendDriver(backend: 'codex' | 'claude'): Promise<AgentBackendDriver>;
  }).getBackendDriver(backend);
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

function createBackendClient(overrides: {
  request?: unknown;
  onEvent?: unknown;
} = {}): NonNullable<ConstructorParameters<typeof AppController>[2]> {
  const request = (overrides.request ?? vi.fn().mockResolvedValue({})) as (method: string, params?: unknown) => Promise<unknown>;
  const onEvent = (overrides.onEvent ?? vi.fn(() => () => undefined)) as (listener: (event: ClawBackendEvent) => void) => () => void;
  return {
    start: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ ok: true, name: 'clawd', version: '0.1.0', pid: 123 }),
    request: <Result>(method: string, params?: unknown) => {
      if (method === 'snapshot/get') {
        return Promise.resolve({}) as Promise<Result>;
      }
      if (method === 'agent/validateFolder') {
        return Promise.resolve(null) as Promise<Result>;
      }
      return request(method, params) as Promise<Result>;
    },
    onEvent,
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createPersistence(snapshot: AppSnapshot): AppStatePersistence {
  return {
    load: vi.fn().mockResolvedValue(snapshot),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as AppStatePersistence;
}

async function listSourceRepositories(controller: AppController): Promise<SourceRepository[]> {
  return (controller as unknown as {
    listSourceRepositories(): Promise<SourceRepository[]>;
  }).listSourceRepositories();
}

async function createSourceWorktree(
  controller: AppController,
  input: CreateSourceWorktreeInput,
): Promise<SourceWorktree> {
  return (controller as unknown as {
    createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree>;
  }).createSourceWorktree(input);
}

async function transcribeAppleSpeech(
  controller: AppController,
  audioData: ArrayBuffer,
  options?: AppleSpeechTranscriptionOptions,
): Promise<AppleSpeechTranscriptionResult> {
  return (controller as unknown as {
    transcribeAppleSpeech(audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions): Promise<AppleSpeechTranscriptionResult>;
  }).transcribeAppleSpeech(audioData, options);
}

async function createLoop(controller: AppController, input: CreateLoopInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    createLoop(input: CreateLoopInput): Promise<AppSnapshot>;
  }).createLoop(input);
}

async function updateLoop(controller: AppController, input: UpdateLoopInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    updateLoop(input: UpdateLoopInput): Promise<AppSnapshot>;
  }).updateLoop(input);
}

async function runLoop(controller: AppController, loopId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    runLoop(loopId: string): Promise<AppSnapshot>;
  }).runLoop(loopId);
}

async function clearLoopHistory(controller: AppController, loopId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    clearLoopHistory(loopId: string): Promise<AppSnapshot>;
  }).clearLoopHistory(loopId);
}

async function deleteLoopExecution(controller: AppController, loopId: string, executionId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteLoopExecution(loopId: string, executionId: string): Promise<AppSnapshot>;
  }).deleteLoopExecution(loopId, executionId);
}

async function deleteLoop(controller: AppController, loopId: string): Promise<AppSnapshot> {
  return (controller as unknown as {
    deleteLoop(loopId: string): Promise<AppSnapshot>;
  }).deleteLoop(loopId);
}

async function readConversationMessages(
  controller: AppController,
  ref: unknown,
  agentId: string,
): Promise<RendererMessage[]> {
  return (controller as unknown as {
    readConversationMessages(ref: unknown, agentId: string): Promise<RendererMessage[]>;
  }).readConversationMessages(ref, agentId);
}

async function listAgentConversations(
  controller: AppController,
  agentId: string,
): Promise<ConversationSummary[]> {
  return (controller as unknown as {
    listAgentConversations(agentId: string): Promise<ConversationSummary[]>;
  }).listAgentConversations(agentId);
}

async function resumeAgentConversation(
  controller: AppController,
  agentId: string,
  ref: BackendConversationRef,
): Promise<AppSnapshot> {
  return (controller as unknown as {
    resumeAgentConversation(agentId: string, ref: unknown): Promise<AppSnapshot>;
  }).resumeAgentConversation(agentId, ref);
}

async function interruptAgent(controller: AppController, agentId: string): Promise<void> {
  await (controller as unknown as {
    interruptAgent(agentId: string): Promise<void>;
  }).interruptAgent(agentId);
}

async function deleteMessage(controller: AppController, agentId: string, messageId: string): Promise<void> {
  await (controller as unknown as {
    deleteMessage(agentId: string, messageId: string): Promise<void>;
  }).deleteMessage(agentId, messageId);
}

async function retryMessage(controller: AppController, agentId: string, messageId: string): Promise<void> {
  await (controller as unknown as {
    retryMessage(agentId: string, messageId: string): Promise<void>;
  }).retryMessage(agentId, messageId);
}

async function editMessage(controller: AppController, agentId: string, messageId: string, prompt: string): Promise<void> {
  await (controller as unknown as {
    editMessage(agentId: string, messageId: string, prompt: string): Promise<void>;
  }).editMessage(agentId, messageId, prompt);
}

async function setAgentGoal(controller: AppController, agentId: string, objective: string): Promise<void> {
  await (controller as unknown as {
    setAgentGoal(agentId: string, objective: string): Promise<void>;
  }).setAgentGoal(agentId, objective);
}

async function clearAgentGoal(controller: AppController, agentId: string): Promise<void> {
  await (controller as unknown as {
    clearAgentGoal(agentId: string): Promise<void>;
  }).clearAgentGoal(agentId);
}

async function setAgentApprovalPreset(controller: AppController, agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<void> {
  await (controller as unknown as {
    setAgentApprovalPreset(agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<void>;
  }).setAgentApprovalPreset(agentId, preset);
}

async function readAgentFile(controller: AppController, agentId: string, filePath: string): Promise<unknown> {
  return (controller as unknown as {
    readAgentFile(agentId: string, filePath: string): Promise<unknown>;
  }).readAgentFile(agentId, filePath);
}

async function listAgentFiles(controller: AppController, agentId: string): Promise<AgentFileSearchItem[]> {
  return (controller as unknown as {
    listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]>;
  }).listAgentFiles(agentId);
}

async function connectWorkProvider(controller: AppController, provider: WorkProviderKind): Promise<WorkProviderConnectResult> {
  return (controller as unknown as {
    connectWorkProvider(provider: WorkProviderKind): Promise<WorkProviderConnectResult>;
  }).connectWorkProvider(provider);
}

async function configureWorkBacklog(controller: AppController, input: WorkBacklogConfigurationInput): Promise<AppSnapshot> {
  return (controller as unknown as {
    configureWorkBacklog(input: WorkBacklogConfigurationInput): Promise<AppSnapshot>;
  }).configureWorkBacklog(input);
}

async function listWorkItems(controller: AppController, provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]> {
  return (controller as unknown as {
    listWorkItems(provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]>;
  }).listWorkItems(provider, repositoryId);
}

function userMessage(id: string, turnId: string, text: string) {
  return {
    id,
    agentId: 'agent-dina',
    role: 'user' as const,
    status: 'complete' as const,
    turnId,
    createdAt: '2026-06-05T00:00:00.000Z',
    parts: [{ type: 'text' as const, text }],
  };
}

function assistantMessage(id: string, turnId: string, text: string) {
  return {
    id,
    agentId: 'agent-dina',
    role: 'assistant' as const,
    status: 'complete' as const,
    turnId,
    createdAt: '2026-06-05T00:00:01.000Z',
    parts: [{ type: 'text' as const, text }],
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
