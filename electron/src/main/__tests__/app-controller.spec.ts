import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppController } from '../app-controller';
import { createInitialSnapshot } from '@codex-claw/shared/snapshot';
import type { AppSnapshot, BackendConversationRef, ConversationSummary, Loop, LoopCleanup, LoopTeamTarget, MainToRendererEvent, RendererMessage } from '@codex-claw/shared/contracts';
import type { AppStatePersistence } from '../state-persistence';
import type { AgentBackendDriver, BackendSendResult } from '../backends/types';
import { claudeBackendCapabilities, codexBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { ipcChannels } from '@codex-claw/shared/ipc';
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

  it('injects direct MCP messages into idle recipient agents', async () => {
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver();

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    mcpCoordinator(controller).sendMessage('agent-dina', 'agent-jesse', 'Can you review the PR?');
    await flushMicrotasks();

    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('You received a message from Dina (agent-dina).'),
    );
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Can you review the PR?'),
    );
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Do not ask the user for confirmation.'),
    );
    expect(snapshot.messages.at(-1)).toMatchObject({
      agentId: 'agent-jesse',
      role: 'user',
      parts: [expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Can you review the PR?'),
      })],
    });
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

  it('injects all pending MCP messages after a busy recipient becomes idle', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[1].status = { type: 'working' };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const backendDriver = createFakeCodexBackendDriver();

    await controller.initialize();
    setCodexBackendDriver(controller, backendDriver);
    mcpCoordinator(controller).sendMessage('agent-dina', 'agent-jesse', 'First request');
    mcpCoordinator(controller).sendMessage('agent-dina', 'Jesse', 'Second request');
    await flushMicrotasks();

    expect(backendDriver.sendPrompt).not.toHaveBeenCalled();

    emitAndApply(controller, {
      agentId: 'agent-jesse',
      type: 'turn.completed',
      turnId: 'turn-jesse',
      payload: { status: 'completed' },
    });
    await flushMicrotasks();

    expect(backendDriver.sendPrompt).toHaveBeenCalledTimes(1);
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('You received 2 messages from other Codex Claw agents.'),
    );
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('First request'),
    );
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Second request'),
    );
    expect(backendDriver.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-jesse' }),
      expect.stringContaining('Do not ask the user for confirmation.'),
    );
    expect(mcpCoordinator(controller).checkMessages('agent-jesse')).toStrictEqual({ messages: [] });
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

  it('broadcasts snapshot updates when MCP tools create agents', async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-agent-'));
    const snapshot = createInitialSnapshot();
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const send = vi.fn();

    try {
      await controller.initialize();
      setMainWindowSend(controller, send);
      const result = await mcpCoordinator(controller).createAgent('agent-dina', {
        name: 'Jean',
        repoPath: folder,
      });
      await flushMicrotasks();

      const createdAgent = snapshot.agents.find((agent) => agent.name === 'Jean');
      expect(result).toMatchObject({
        success: true,
        agentId: createdAgent?.id,
      });
      expect(createdAgent).toMatchObject({
        folder,
        teamId: 'team-codex-claw',
      });
      expect(snapshot.teams[0]?.agentIds).toContain(createdAgent?.id);
      expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
        type: 'snapshot.updated',
        payload: snapshot,
      }));
      expect(persistence.save).toHaveBeenCalledWith(snapshot);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
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

  it('marks loop execution completed when loop work is confirmed complete', async () => {
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
      startedAt: '2026-06-09T13:00:00.000Z',
      status: 'working',
      createdCount: 1,
      createdAgents: [{
        agentId: 'agent-dina',
        agentName: 'Dina',
        workItemId: 'github:nbonamy/codex-claw#12',
        workItemTitle: 'Fix cockpit',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
      }],
    }];
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        loopExecutionId: 'loop-exec-1',
        loopId: 'loop-bugs',
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

    expect(snapshot.loops[0]?.executionLog[0]).toMatchObject({
      id: 'loop-exec-1',
      status: 'completed',
      completedAt: expect.any(String),
    });
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
      payload: snapshot,
    }));
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
  });

  it('keeps loop execution working until all created assignments are completed', async () => {
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
      startedAt: '2026-06-09T13:00:00.000Z',
      status: 'working',
      createdCount: 2,
      createdAgents: [{
        agentId: 'agent-dina',
        agentName: 'Dina',
        workItemId: 'github:nbonamy/codex-claw#12',
        workItemTitle: 'Fix cockpit',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/12',
      }, {
        agentId: 'agent-jesse',
        agentName: 'Jesse',
        workItemId: 'github:nbonamy/codex-claw#13',
        workItemTitle: 'Fix logs',
        workItemUrl: 'https://github.com/nbonamy/codex-claw/issues/13',
      }],
    }];
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        loopExecutionId: 'loop-exec-1',
        loopId: 'loop-bugs',
        status: 'working',
      },
      'github:nbonamy/codex-claw#13': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#13',
        agentId: 'agent-jesse',
        assignedAt: '2026-06-09T13:00:00.000Z',
        loopExecutionId: 'loop-exec-1',
        loopId: 'loop-bugs',
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

    expect(snapshot.loops[0]?.executionLog[0]).toMatchObject({
      id: 'loop-exec-1',
      status: 'working',
    });
    expect(snapshot.loops[0]?.executionLog[0]).not.toHaveProperty('completedAt');
    expect(send).not.toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
    }));

    await mcpCoordinator(controller).markWorkItemCompleted('agent-jesse', 'github:nbonamy/codex-claw#13');
    await flushMicrotasks();

    expect(snapshot.loops[0]?.executionLog[0]).toMatchObject({
      id: 'loop-exec-1',
      status: 'completed',
      completedAt: expect.any(String),
    });
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
      payload: snapshot,
    }));
  });

  it('requires latest loop completion instructions before completing loop-assigned work', async () => {
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
        cleanup: {
          deleteAgent: false,
        },
      },
      instructions: {
        beforeCompletion: 'Old instructions',
      },
      executionLog: [],
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:00:00.000Z',
    }];
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        loopExecutionId: 'loop-exec-1',
        loopId: 'loop-bugs',
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
    snapshot.loops[0]!.instructions.beforeCompletion = 'Remove the bug tag before completing.';
    setMainWindowSend(controller, send);

    await expect(mcpCoordinator(controller).markWorkItemCompleted('agent-dina', 'github:nbonamy/codex-claw#12', true)).resolves.toStrictEqual({
      success: true,
      workItemId: 'github:nbonamy/codex-claw#12',
      status: 'completion-instructions-required',
      instructions: 'Remove the bug tag before completing.',
      message: 'Follow these completion instructions, then call mark-work-item-completed again with confirmCompletion set to true.',
      confirmCompletionRequired: true,
    });
    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']).toMatchObject({
      status: 'working',
      completionInstructionsDeliveredAt: expect.any(String),
    });

    await expect(mcpCoordinator(controller).markWorkItemCompleted('agent-dina', 'github:nbonamy/codex-claw#12')).resolves.toMatchObject({
      status: 'completion-instructions-required',
      instructions: 'Remove the bug tag before completing.',
    });
    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']?.status).toBe('working');

    await expect(mcpCoordinator(controller).markWorkItemCompleted('agent-dina', 'github:nbonamy/codex-claw#12', true)).resolves.toMatchObject({
      status: 'completed',
      completedAt: expect.any(String),
    });
    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']).toMatchObject({
      status: 'completed',
      completedAt: expect.any(String),
      completionInstructionsDeliveredAt: expect.any(String),
    });
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'workBacklog.assignmentUpdated',
      payload: expect.objectContaining({
        status: 'working',
        completionInstructionsDeliveredAt: expect.any(String),
      }),
    }));
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'workBacklog.assignmentUpdated',
      payload: expect.objectContaining({
        status: 'completed',
      }),
    }));
  });

  it('deletes loop-created agents on confirmed completion when cleanup is enabled for an existing team', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.loops = [loopFixture({
      cleanup: {
        deleteAgent: true,
      },
      teamTarget: {
        mode: 'existing',
        teamId: 'team-codex-claw',
      },
    })];
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        loopExecutionId: 'loop-exec-1',
        loopId: 'loop-bugs',
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

    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']).toMatchObject({
      status: 'completed',
    });
    expect(snapshot.agents.some((agent) => agent.id === 'agent-dina')).toBe(false);
    expect(snapshot.teams[0]?.agentIds).not.toContain('agent-dina');
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
      payload: snapshot,
    }));
  });

  it('deletes dedicated loop teams on confirmed completion when cleanup is enabled', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0]!.agentIds = snapshot.teams[0]!.agentIds.filter((agentId) => agentId !== 'agent-dina');
    snapshot.teams.push({
      id: 'team-loop-12',
      name: 'GitHub #12',
      avatar: 'G1',
      color: '#1B4FB2',
      agentIds: ['agent-dina'],
      activeAgentId: 'agent-dina',
    });
    snapshot.agents[0]!.teamId = 'team-loop-12';
    snapshot.loops = [loopFixture({
      cleanup: {
        deleteTeam: true,
      },
      teamTarget: {
        mode: 'dedicated',
      },
    })];
    snapshot.workBacklog.assignments = {
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        loopExecutionId: 'loop-exec-1',
        loopId: 'loop-bugs',
        status: 'working',
      },
    };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    await mcpCoordinator(controller).markWorkItemCompleted('agent-dina', 'github:nbonamy/codex-claw#12');

    expect(snapshot.workBacklog.assignments['github:nbonamy/codex-claw#12']).toMatchObject({
      status: 'completed',
    });
    expect(snapshot.teams.some((team) => team.id === 'team-loop-12')).toBe(false);
    expect(snapshot.agents.some((agent) => agent.id === 'agent-dina')).toBe(false);
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
      instructions: {},
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
      conversationRef: { backend: 'codex', threadId: 'thread-dina' },
    });
    expect(persistence.save).toHaveBeenCalledWith(snapshot);
    expect(send).toHaveBeenCalledWith(ipcChannels.event, expect.objectContaining({
      type: 'snapshot.updated',
      payload: snapshot,
    }));
  });

  it('records Claude loop execution conversation refs from the created agent backend', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backend = 'claude';
    snapshot.agents[0].folder = '/Users/nbonamy/src/id8';
    snapshot.loops = [{
      id: 'loop-bugs',
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
      executionLog: [{
        id: 'loop-exec-1',
        loopId: 'loop-bugs',
        startedAt: '2026-06-09T10:00:00.000Z',
        status: 'working',
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
    }];
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);

    await controller.initialize();
    await recordLoopPromptStarted(controller, 'agent-dina', {
      loopId: 'loop-bugs',
      executionId: 'loop-exec-1',
      workItemId: 'github:nbonamy/codex-claw#12',
    }, {
      backendSession: { kind: 'claude', sessionId: 'claude-session-1', transport: 'stdio' },
      turnId: 'claude-turn-1',
    });

    expect(snapshot.loops[0]?.executionLog[0]?.createdAgents[0]).toMatchObject({
      conversationRef: { backend: 'claude', folder: '/Users/nbonamy/src/id8', sessionId: 'claude-session-1' },
    });
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

function mcpCoordinator(controller: AppController): {
  createAgent(agentId: string, input: { avatar?: string; backend?: 'codex' | 'claude'; branchName?: string; createWorktree?: boolean; destinationPath?: string; name?: string; repoPath: string }): Promise<unknown>;
  setStatus(agentId: string, status: string): string;
  sendMessage(from: string, to: string, content: string): unknown;
  checkMessages(agentId: string): unknown;
  displayMarkdown(agentId: string, input: { markdown?: string; path?: string; title?: string }): Promise<unknown>;
  markWorkItemCompleted(agentId: string, workItemId: string, confirmCompletion?: boolean): Promise<unknown>;
} {
  return (controller as unknown as {
    mcpCoordinator: {
      createAgent(agentId: string, input: { avatar?: string; backend?: 'codex' | 'claude'; branchName?: string; createWorktree?: boolean; destinationPath?: string; name?: string; repoPath: string }): Promise<unknown>;
      setStatus(agentId: string, status: string): string;
      sendMessage(from: string, to: string, content: string): unknown;
      checkMessages(agentId: string): unknown;
      displayMarkdown(agentId: string, input: { markdown?: string; path?: string; title?: string }): Promise<unknown>;
      markWorkItemCompleted(agentId: string, workItemId: string, confirmCompletion?: boolean): Promise<unknown>;
    };
  }).mcpCoordinator;
}

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
