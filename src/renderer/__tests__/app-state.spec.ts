import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useAppState } from '../app-state';
import { createEmptySnapshot, createInitialSnapshot } from '../../shared/snapshot';
import type { CodexClawApi, MainToRendererEvent } from '../../shared/contracts';

describe('useAppState', () => {
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

  it('ignores missing agent selections and local-selects when main selection is unavailable', async () => {
    vi.stubGlobal('window', {});
    const state = useAppState();
    state.snapshot.value = createInitialSnapshot();

    await state.selectAgent('agent-missing');
    expect(state.activeAgent.value?.id).toBe('agent-dina');

    await state.selectAgent('agent-dina');
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

  it('updates settings and forwards quit through the preload bridge', async () => {
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
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        updateSettings,
        quit,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    const updatePromise = state.updateSettings({ theme: { id: 'github-dark', mode: 'dark' } });

    expect(state.snapshot.value.theme.id).toBe('github-dark');
    expect(state.snapshot.value.theme.mode).toBe('dark');

    resolveUpdateSettings(updatedSnapshot);
    await updatePromise;
    await state.quit();

    expect(updateSettings).toHaveBeenCalledWith({ theme: { id: 'github-dark', mode: 'dark' } });
    expect(state.snapshot.value.theme.id).toBe('github-dark');
    expect(quit).toHaveBeenCalledOnce();
  });

  it('hydrates the active persisted thread after subscribing to main events', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].codexThreadId = 'thread-persisted';
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
    const selectAgent = vi.fn().mockResolvedValue(hydratedSnapshot);
    const onEvent = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        onEvent,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(onEvent).toHaveBeenCalledOnce();
    expect(selectAgent).toHaveBeenCalledWith('agent-dina');
    expect(state.visibleMessages.value).toStrictEqual(hydratedSnapshot.messages);
  });

  it('does not hydrate startup history for agents without a persisted thread', async () => {
    const remoteSnapshot = createInitialSnapshot();
    const selectAgent = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(selectAgent).not.toHaveBeenCalled();
    expect(state.activeAgent.value?.id).toBe('agent-dina');
  });

  it('does not hydrate startup history when no active agent is selected', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.activeAgentId = null;
    const selectAgent = vi.fn();
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        selectAgent,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(selectAgent).not.toHaveBeenCalled();
    expect(state.activeAgent.value).toBeNull();
  });

  it('loads persisted thread metadata without hydration when the preload bridge cannot select agents', async () => {
    const remoteSnapshot = createInitialSnapshot();
    remoteSnapshot.agents[0].codexThreadId = 'thread-persisted';
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();

    expect(state.activeAgent.value?.codexThreadId).toBe('thread-persisted');
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
    });

    await vi.waitFor(() => {
      expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'run this after the turn');
    });
    expect(state.activeQueuedPrompts.value).toStrictEqual([]);
    expect(state.visibleMessages.value.at(-1)?.id).toBe('message-drained');
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

    emitMainEvent({
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'streamed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
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
      activeTeamId: 'team-codex-claw',
      activeAgentId: 'agent-dina',
    };
    const updatedTeamSnapshot = {
      ...selectedTeamSnapshot,
      teams: selectedTeamSnapshot.teams.map((team) => team.id === 'team-codex-claw'
        ? { ...team, name: 'Core Team', avatar: 'CT', color: '#46A857' }
        : team),
    };
    const createdSnapshot = {
      ...updatedTeamSnapshot,
      agents: [
        ...updatedTeamSnapshot.agents,
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
    const closeTeam = vi.fn().mockResolvedValue(closedTeamSnapshot);
    const selectTeam = vi.fn().mockResolvedValue(selectedTeamSnapshot);
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
        closeTeam,
        selectTeam,
        createAgent,
        updateAgent,
        duplicateAgent,
        moveAgentToTeam,
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
    await state.selectTeam('team-codex-claw');
    await state.updateTeam({ id: 'team-codex-claw', name: 'Core Team', color: '#46A857' });
    await state.createAgent({ name: 'Jules', avatar: '🤖', folder: '/Users/nbonamy/src/jules' });
    await state.updateAgent({ id: 'agent-jules', name: 'Jules Prime', avatar: '🤖', folder: '/Users/nbonamy/src/jules' });
    await state.duplicateAgent('agent-jules');
    await state.moveAgentToTeam({ agentId: 'agent-jules', teamId: 'team-skwad-core' });
    await state.saveAgentToBench('agent-jules');
    await state.restartAgent('agent-jules');
    await state.deployBenchTemplate('bench-jules-prime');
    await state.removeBenchTemplate('bench-jules-prime');
    await state.closeAgent('agent-jules');
    await state.closeTeam('team-skwad-core');

    expect(createTeam).toHaveBeenCalledWith({ name: 'Skwad Core', color: '#46A857' });
    expect(selectTeam).toHaveBeenCalledWith('team-codex-claw');
    expect(updateTeam).toHaveBeenCalledWith({ id: 'team-codex-claw', name: 'Core Team', color: '#46A857' });
    expect(createAgent).toHaveBeenCalledWith({ name: 'Jules', avatar: '🤖', folder: '/Users/nbonamy/src/jules' });
    expect(updateAgent).toHaveBeenCalledWith({ id: 'agent-jules', name: 'Jules Prime', avatar: '🤖', folder: '/Users/nbonamy/src/jules' });
    expect(duplicateAgent).toHaveBeenCalledWith('agent-jules');
    expect(moveAgentToTeam).toHaveBeenCalledWith({ agentId: 'agent-jules', teamId: 'team-skwad-core' });
    expect(saveAgentToBench).toHaveBeenCalledWith('agent-jules');
    expect(restartAgent).toHaveBeenCalledWith('agent-jules');
    expect(deployBenchTemplate).toHaveBeenCalledWith('bench-jules-prime', 'team-skwad-core');
    expect(removeBenchTemplate).toHaveBeenCalledWith('bench-jules-prime');
    expect(closeAgent).toHaveBeenCalledWith('agent-jules');
    expect(closeTeam).toHaveBeenCalledWith('team-skwad-core');
    expect(state.snapshot.value).toStrictEqual(closedTeamSnapshot);
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
    await state.closeTeam('team-codex-claw');
    await state.selectTeam('team-codex-claw');
    await state.createAgent({ name: 'Ignored', folder: '/tmp/ignored' });
    await state.updateAgent({ id: 'agent-dina', name: 'Ignored', folder: '/tmp/ignored' });
    await state.duplicateAgent('agent-dina');
    await state.moveAgentToTeam({ agentId: 'agent-dina', teamId: 'team-codex-claw' });
    await state.saveAgentToBench('agent-dina');
    await state.deployBenchTemplate('missing-template');
    await state.removeBenchTemplate('missing-template');
    await state.restartAgent('agent-dina');
    await state.closeAgent('agent-dina');

    expect(state.snapshot.value).toBe(before);
  });

  it('loads Codex models, selects the default reasoning effort, and sends it with prompts', async () => {
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
    const listCodexModels = vi.fn().mockResolvedValue([
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
        listCodexModels,
        sendPrompt,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    await state.loadSnapshot();
    await state.loadCodexModels();

    expect(state.modelCatalogStatus.value).toBe('loaded');
    expect(state.selectedModelId.value).toBe('codex-max');
    expect(state.selectedReasoningEffort.value).toBe('high');

    state.selectModel('codex-fast');
    state.selectReasoningEffort('low');
    await state.sendPrompt('use the selected model');

    expect(sendPrompt).toHaveBeenCalledWith('agent-dina', 'use the selected model', {
      model: 'gpt-5.1-codex-fast',
      reasoningEffort: 'low',
    });
  });

  it('handles model catalog loading guards, errors, and invalid selections', async () => {
    const listCodexModels = vi.fn().mockRejectedValue(new Error('models unavailable'));
    vi.stubGlobal('window', {
      codexClaw: {
        listCodexModels,
      } satisfies Partial<CodexClawApi>,
    });

    const state = useAppState();
    state.modelCatalogStatus.value = 'loading';
    await state.loadCodexModels();

    expect(listCodexModels).not.toHaveBeenCalled();

    state.modelCatalogStatus.value = 'notLoaded';
    state.modelCatalogError.value = null;
    await state.loadCodexModels();

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
        listCodexModels: vi.fn().mockResolvedValue([
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

    await state.loadCodexModels();

    expect(state.selectedModelId.value).toBe('codex-existing');
    expect(state.selectedReasoningEffort.value).toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}
