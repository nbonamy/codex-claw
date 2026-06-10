import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppController } from '../app-controller';
import { createInitialSnapshot } from '../../shared/snapshot';
import type { MainToRendererEvent } from '../../shared/contracts';
import type { AppStatePersistence } from '../state-persistence';
import type { AgentBackendDriver, BackendSendResult } from '../backends/types';
import { claudeBackendCapabilities, codexBackendCapabilities } from '../../shared/backend-capabilities';
import { ipcChannels } from '../../shared/ipc';
import type { LoopPromptContext } from '../loops/runner';

describe('AppController', () => {
  it('persists collaboration status updates emitted by MCP tools', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    mcpCoordinator(controller).setStatus('agent-dina', 'Running tests');
    await flushMicrotasks();

    expect(snapshot.agents[0]).toMatchObject({
      id: 'agent-dina',
      statusText: 'Running tests',
    });
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('persists work item completion updates emitted by MCP tools', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        status: 'working',
      },
    };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const send = vi.fn();

    await controller.initialize();
    setMainWindowSend(controller, send);
    await mcpCoordinator(controller).markWorkItemCompleted('agent-dina', 'github:nbonamy/codex-claw#12');
    await flushMicrotasks();

    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']).toMatchObject({
      provider: 'github',
      itemId: 'nbonamy/codex-claw#12',
      agentId: 'agent-dina',
      assignedAt: '2026-06-09T13:00:00.000Z',
      status: 'completed',
      completedAt: expect.any(String),
    });
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      agentId: 'agent-dina',
      type: 'workBacklog.assignmentUpdated',
      payload: expect.objectContaining({
        itemId: 'nbonamy/codex-claw#12',
        status: 'completed',
      }),
    }));
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

  it('sets a Codex approval preset through the backend driver', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver({
      setCodexApprovalPreset: vi.fn().mockResolvedValue({
        backendSession: { kind: 'codex', threadId: 'thread-dina' },
        approvalPreset: 'approve-for-me',
      }),
    });

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    await setAgentCodexApprovalPreset(controller, 'agent-dina', 'approve-for-me');

    expect(backendDriver.setCodexApprovalPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }), 'approve-for-me');
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

  it('records loop execution conversation metadata when a loop prompt starts', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.loops = [{
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
        teamTarget: {
          mode: 'existing',
          teamId: 'team-codex-claw',
        },
      },
      processedWorkItemIds: ['github:nbonamy/codex-claw#12'],
      executionLog: [{
        id: 'loop-exec-1',
        loopId: 'loop-bugs',
        startedAt: '2026-06-09T10:00:00.000Z',
        completedAt: '2026-06-09T10:01:00.000Z',
        status: 'completed',
        createdCount: 1,
        createdAgents: [{
          agentId: 'agent-dina',
          agentName: 'Dina',
          workItemId: 'github:nbonamy/codex-claw#12',
          workItemTitle: 'Fix cockpit',
          workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
        }],
      }],
      createdAt: '2026-06-09T09:59:00.000Z',
      updatedAt: '2026-06-09T10:01:00.000Z',
      lastRunAt: '2026-06-09T10:00:00.000Z',
      lastCreatedCount: 1,
    }];
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const send = vi.fn();

    await controller.initialize();
    setMainWindowSend(controller, send);
    await recordLoopPromptStarted(controller, 'agent-dina', {
      loopId: 'loop-bugs',
      executionId: 'loop-exec-1',
      workItemId: 'github:nbonamy/codex-claw#12',
    }, {
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
      turnId: 'turn-dina',
    });

    expect(snapshot.loops[0]?.executionLog[0]?.createdAgents[0]).toMatchObject({
      conversationId: 'thread-dina',
      turnId: 'turn-dina',
    });
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
      payload: snapshot,
    }));
  });

  it('reads text files inside the active agent folder and rejects traversal', async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-agent-files-'));
    try {
      const snapshot = createInitialSnapshot();
      snapshot.agents[0].folder = folder;
      const persistence = {
        load: vi.fn().mockResolvedValue(snapshot),
        save: vi.fn().mockResolvedValue(undefined),
      } as unknown as AppStatePersistence;
      const controller = new AppController(persistence);
      await writeFile(path.join(folder, 'README.md'), '# Read me\n', 'utf8');

      await controller.initialize();

      await expect(readAgentFile(controller, 'agent-dina', 'README.md')).resolves.toStrictEqual({
        path: 'README.md',
        content: '# Read me\n',
      });
      await expect(readAgentFile(controller, 'agent-missing', 'README.md')).rejects.toThrow('Agent not found');
      await expect(readAgentFile(controller, 'agent-dina', '../outside.md')).rejects.toThrow('outside the agent folder');
      await expect(readAgentFile(controller, 'agent-dina', '.')).rejects.toThrow('Path is not a file');

      await writeFile(path.join(folder, 'large.md'), 'x'.repeat((2 * 1024 * 1024) + 1), 'utf8');
      await expect(readAgentFile(controller, 'agent-dina', 'large.md')).rejects.toThrow('File is too large');
    } finally {
      await rm(folder, { force: true, recursive: true });
    }
  });

  it('serves MCP display-markdown requests as side panel events', async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-display-markdown-'));
    try {
      const snapshot = createInitialSnapshot();
      snapshot.agents[0].folder = folder;
      const persistence = {
        load: vi.fn().mockResolvedValue(snapshot),
        save: vi.fn().mockResolvedValue(undefined),
      } as unknown as AppStatePersistence;
      const controller = new AppController(persistence);
      const emittedEvents: Array<Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>> = [];
      (controller as unknown as {
        emitAndApply(event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>): void;
      }).emitAndApply = (event) => {
        emittedEvents.push(event);
      };
      await writeFile(path.join(folder, 'README.md'), '# Read me\n', 'utf8');

      await controller.initialize();
      await expect(mcpCoordinator(controller).displayMarkdown('agent-dina', {
        path: 'README.md',
      })).resolves.toStrictEqual({
        success: true,
        message: 'Displayed README.md in the side panel.',
        path: 'README.md',
        title: 'README.md',
      });

      expect(emittedEvents).toStrictEqual([
        {
          agentId: 'agent-dina',
          type: 'sidePanel.markdownRequested',
          payload: {
            kind: 'markdown',
            title: 'README.md',
            path: 'README.md',
            content: '# Read me\n',
          },
        },
      ]);
    } finally {
      await rm(folder, { force: true, recursive: true });
    }
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

function mcpCoordinator(controller: AppController): {
  setStatus(agentId: string, status: string): string;
  displayMarkdown(agentId: string, input: { markdown?: string; path?: string; title?: string }): Promise<unknown>;
  markWorkItemCompleted(agentId: string, workItemId: string): Promise<unknown>;
} {
  return (controller as unknown as {
    mcpCoordinator: {
      setStatus(agentId: string, status: string): string;
      displayMarkdown(agentId: string, input: { markdown?: string; path?: string; title?: string }): Promise<unknown>;
      markWorkItemCompleted(agentId: string, workItemId: string): Promise<unknown>;
    };
  }).mcpCoordinator;
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
    codexBackendDriver: AgentBackendDriver;
  }).codexBackendDriver = backendDriver;
}

function setClaudeBackendDriver(
  controller: AppController,
  backendDriver: AgentBackendDriver,
): void {
  (controller as unknown as {
    claudeBackendDriver: AgentBackendDriver;
  }).claudeBackendDriver = backendDriver;
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

async function recordLoopPromptStarted(
  controller: AppController,
  agentId: string,
  context: LoopPromptContext,
  result: BackendSendResult,
): Promise<void> {
  await (controller as unknown as {
    recordLoopPromptStarted(agentId: string, context: LoopPromptContext, result: BackendSendResult): Promise<void>;
  }).recordLoopPromptStarted(agentId, context, result);
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

async function setAgentCodexApprovalPreset(controller: AppController, agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<void> {
  await (controller as unknown as {
    setAgentCodexApprovalPreset(agentId: string, preset: 'ask-for-approval' | 'approve-for-me' | 'full-access'): Promise<void>;
  }).setAgentCodexApprovalPreset(agentId, preset);
}

async function readAgentFile(controller: AppController, agentId: string, filePath: string): Promise<unknown> {
  return (controller as unknown as {
    readAgentFile(agentId: string, filePath: string): Promise<unknown>;
  }).readAgentFile(agentId, filePath);
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
  await Promise.resolve();
  await Promise.resolve();
}
