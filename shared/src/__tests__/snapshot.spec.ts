import { describe, expect, it } from 'vitest';
import {
  appendUserPrompt,
  applyMainEventToSnapshot,
  createAgentInSnapshot,
  createInitialSnapshot,
  selectAgent,
  snapshotMetadata,
  updateAgentFromInput,
  updateAgentFolder,
} from '../snapshot';
import type { RendererMessage, RendererToolPart, RendererToolPartUpdate } from '../contracts';
import { toolOutputText } from '../tool-output';

describe('snapshot reducer', () => {
  it('updates the agent folder and clears the old thread mapping', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };
    snapshot.agents[0].contextUsage = {
      totalTokens: 397_740,
      inputTokens: 320_000,
      cachedInputTokens: 80_000,
      outputTokens: 72_000,
      reasoningOutputTokens: 24_000,
      lastTotalTokens: 64_600,
      modelContextWindow: 258_400,
      usedPercent: 25,
    };
    snapshot.agents[0].plan = {
      threadId: 'thread-old',
      turnId: 'turn-plan',
      explanation: 'Old plan',
      steps: [{ step: 'Do old work', status: 'pending' }],
      markdown: 'Old plan\n- [ ] Do old work',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    snapshot.agents[0].goal = {
      threadId: 'thread-old',
      objective: 'Old goal',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 100,
      timeUsedSeconds: 5,
      createdAt: 1,
      updatedAt: 2,
    };
    snapshot.agents[0].isRegistered = true;
    snapshot.agents[0].mcpSessionId = 'mcp-session';
    snapshot.agents[0].statusText = 'Registered';

    expect(updateAgentFolder(snapshot, 'agent-dina', '/Users/nbonamy/src/id8', '2026-06-05T00:00:01.000Z')).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
  });

  it('creates agents in the active team and selects the new agent', () => {
    const snapshot = createInitialSnapshot();

    createAgentInSnapshot(snapshot, {
      name: ' Jules ',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/id8',
    }, '2026-06-05T10:11:12.000Z', 'agent-new-jules');

    expect(snapshot.activeAgentId).toBe('agent-new-jules');
    expect(snapshot.teams[0].agentIds).toContain('agent-new-jules');
    expect(snapshot.teams[0].activeAgentId).toBe('agent-new-jules');
    expect(snapshot.agents.at(-1)).toStrictEqual({
      id: 'agent-new-jules',
      teamId: 'team-codex-claw',
      name: 'Jules',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
  });

  it('creates agents in a requested team from overview add actions', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams.push({
      id: 'team-skwad',
      name: 'Skwad',
      color: '#46A857',
      agentIds: [],
    });

    createAgentInSnapshot(snapshot, {
      name: 'Abby',
      folder: '/Users/nbonamy/src/skwad',
      teamId: 'team-skwad',
    }, '2026-06-05T10:11:12.000Z', 'agent-new-abby');

    expect(snapshot.activeTeamId).toBe('team-skwad');
    expect(snapshot.activeAgentId).toBe('agent-new-abby');
    expect(snapshot.teams[0].agentIds).not.toContain('agent-new-abby');
    expect(snapshot.teams[1].agentIds).toStrictEqual(['agent-new-abby']);
    expect(snapshot.teams[1].activeAgentId).toBe('agent-new-abby');
    expect(snapshot.agents.at(-1)).toMatchObject({
      id: 'agent-new-abby',
      teamId: 'team-skwad',
      name: 'Abby',
      folder: '/Users/nbonamy/src/skwad',
    });
  });

  it('creates agents without storing execution connection on the agent', () => {
    const snapshot = createInitialSnapshot();
    snapshot.teams[0].remoteConnectionId = 'connection-devbox';

    createAgentInSnapshot(snapshot, {
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    }, '2026-06-05T10:11:12.000Z', 'agent-remote-dina');

    expect(snapshot.agents.at(-1)).toMatchObject({
      id: 'agent-remote-dina',
      name: 'Remote Dina',
      folder: '/home/nicolas/src/codex-claw',
    });
    expect(snapshot.agents.at(-1)).not.toHaveProperty('remoteConnectionId');
  });

  it('defaults a blank created agent name from the folder basename', () => {
    const snapshot = createInitialSnapshot();

    createAgentInSnapshot(snapshot, {
      name: ' ',
      folder: '/tmp/codex-claw',
    }, '2026-06-05T10:11:12.000Z', 'agent-new-codex-claw');

    expect(snapshot.agents.at(-1)?.name).toBe('codex-claw');
    expect(snapshot.agents.at(-1)?.id).toBe('agent-new-codex-claw');
  });

  it('updates idle agents and clears Codex runtime state when the folder changes', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.backendSession = { kind: 'codex', threadId: 'thread-old' };
    agent.contextUsage = {
      totalTokens: 397_740,
      inputTokens: 320_000,
      cachedInputTokens: 80_000,
      outputTokens: 72_000,
      reasoningOutputTokens: 24_000,
      lastTotalTokens: 64_600,
      modelContextWindow: 258_400,
      usedPercent: 25,
    };
    agent.plan = {
      threadId: 'thread-old',
      turnId: 'turn-plan',
      explanation: 'Old plan',
      steps: [{ step: 'Do old work', status: 'pending' }],
      markdown: 'Old plan\n- [ ] Do old work',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    agent.goal = {
      threadId: 'thread-old',
      objective: 'Old goal',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 100,
      timeUsedSeconds: 5,
      createdAt: 1,
      updatedAt: 2,
    };
    agent.isRegistered = true;
    agent.mcpSessionId = 'mcp-session';
    agent.statusText = 'Registered and idle';

    expect(updateAgentFromInput(snapshot, {
      id: 'agent-dina',
      name: 'Dina Prime',
      avatar: 'DP',
      folder: '/Users/nbonamy/src/id8',
    }, '2026-06-05T10:11:12.000Z')).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina Prime',
      avatar: 'DP',
      folder: '/Users/nbonamy/src/id8',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
  });

  it('updates idle agents without clearing the thread when the folder is unchanged', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-existing' };

    updateAgentFromInput(snapshot, {
      id: 'agent-dina',
      name: 'Dina Prime',
      avatar: undefined,
      folder: '~/src/codex-claw',
    }, '2026-06-05T10:11:12.000Z');

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-existing' });
    expect(snapshot.agents[0].avatar).toBeUndefined();
  });

  it('defaults blank edited names from the folder basename', () => {
    const snapshot = createInitialSnapshot();

    updateAgentFromInput(snapshot, {
      id: 'agent-dina',
      name: ' ',
      folder: '~/src/codex-claw',
    }, '2026-06-05T10:11:12.000Z');

    expect(snapshot.agents[0].name).toBe('codex-claw');
  });

  it('returns null when updating a missing agent', () => {
    const snapshot = createInitialSnapshot();

    expect(updateAgentFromInput(snapshot, {
      id: 'agent-missing',
      name: 'Missing',
      folder: '/tmp/missing',
    })).toBeNull();
  });

  it('rejects edits for busy agents', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working', detail: 'Running tests' };

    expect(() => updateAgentFromInput(snapshot, {
      id: 'agent-dina',
      name: 'Dina Prime',
      folder: '~/src/codex-claw',
    })).toThrow('Agent must be idle before editing.');
  });

  it('selects the active agent on its team when switching agents', () => {
    const snapshot = createInitialSnapshot();

    selectAgent(snapshot, 'agent-jesse');

    expect(snapshot.activeAgentId).toBe('agent-jesse');
    expect(snapshot.activeTeamId).toBe('team-codex-claw');
    expect(snapshot.teams[0].activeAgentId).toBe('agent-jesse');
  });

  it('appends user prompts and reduces assistant deltas into one streaming message', () => {
    const snapshot = createInitialSnapshot();

    appendUserPrompt(snapshot, 'agent-dina', 'hello', '2026-06-05T00:00:01.000Z');
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-1',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      parts: [],
    });
    const messages = snapshot.messages;
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'hello' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    expect(snapshot.messages).toBe(messages);
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: ' back' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
    expect(snapshot.messages.at(-2)?.parts).toStrictEqual([{ type: 'text', text: 'hello' }]);
    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-1',
      agentId: 'agent-dina',
      role: 'assistant',
      status: 'streaming',
      parts: [{ type: 'text', text: 'hello back' }],
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });
    expect(snapshot.messages.at(-1)?.status).toBe('complete');
  });

  it('updates one message without replacing the progressively hydrated transcript', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages.push(
      {
        id: 'history-older', agentId: 'agent-dina', role: 'assistant', status: 'complete',
        createdAt: '2026-06-05T00:00:00.000Z', parts: [{ type: 'text', text: 'Older history' }],
      },
      {
        id: 'assistant-turn-1', agentId: 'agent-dina', role: 'assistant', status: 'streaming',
        turnId: 'turn-1', createdAt: '2026-06-05T00:00:01.000Z', parts: [{ type: 'text', text: 'Draft' }],
      },
    );
    const transcript = snapshot.messages;
    const olderMessage = snapshot.messages[0];

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.updated',
      payload: {
        message: {
          id: 'assistant-turn-1', agentId: 'agent-dina', role: 'assistant', status: 'streaming',
          turnId: 'turn-1', createdAt: '2026-06-05T00:00:01.000Z',
          parts: [{ type: 'text', text: 'Rewritten response' }],
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toBe(transcript);
    expect(snapshot.messages[0]).toBe(olderMessage);
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[1]).toMatchObject({
      id: 'assistant-turn-1',
      parts: [{ type: 'text', text: 'Rewritten response' }],
    });
  });

  it('retains every message when progressive batches split one turn', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages.push({
      id: 'current', agentId: 'agent-dina', role: 'assistant', status: 'complete',
      turnId: 'turn-current', createdAt: '2026-06-05T00:00:05.000Z',
      parts: [{ type: 'text', text: 'Current history' }],
    });
    const transcript = snapshot.messages;
    const historyMessage = (id: string, createdAt: string): RendererMessage => ({
      id, agentId: 'agent-dina', role: 'assistant', status: 'complete',
      turnId: 'turn-split', createdAt, parts: [{ type: 'text', text: id }],
    });

    for (const [seq, messages] of [
      [1, [historyMessage('split-3', '2026-06-05T00:00:03.000Z'), historyMessage('split-4', '2026-06-05T00:00:04.000Z')]],
      [2, [historyMessage('split-1', '2026-06-05T00:00:01.000Z'), historyMessage('split-2', '2026-06-05T00:00:02.000Z')]],
    ] as const) {
      applyMainEventToSnapshot(snapshot, {
        seq,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'thread.historyLoaded',
        payload: { messages, preserveKnownMessages: true, replace: false },
        occurredAt: '2026-06-05T00:00:06.000Z',
      });
    }

    expect(snapshot.messages).toBe(transcript);
    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'split-1', 'split-2', 'split-3', 'split-4', 'current',
    ]);
  });

  it('inserts steer prompts at the streaming point and resumes assistant output in a new segment', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-before', delta: 'I will inventory the Markdown files.' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.steer',
      payload: {
        prompt: 'read all the markdown files',
        attachments: [{ type: 'file', path: '/tmp/context.md', name: 'context.md' }],
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-after', delta: 'Reading them now.' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: expect.any(String),
        parts: [
          { type: 'text', text: 'I will inventory the Markdown files.', itemId: 'msg-before' },
        ],
      },
      {
        id: 'steer-turn-1-20260605t000003000z',
        agentId: 'agent-dina',
        kind: 'steer',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [
          { type: 'text', text: 'read all the markdown files' },
          {
            type: 'attachment',
            attachment: { kind: 'file', path: '/tmp/context.md', name: 'context.md' },
          },
        ],
      },
      {
        id: 'assistant-turn-1-segment-20260605t000003000z',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [
          { type: 'text', text: 'Reading them now.', itemId: 'msg-after' },
        ],
      },
    ]);

    applyMainEventToSnapshot(snapshot, {
      seq: 5,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages.filter((message) => message.role === 'assistant').map((message) => message.status)).toStrictEqual([
      'complete',
      'complete',
    ]);
  });

  it('records thread starts and backend runtime status updates', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.started',
      payload: { cwd: '/Users/nbonamy/src/codex-claw' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'backend.statusChanged',
      backend: 'codex',
      payload: {
        backend: 'codex',
        status: 'running',
        detail: 'connected',
        capabilities: {
          approvalPresets: ['ask-for-approval', 'not-a-preset'],
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-1' });
    expect(snapshot.backendRuntimes).toContainEqual({
      backend: 'codex',
      status: 'running',
      detail: 'connected',
      capabilities: {
        approvalPresets: ['ask-for-approval'],
      },
    });
  });

  it('records Claude session starts without requiring a Codex thread id', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backend = 'claude';
    snapshot.agents[0].backendDefaults = { kind: 'claude' };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'claude',
      backendSessionId: 'claude-session-1',
      type: 'thread.started',
      payload: { sessionId: 'claude-session-1', transport: 'stdio' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'claude', sessionId: 'claude-session-1', transport: 'stdio' });
  });

  it('records thread settings updates as durable agent thread mappings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].backendSession = { kind: 'codex', threadId: 'thread-old' };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.settingsUpdated',
      payload: {
        threadSettings: {
          cwd: '/Users/nbonamy/src/codex-claw',
          model: 'gpt-5.5',
          reasoningEffort: 'high',
          serviceTier: 'fast',
          approvalPolicy: 'on-request',
          approvalsReviewer: 'auto_review',
          sandboxPolicy: {
            type: 'workspaceWrite',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].backendSession).toStrictEqual({ kind: 'codex', threadId: 'thread-1' });
    expect(snapshot.agents[0].backendDefaults).toStrictEqual({
      kind: 'codex',
      model: 'gpt-5.5',
      approvalPreset: 'approve-for-me',
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      sandboxMode: 'workspace-write',
      reasoningEffort: 'high',
      serviceTier: 'fast',
    });
  });

  it('records thread goal updates and clears them from agent metadata', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.goalUpdated',
      payload: {
        goal: {
          threadId: 'thread-1',
          objective: 'Ship the goal shelf',
          status: 'active',
          tokenBudget: null,
          tokensUsed: 1200,
          timeUsedSeconds: 30,
          createdAt: 1_780_000_000,
          updatedAt: 1_780_000_030,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].goal).toStrictEqual({
      threadId: 'thread-1',
      objective: 'Ship the goal shelf',
      status: 'active',
      tokenBudget: null,
      tokensUsed: 1200,
      timeUsedSeconds: 30,
      createdAt: 1_780_000_000,
      updatedAt: 1_780_000_030,
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.goalCleared',
      payload: {},
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].goal).toBeUndefined();
  });

  it('records token usage updates as transient agent context usage', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'thread.tokenUsageUpdated',
      payload: {
        contextUsage: {
          totalTokens: 50_000,
          inputTokens: 40_000,
          cachedInputTokens: 10_000,
          outputTokens: 8_000,
          reasoningOutputTokens: 2_000,
          lastTotalTokens: 3_000,
          modelContextWindow: 200_000,
          usedPercent: 25,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].contextUsage).toStrictEqual({
      totalTokens: 50_000,
      inputTokens: 40_000,
      cachedInputTokens: 10_000,
      outputTokens: 8_000,
      reasoningOutputTokens: 2_000,
      lastTotalTokens: 3_000,
      modelContextWindow: 200_000,
      usedPercent: 25,
    });
  });

  it('records account rate-limit updates as global app state', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'account.rateLimitsUpdated',
      payload: {
        rateLimits: {
          limitId: 'codex',
          limitName: 'Codex',
          primary: {
            usedPercent: 25,
            windowDurationMins: 15,
            resetsAt: 1_780_000_000,
          },
          secondary: null,
          credits: {
            hasCredits: true,
            unlimited: false,
            balance: '10.00',
          },
          individualLimit: null,
          planType: 'pro',
          rateLimitReachedType: null,
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.accountRateLimits).toStrictEqual({
      limitId: 'codex',
      limitName: 'Codex',
      primary: {
        usedPercent: 25,
        windowDurationMins: 15,
        resetsAt: 1_780_000_000,
      },
      secondary: null,
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: '10.00',
      },
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    });
  });

  it('hydrates resumed thread history before current local prompts', () => {
    const snapshot = createInitialSnapshot();

    appendUserPrompt(snapshot, 'agent-dina', 'continue please', '2026-06-05T00:00:03.000Z');
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        messages: [
          {
            id: 'user-thread-1-turn-old-user-old',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [
              { type: 'text', text: 'older prompt' },
              {
                type: 'attachment',
                attachment: {
                  kind: 'image',
                  name: 'screenshot.png',
                  path: '/tmp/screenshot.png',
                  url: 'file:///tmp/screenshot.png',
                  mimeType: 'image/png',
                },
              },
              {
                type: 'attachment',
                attachment: {
                  kind: 'file', name: 'report.txt', path: '/tmp/report.txt', mimeType: 'text/plain',
                },
              },
            ],
          },
          {
            id: 'assistant-turn-old',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [
              { type: 'text', text: 'older answer' },
              {
                type: 'media',
                itemId: 'generated-image',
                media: {
                  url: 'file:///tmp/generated-image.png',
                  alt: 'Generated image',
                  mimeType: 'image/png',
                  prompt: 'Draw a route map',
                  title: 'Generated image',
                },
              },
            ],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'user-thread-1-turn-old-user-old',
      'assistant-turn-old',
      'message-20260605t000003000z',
    ]);
    expect(snapshot.messages[0]?.parts).toStrictEqual([
      { type: 'text', text: 'older prompt' },
      {
        type: 'attachment',
        attachment: {
          kind: 'image',
          name: 'screenshot.png',
          path: '/tmp/screenshot.png',
          url: 'file:///tmp/screenshot.png',
          mimeType: 'image/png',
        },
      },
      {
        type: 'attachment',
        attachment: { kind: 'file', name: 'report.txt', path: '/tmp/report.txt', mimeType: 'text/plain' },
      },
    ]);
    expect(snapshot.messages[1]?.parts).toStrictEqual([
      { type: 'text', text: 'older answer' },
      {
        type: 'media',
        itemId: 'generated-image',
        media: {
          url: 'file:///tmp/generated-image.png',
          alt: 'Generated image',
          mimeType: 'image/png',
          prompt: 'Draw a route map',
          title: 'Generated image',
        },
      },
    ]);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        messages: [
          {
            id: 'user-thread-1-turn-old-user-old',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'older prompt' }],
          },
          {
            id: 'assistant-turn-old',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text', text: 'older answer refreshed' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages).toHaveLength(3);
    expect(snapshot.messages[0].id).toBe('user-thread-1-turn-old-user-old');
    expect(snapshot.messages[1].parts).toStrictEqual([{ type: 'text', text: 'older answer refreshed' }]);
    expect(snapshot.messages[2].id).toBe('message-20260605t000003000z');
  });

  it('replaces an agent transcript when rollback history is loaded', () => {
    const snapshot = createInitialSnapshot();
    snapshot.messages = [
      {
        id: 'user-turn-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [{ type: 'text', text: 'keep this prompt' }],
      },
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [{ type: 'text', text: 'keep this answer' }],
      },
      {
        id: 'assistant-turn-2',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-2',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [{ type: 'text', text: 'remove this answer' }],
      },
    ];

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        replace: true,
        messages: [
          {
            id: 'user-turn-1',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            turnId: 'turn-1',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'keep this prompt' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual(['user-turn-1']);
  });

  it('adds unknown hydrated turns without replacing known tool calls or steering', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-live',
      type: 'item.completed',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-live',
        title: 'npm test',
        status: 'completed',
        body: 'tests passed',
        cwd: '/workspace',
        commandActions: [],
        exitCode: 0,
        durationMs: 20,
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-live',
      type: 'message.steer',
      payload: { prompt: 'Keep going with the focused test.' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    const messages = snapshot.messages;

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        replace: false,
        preserveKnownTurns: true,
        messages: [
          {
            id: 'assistant-turn-old',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            turnId: 'turn-old',
            createdAt: '2026-06-05T00:00:01.000Z',
            parts: [{ type: 'text', text: 'Older history.' }],
          },
          {
            id: 'assistant-turn-live',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            turnId: 'turn-live',
            createdAt: '2026-06-05T00:00:03.000Z',
            parts: [{ type: 'text', text: 'Incomplete app-server history.' }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages).toBe(messages);
    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'assistant-turn-old',
      'assistant-turn-live',
      'steer-turn-live-20260605t000004000z',
      'assistant-turn-live-segment-20260605t000004000z',
    ]);
    expect(snapshot.messages[1]).toMatchObject({
      id: 'assistant-turn-live',
      parts: [expect.objectContaining({ type: 'tool', id: 'cmd-live', body: 'tests passed' })],
    });
    expect(snapshot.messages[2]).toMatchObject({
      kind: 'steer',
      parts: [{ type: 'text', text: 'Keep going with the focused test.' }],
    });
  });

  it('ignores malformed resumed history payloads', () => {
    const snapshot = createInitialSnapshot();
    appendUserPrompt(snapshot, 'agent-dina', 'keep me', '2026-06-05T00:00:03.000Z');

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.historyLoaded',
      payload: {
        messages: [
          {
            id: 'wrong-agent-message',
            agentId: 'agent-jesse',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text', text: 'wrong agent' }],
          },
          {
            id: 'bad-role-message',
            agentId: 'agent-dina',
            role: 'bot',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text', text: 'bad role' }],
          },
          {
            id: 'bad-part-message',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text' }],
          },
          {
            id: 'bad-attachment-message',
            agentId: 'agent-dina',
            role: 'user',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'attachment', attachment: { kind: 'image', name: 42 } }],
          },
          {
            id: 'bad-media-message',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'media', media: { url: 42 } }],
          },
        ],
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'message-20260605t000003000z',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [{ type: 'text', text: 'keep me' }],
      },
    ]);
  });

  it('updates metadata without replacing cached conversation transcripts', () => {
    const snapshot = createInitialSnapshot();
    const messages = snapshot.messages;
    const nextSnapshot = createInitialSnapshot();
    nextSnapshot.loops = [{
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
          mode: 'dedicated',
        },
      },
      instructions: {},
      executionLog: [],
      createdAt: '2026-06-09T10:00:00.000Z',
      updatedAt: '2026-06-09T10:00:00.000Z',
    }];

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'snapshot.updated',
      payload: snapshotMetadata(nextSnapshot),
      occurredAt: '2026-06-09T10:00:00.000Z',
    });

    expect(snapshot.loops).toStrictEqual(nextSnapshot.loops);
    expect(snapshot.messages).toBe(messages);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'snapshot.updated',
      payload: nextSnapshot,
      occurredAt: '2026-06-09T10:00:01.000Z',
    });

    expect(snapshot.messages).toBe(messages);
  });

  it('merges agent updates from main-process collaboration tools', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.updated',
      payload: {
        id: 'agent-dina',
        statusText: 'Reviewing MCP shape',
        isRegistered: true,
        mcpSessionId: 'mcp-session-1',
        updatedAt: '2026-06-05T00:00:02.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0]).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '~/src/codex-claw',
      backend: 'codex',
      backendDefaults: { kind: 'codex' },
      isRegistered: true,
      mcpSessionId: 'mcp-session-1',
      statusText: 'Reviewing MCP shape',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:02.000Z',
    });
  });

  it('removes an agent status text when collaboration explicitly clears it', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0]!.statusText = 'Reviewing MCP shape';

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.updated',
      payload: {
        id: 'agent-dina',
        statusText: null,
        updatedAt: '2026-06-05T00:00:02.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0]!.statusText).toBeUndefined();
  });

  it('applies work backlog assignment updates from MCP tools', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'workBacklog.assignmentUpdated',
      payload: {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        status: 'completed',
        completedAt: '2026-06-09T13:30:00.000Z',
      },
      occurredAt: '2026-06-09T13:30:00.000Z',
    });

    expect(snapshot.workBacklog.assignments).toStrictEqual({
      'github:nbonamy/codex-claw#12': {
        provider: 'github',
        itemId: 'nbonamy/codex-claw#12',
        agentId: 'agent-dina',
        assignedAt: '2026-06-09T13:00:00.000Z',
        status: 'completed',
        completedAt: '2026-06-09T13:30:00.000Z',
      },
    });
  });

  it('keeps agent selection and streamed chats isolated per agent', () => {
    const snapshot = createInitialSnapshot();

    selectAgent(snapshot, 'agent-jesse');
    appendUserPrompt(snapshot, 'agent-dina', 'Dina prompt', '2026-06-05T00:00:01.000Z');
    appendUserPrompt(snapshot, 'agent-jesse', 'Jesse prompt', '2026-06-05T00:00:02.000Z');
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-dina',
      turnId: 'turn-dina',
      type: 'message.delta',
      payload: { delta: 'Dina answer' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-jesse',
      threadId: 'thread-jesse',
      turnId: 'turn-jesse',
      type: 'message.delta',
      payload: { delta: 'Jesse answer' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.activeAgentId).toBe('agent-jesse');
    expect(snapshot.messages.filter((message) => message.agentId === 'agent-dina').map((message) => message.parts)).toStrictEqual([
      [{ type: 'text', text: 'Dina prompt' }],
      [{ type: 'text', text: 'Dina answer' }],
    ]);
    expect(snapshot.messages.filter((message) => message.agentId === 'agent-jesse').map((message) => message.parts)).toStrictEqual([
      [{ type: 'text', text: 'Jesse prompt' }],
      [{ type: 'text', text: 'Jesse answer' }],
    ]);
  });

  it('reduces app-owned tool items into assistant tool parts', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-1',
        title: 'npm test',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
        commandActions: [],
        exitCode: undefined,
        durationMs: undefined,
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-1', 'running vitest\n'),
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-1',
        title: 'npm test',
        status: 'completed',
        body: '1 test passed',
        cwd: '/Users/nbonamy/src/codex-claw',
        commandActions: [],
        exitCode: 0,
        durationMs: 123,
      })),
      occurredAt: '2026-06-05T00:00:05.000Z',
    });

    expect(snapshot.messages.at(-1)).toMatchObject({
      id: 'assistant-turn-1',
      parts: [
        {
          type: 'tool',
          id: 'cmd-1',
          kind: 'command',
          title: 'npm test',
          status: 'completed',
          body: '1 test passed',
          input: {
            command: 'npm test',
            cwd: '/Users/nbonamy/src/codex-claw',
            commandActions: [],
          },
          output: {
            exitCode: 0,
            durationMs: 123,
          },
        },
      ],
    });
  });

  it('clears tool status text when an update explicitly sends null', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(dynamicToolPart({
        id: 'tool-1',
        title: 'Bash',
        status: 'running',
        statusText: 'Preparing tool input...',
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'tool-1',
        statusText: null,
        input: { command: 'npm test' },
      },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    const part = snapshot.messages.at(-1)?.parts[0];
    expect(part).toMatchObject({
      type: 'tool',
      id: 'tool-1',
      kind: 'dynamic',
      title: 'Bash',
      status: 'running',
      input: { command: 'npm test' },
    });
    expect(part && 'statusText' in part).toBe(false);
  });

  it('preserves assistant stream order across tool calls', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-commentary', delta: 'I will read it now.' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-read',
        title: 'cat docs/architecture.md',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
      })),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { itemId: 'msg-final', delta: 'Read docs/architecture.md.' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      { type: 'text', text: 'I will read it now.', itemId: 'msg-commentary' },
      {
        type: 'tool',
        id: 'cmd-read',
        kind: 'command',
        title: 'cat docs/architecture.md',
        status: 'running',
        body: undefined,
        input: {
          command: 'cat docs/architecture.md',
          cwd: '/Users/nbonamy/src/codex-claw',
          commandActions: undefined,
        },
        output: {
          exitCode: undefined,
          durationMs: undefined,
        },
        metadata: {
          source: undefined,
          processId: undefined,
        },
      },
      { type: 'text', text: 'Read docs/architecture.md.', itemId: 'msg-final' },
    ]);
  });

  it('keeps tool updates attached to the segment where the tool originally appeared after steering', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-read',
        title: 'cat docs/architecture.md',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.steer',
      payload: { prompt: 'also read testing.md' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-read', 'architecture contents'),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages[0].parts.at(0)).toMatchObject({
      type: 'tool',
      id: 'cmd-read',
      body: 'architecture contents',
    });
    expect(snapshot.messages[2]).toMatchObject({
      id: 'assistant-turn-1-segment-20260605t000002000z',
      parts: [],
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:04.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual([
      'assistant-turn-1',
      'steer-turn-1-20260605t000002000z',
    ]);
  });

  it('inserts running compaction markers without showing empty assistant thinking after the boundary', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'Before compaction.' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'context.compactionStarted',
      payload: { itemId: 'compact-1' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'After compaction.' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: expect.any(String),
        parts: [{ type: 'text', text: 'Before compaction.' }],
      },
      {
        id: 'compaction-turn-1',
        agentId: 'agent-dina',
        kind: 'compaction',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [],
      },
      {
        id: 'assistant-turn-1-segment-20260605t000002000z',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [{ type: 'text', text: 'After compaction.' }],
      },
    ]);
  });

  it('marks compaction markers complete when the turn completes', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'context.compactionStarted',
      payload: { itemId: 'compact-1' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'compaction-turn-1',
        agentId: 'agent-dina',
        kind: 'compaction',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-06-05T00:00:01.000Z',
        parts: [],
      },
    ]);
  });

  it('marks only the matching compaction complete when completion arrives before turn completion', () => {
    const snapshot = createInitialSnapshot();
    for (const [seq, turnId] of [[1, 'turn-1'], [2, 'turn-2']] as const) {
      applyMainEventToSnapshot(snapshot, {
        seq,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId,
        type: 'context.compactionStarted',
        payload: { itemId: `compact-${turnId}` },
        occurredAt: `2026-06-05T00:00:0${seq}.000Z`,
      });
    }

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-2',
      type: 'context.compactionCompleted',
      payload: { itemId: 'compact-turn-2' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.filter((message) => message.kind === 'compaction').map((message) => ({
      turnId: message.turnId,
      status: message.status,
    }))).toStrictEqual([
      { turnId: 'turn-1', status: 'streaming' },
      { turnId: 'turn-2', status: 'complete' },
    ]);
  });

  it('keeps queued prompts in the authoritative snapshot until confirmed dequeue', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'run next', options: { planMode: true } },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'run next' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'prompt-1',
      agentId: 'agent-dina',
      text: 'run next',
      createdAt: '2026-06-05T00:00:01.000Z',
      options: { planMode: true },
    }]);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'agent.promptDequeued',
      payload: { ids: ['prompt-1'] },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    expect(snapshot.queuedPrompts).toStrictEqual([]);
  });

  it('keeps queued prompts in snapshot state and scopes dequeue to the owning agent', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1, agentId: 'agent-dina', type: 'agent.promptQueued',
      payload: { id: 'shared-id', text: 'Dina next' }, occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2, agentId: 'agent-jesse', type: 'agent.promptQueued',
      payload: { id: 'shared-id', text: 'Jesse next' }, occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3, agentId: 'agent-dina', type: 'agent.promptDequeued',
      payload: { ids: ['shared-id'] }, occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'shared-id', agentId: 'agent-jesse', text: 'Jesse next', createdAt: '2026-06-05T00:00:02.000Z',
    }]);
  });

  it('records queue retry failures without removing or reordering the prompt', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'retry me' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'agent.promptRetryScheduled',
      payload: {
        id: 'prompt-1',
        attempts: 2,
        lastError: 'transport disconnected',
        retryAt: '2026-06-05T00:00:03.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'prompt-1',
      agentId: 'agent-dina',
      text: 'retry me',
      createdAt: '2026-06-05T00:00:01.000Z',
      attempts: 2,
      lastError: 'transport disconnected',
      retryAt: '2026-06-05T00:00:03.000Z',
      submitted: true,
    }]);
  });

  it('keeps backend approvals in canonical snapshot state until resolution', () => {
    const snapshot = createInitialSnapshot();
    const approval = {
      id: 'approval-1',
      kind: 'command' as const,
      conversationId: 'thread-dina',
      itemId: 'command-1',
      title: 'Run tests',
      command: 'npm test',
    };
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'backendApproval.requested',
      payload: { approval },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([approval]);
    expect(snapshot.agents[0]?.status).toStrictEqual({ type: 'awaitingInput', detail: 'Run tests' });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'backendApproval.resolved',
      payload: { approval, decision: 'allow' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([]);
  });

  it('adds a submitted user message once when the authoritative snapshot already contains it', () => {
    const snapshot = createInitialSnapshot();
    const message = appendUserPrompt(snapshot, 'agent-dina', 'run next', '2026-06-05T00:00:03.000Z');
    const event = {
      seq: 1,
      agentId: 'agent-dina',
      type: 'message.userSubmitted' as const,
      payload: { message },
      occurredAt: message.createdAt,
    };

    applyMainEventToSnapshot(snapshot, event);
    expect(snapshot.messages).toStrictEqual([message]);

    const replica = createInitialSnapshot();
    applyMainEventToSnapshot(replica, event);
    expect(replica.messages).toStrictEqual([message]);
  });

  it('removes empty assistant placeholders when turns complete without visible output', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toStrictEqual([]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });
  });

  it('removes superseded empty assistant placeholders when later assistant output appears', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-empty',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.map((message) => message.id)).toStrictEqual(['assistant-turn-empty']);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'message.delta',
      payload: { itemId: 'review-result', delta: 'Found one issue.' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-review',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
        turnId: 'turn-review',
        createdAt: expect.any(String),
        parts: [{ type: 'text', text: 'Found one issue.', itemId: 'review-result' }],
      },
    ]);
  });

  it('does not resurrect completed review text as streaming when late text arrives', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'message.delta',
      payload: {
        itemId: 'review-1',
        delta: 'Found one issue.',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'turn.completed',
      payload: { status: 'completed' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-review',
      type: 'message.delta',
      payload: {
        itemId: 'review-assistant',
        delta: 'Late assistant copy.',
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages).toStrictEqual([
      {
        id: 'assistant-turn-review',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-review',
        createdAt: expect.any(String),
        parts: [
          { type: 'text', text: 'Found one issue.', itemId: 'review-1' },
          { type: 'text', text: 'Late assistant copy.', itemId: 'review-assistant' },
        ],
      },
    ]);
  });

  it('keeps separate assistant message items as separate text parts', () => {
    const snapshot = createInitialSnapshot();

    for (const event of [
      {
        seq: 1,
        itemId: 'msg-1',
        delta: 'First assistant item.',
      },
      {
        seq: 2,
        itemId: 'msg-1',
        delta: ' More.',
      },
      {
        seq: 3,
        itemId: 'msg-2',
        delta: 'Second assistant item.',
      },
    ]) {
      applyMainEventToSnapshot(snapshot, {
        seq: event.seq,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'message.delta',
        payload: {
          itemId: event.itemId,
          delta: event.delta,
        },
        occurredAt: '2026-06-05T00:00:01.000Z',
      });
    }

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      { type: 'text', text: 'First assistant item. More.', itemId: 'msg-1' },
      { type: 'text', text: 'Second assistant item.', itemId: 'msg-2' },
    ]);
  });

  it('keeps tool output visible when Codex sends updates without a started item', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-missed-start', 'reading docs/architecture.md\n'),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: mcpProgressToToolPartUpdate('mcp-missed-start', 'opening file'),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: rawOutputToToolPartUpdate('raw-output-only', 'architecture contents', 'read_file'),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'cmd-missed-start',
        kind: 'command',
        title: 'Command',
        status: 'running',
        body: 'reading docs/architecture.md\n',
      },
      {
        type: 'tool',
        id: 'mcp-missed-start',
        kind: 'mcp',
        title: 'MCP tool',
        status: 'running',
        body: 'opening file',
      },
      {
        type: 'tool',
        id: 'raw-output-only',
        kind: 'generic',
        title: 'read_file',
        status: 'completed',
        body: 'architecture contents',
        output: 'architecture contents',
      },
    ]);
  });

  it('does not erase streamed command output when completion lacks aggregate output', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-streamed',
        title: 'cat docs/architecture.md',
        status: 'running',
        cwd: '/Users/nbonamy/src/codex-claw',
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: commandOutputDeltaToToolPartUpdate('cmd-streamed', 'streamed output'),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-streamed',
        title: 'cat docs/architecture.md',
        status: 'completed',
        cwd: '/Users/nbonamy/src/codex-claw',
        exitCode: 0,
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts.at(-1)).toMatchObject({
      type: 'tool',
      id: 'cmd-streamed',
      title: 'cat docs/architecture.md',
      status: 'completed',
      body: 'streamed output',
      output: {
        exitCode: 0,
      },
    });
  });

  it('updates raw response tool output without erasing the original tool title', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(dynamicToolPart({
        id: 'raw-call-1',
        title: 'read_file',
        status: 'running',
        input: { path: 'docs/architecture.md' },
        metadata: {
          namespace: null,
          tool: 'read_file',
          success: null,
          durationMs: undefined,
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: rawOutputToToolPartUpdate('raw-call-1', [{ type: 'input_text', text: 'architecture contents' }]),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'raw-call-1',
        kind: 'dynamic',
        title: 'read_file',
        status: 'completed',
        body: 'architecture contents',
        input: { path: 'docs/architecture.md' },
        output: [{ type: 'input_text', text: 'architecture contents' }],
        metadata: {
          namespace: null,
          tool: 'read_file',
          success: null,
          durationMs: undefined,
        },
      },
    ]);
  });

  it('normalizes raw response output shapes and ignores unsupported orphan updates', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: {
        itemId: 'unknown-update',
        kind: 'unknown',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages).toHaveLength(0);

    const rawOutputPayloads: Array<{
      itemId: string;
      output: unknown;
      status: RendererToolPartUpdate['status'];
    }> = [
      {
        itemId: 'undefined-output',
        output: undefined,
        status: 'completed',
      },
      {
        itemId: 'number-output',
        output: 42,
        status: 'completed',
      },
      {
        itemId: 'content-string',
        output: { content: 'plain content' },
        status: 'completed',
      },
      {
        itemId: 'content-array',
        output: { content: [{ text: 'nested content' }] },
        status: 'completed',
      },
      {
        itemId: 'json-object',
        output: { other: 'value' },
        status: 'completed',
      },
    ];

    for (const [index, payload] of rawOutputPayloads.entries()) {
      applyMainEventToSnapshot(snapshot, {
        seq: index + 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'item.updated',
        payload: rawOutputToToolPartUpdate(payload.itemId, payload.output, undefined, payload.status),
        occurredAt: '2026-06-05T00:00:02.000Z',
      });
    }

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'undefined-output',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: undefined,
        output: undefined,
      },
      {
        type: 'tool',
        id: 'number-output',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: '42',
        output: 42,
      },
      {
        type: 'tool',
        id: 'content-string',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: 'plain content',
        output: { content: 'plain content' },
      },
      {
        type: 'tool',
        id: 'content-array',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: 'nested content',
        output: { content: [{ text: 'nested content' }] },
      },
      {
        type: 'tool',
        id: 'json-object',
        kind: 'generic',
        title: 'Tool output',
        status: 'completed',
        body: '{"other":"value"}',
        output: { other: 'value' },
      },
    ]);
  });

  it('maps MCP, dynamic, and file-change items without text tags', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'mcp-1',
        title: 'browser.open',
        status: 'running',
        input: { url: 'http://localhost:5173' },
        output: null,
        metadata: {
          server: 'browser',
          tool: 'open',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
          durationMs: undefined,
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(dynamicToolPart({
        id: 'dynamic-1',
        title: 'image.generate',
        status: 'completed',
        body: 'done',
        input: { prompt: 'ship' },
        output: [{ type: 'inputText', text: 'done' }],
        metadata: {
          namespace: 'image',
          tool: 'generate',
          success: true,
          durationMs: undefined,
        },
      })),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(fileChangeToolPart('patch-1', [{ kind: 'update', path: 'src/app.ts' }], 'completed')),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'mcp-1',
        kind: 'mcp',
        title: 'browser.open',
        status: 'running',
        body: undefined,
        input: { url: 'http://localhost:5173' },
        output: null,
        metadata: {
          server: 'browser',
          tool: 'open',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
          durationMs: undefined,
        },
      },
      {
        type: 'tool',
        id: 'dynamic-1',
        kind: 'dynamic',
        title: 'image.generate',
        status: 'completed',
        body: 'done',
        input: { prompt: 'ship' },
        output: [{ type: 'inputText', text: 'done' }],
        metadata: {
          namespace: 'image',
          tool: 'generate',
          success: true,
          durationMs: undefined,
        },
      },
      {
        type: 'tool',
        id: 'patch-1',
        kind: 'fileChange',
        title: '1 file change',
        status: 'completed',
        body: 'update src/app.ts',
        input: { changes: [{ kind: 'update', path: 'src/app.ts' }] },
        metadata: {
          changes: [{ kind: 'update', path: 'src/app.ts' }],
        },
      },
    ]);
  });

  it('applies turn diff stats to the running file-change tool', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'turn.started',
      payload: { status: 'running' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(fileChangeToolPart('patch-1', [{ kind: 'update', path: 'src/app.ts' }], 'running')),
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'diff.updated',
      payload: {
        addedLines: 4,
        diff: '--- a/src/app.ts\n+++ b/src/app.ts',
        removedLines: 2,
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    const fileChange = snapshot.messages.at(-1)?.parts.find((part): part is RendererToolPart => {
      return part.type === 'tool' && part.kind === 'fileChange';
    });
    expect(fileChange?.statusText ? JSON.parse(fileChange.statusText) : null).toStrictEqual({
      action: 'edit',
      phase: 'running',
      params: {
        addedLines: 4,
        removedLines: 2,
        target: '1 file change',
      },
      source: 'codex',
    });
    expect(snapshot.turnGitDiffs['turn-1']).toStrictEqual({
      turnId: 'turn-1',
      addedLines: 4,
      removedLines: 2,
      diff: '--- a/src/app.ts\n+++ b/src/app.ts',
      updatedAt: '2026-06-05T00:00:03.000Z',
    });
  });

  it('stores runtime git status for an agent', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'git.statusUpdated',
      payload: {
        folder: '/Users/nbonamy/src/codex-claw',
        branch: 'main',
        ahead: 1,
        behind: 0,
        changedFiles: 3,
        addedLines: 12,
        removedLines: 4,
        hasUntracked: true,
        state: 'dirty',
        updatedAt: '2026-06-05T00:00:03.000Z',
      },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agentGitStatuses['agent-dina']).toStrictEqual({
      folder: '/Users/nbonamy/src/codex-claw',
      branch: 'main',
      ahead: 1,
      behind: 0,
      changedFiles: 3,
      addedLines: 12,
      removedLines: 4,
      hasUntracked: true,
      state: 'dirty',
      updatedAt: '2026-06-05T00:00:03.000Z',
    });
  });

  it('uses MCP structuredContent instead of the model-facing placeholder text', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.completed',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-set-status',
        title: 'codex_claw.set-status',
        status: 'completed',
        body: '{"agentId":"agent-dina","status":"Registered and idle"}',
        input: {
          agentId: 'agent-dina',
          status: 'Registered and idle',
        },
        output: {
          content: [{ type: 'text', text: 'Result returned in structuredContent.' }],
          structuredContent: {
            agentId: 'agent-dina',
            status: 'Registered and idle',
          },
          isError: false,
        },
        metadata: {
          server: 'codex_claw',
          tool: 'set-status',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
          durationMs: undefined,
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'call-set-status',
        kind: 'mcp',
        title: 'codex_claw.set-status',
        status: 'completed',
        body: '{"agentId":"agent-dina","status":"Registered and idle"}',
        input: {
          agentId: 'agent-dina',
          status: 'Registered and idle',
        },
        output: {
          content: [{ type: 'text', text: 'Result returned in structuredContent.' }],
          structuredContent: {
            agentId: 'agent-dina',
            status: 'Registered and idle',
          },
          isError: false,
        },
        metadata: {
          server: 'codex_claw',
          tool: 'set-status',
          pluginId: undefined,
          mcpAppResourceUri: undefined,
          durationMs: undefined,
        },
      },
    ]);
  });

  it('handles tool item fallbacks, progress updates, and malformed payloads', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: { toolPart: { type: 'ignored' } },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: { itemId: 123 },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(commandToolPart({
        id: 'cmd-defaults',
        title: 'command',
        status: 'failed',
      })),
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 4,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'mcp-error',
        title: 'mcp.tool',
        status: 'failed',
        body: 'tool failed',
        input: null,
        output: {
          content: [{ type: 'image', url: 'file.png' }, 'bad-shape'],
        },
      })),
      occurredAt: '2026-06-05T00:00:04.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 5,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(dynamicToolPart({
        id: 'dynamic-defaults',
        title: 'tool',
        status: 'failed',
        body: '{"type":"inputImage","imageUrl":"file.png"}',
        input: null,
      })),
      occurredAt: '2026-06-05T00:00:05.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 6,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(fileChangeToolPart('patch-empty', ['unexpected'], 'completed')),
      occurredAt: '2026-06-05T00:00:06.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 7,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: mcpProgressToToolPartUpdate('mcp-error', 'still failing'),
      occurredAt: '2026-06-05T00:00:07.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 8,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.updated',
      payload: fileChangePatchToToolPartUpdate('patch-empty', [{ path: 'src/next.ts' }, 'raw change']),
      occurredAt: '2026-06-05T00:00:08.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toMatchObject([
      {
        type: 'tool',
        id: 'cmd-defaults',
        kind: 'command',
        title: 'command',
        status: 'failed',
      },
      {
        type: 'tool',
        id: 'mcp-error',
        kind: 'mcp',
        title: 'mcp.tool',
        status: 'failed',
        body: 'tool failed\nstill failing',
      },
      {
        type: 'tool',
        id: 'dynamic-defaults',
        kind: 'dynamic',
        title: 'tool',
        status: 'failed',
        body: '{"type":"inputImage","imageUrl":"file.png"}',
      },
      {
        type: 'tool',
        id: 'patch-empty',
        kind: 'fileChange',
        body: 'update src/next.ts\n"raw change"',
      },
    ]);
  });

  it('attaches approval requests to the matching running MCP tool part', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-register-agent',
        title: 'codex_claw.register-agent',
        status: 'running',
        input: { agentId: 'agent-dina' },
        metadata: {
          server: 'codex_claw',
          tool: 'register-agent',
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-1',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            allowAlways: true,
            allowConversation: true,
            argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to run register-agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    const tool = snapshot.messages.at(-1)?.parts[0];
    expect(tool).toMatchObject({
      type: 'tool',
      id: 'call-register-agent',
      kind: 'mcp',
      title: 'codex_claw.register-agent',
      status: 'running',
      input: { agentId: 'agent-dina' },
      metadata: {
        confirmationRequestId: 'approval-1',
        server: 'codex_claw',
        tool: 'register-agent',
      },
    });
    expect(tool?.type === 'tool' ? JSON.parse(tool.statusText ?? '') : null).toStrictEqual({
      source: 'mcp',
      action: 'run',
      phase: 'running',
      params: {
        requestId: 'approval-1',
        tool: 'codex_claw.register-agent',
        confirmationSummary: 'Allow codex_claw to run register-agent?',
        argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
        allowConversation: true,
        allowAlways: true,
      },
    });
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'awaitingInput',
      detail: 'Allow codex_claw to run register-agent?',
    });
  });

  it('creates an inline approval placeholder if the MCP tool item has not arrived yet', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-early',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: 'agentId: agent-dina',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to register this agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'approval-approval-early',
        kind: 'mcp',
        title: 'codex_claw.register-agent',
        status: 'running',
        statusText: JSON.stringify({
          source: 'mcp',
          action: 'run',
          phase: 'running',
          params: {
            requestId: 'approval-early',
            tool: 'codex_claw.register-agent',
            confirmationSummary: 'Allow codex_claw to register this agent?',
            argumentsPreview: 'agentId: agent-dina',
            allowConversation: false,
            allowAlways: false,
          },
        }),
        input: 'agentId: agent-dina',
        metadata: {
          confirmationRequestId: 'approval-early',
          server: 'codex_claw',
          tool: 'register-agent',
        },
      },
    ]);
  });

  it('creates an inline user-input prompt from app-server tool input requests', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'toolInput.requested',
      payload: {
        id: 'ask-1',
        kind: 'ask_user',
        payload: {
          request: {
            itemId: 'ask-user-item',
            questions: [
              {
                id: 'target_file',
                header: 'Target',
                question: 'Which file should I inspect?',
                isOther: true,
                isSecret: false,
                options: null,
              },
            ],
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'ask-user-item',
        kind: 'generic',
        title: 'ask_user_question',
        status: 'running',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'ask_user_question',
          phase: 'running',
          params: {
            requestId: 'ask-1',
            questions: [
              {
                id: 'target_file',
                header: 'Target',
                question: 'Which file should I inspect?',
                isOther: true,
                isSecret: false,
                options: null,
              },
            ],
          },
        }),
        input: [
          {
            id: 'target_file',
            header: 'Target',
            question: 'Which file should I inspect?',
            isOther: true,
            isSecret: false,
            options: null,
          },
        ],
        metadata: {
          requestId: 'ask-1',
          question: 'Which file should I inspect?',
        },
      },
    ]);
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'awaitingInput',
      detail: 'Which file should I inspect?',
    });
  });

  it('attaches approval requests to the only running MCP tool when metadata is incomplete', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-without-metadata',
        title: 'unknown_server.unknown-tool',
        status: 'running',
        metadata: {
          server: 'unknown_server',
          tool: 'unknown-tool',
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-sole-tool',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to register this agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toHaveLength(1);
    expect(snapshot.messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool',
      id: 'call-without-metadata',
      title: 'codex_claw.register-agent',
      metadata: {
        confirmationRequestId: 'approval-sole-tool',
        server: 'codex_claw',
        tool: 'register-agent',
      },
    });
  });

  it('stores app-owned plan updates on the agent without duplicating transcript text', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: 'Current plan',
        plan: [
          { step: 'Inspect composer', status: 'completed' },
          { step: 'Wire Plan mode', status: 'inProgress' },
        ],
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      explanation: 'Current plan',
      steps: [
        { step: 'Inspect composer', status: 'completed' },
        { step: 'Wire Plan mode', status: 'inProgress' },
      ],
      markdown: 'Current plan\n- [x] Inspect composer\n- [ ] Wire Plan mode',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].parts).toStrictEqual([
      expect.objectContaining({
        id: 'plan-turn-plan',
        kind: 'generic',
        status: 'completed',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'completed',
          params: {
            addedLines: 3,
            operation: 'write',
            target: 'plan',
          },
        }),
        title: 'plan',
        type: 'tool',
      }),
    ]);
    expect(JSON.stringify(snapshot.messages[0].parts)).not.toContain('Current plan');
  });

  it('sanitizes partial plan updates before storing them on the agent', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.planUpdated',
      payload: {
        explanation: ' ',
        plan: [
          null,
          { step: ' ', status: 'completed' },
          { step: 'Use fallback status', status: 'unknown' },
        ],
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      explanation: '',
      steps: [
        { step: 'Use fallback status', status: 'pending' },
      ],
      markdown: '- [ ] Use fallback status',
      updatedAt: '2026-06-05T00:00:00.000Z',
    });

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-empty-plan',
      type: 'turn.planUpdated',
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].plan?.turnId).toBe('turn-plan');
  });

  it('stores proposed plan deltas and overwrites them with completed plan item text', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'turn-plan-plan',
        delta: '# Draft Plan\n',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'turn-plan-plan',
        delta: '- draft step\n',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].plan?.markdown).toBe('# Draft Plan\n- draft step\n');

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanCompleted',
      payload: {
        itemId: 'turn-plan-plan',
        markdown: '# Final Plan\n\n- final step\n',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      explanation: '',
      steps: [],
      markdown: '# Final Plan\n\n- final step',
      updatedAt: '2026-06-05T00:00:02.000Z',
    });
  });

  it('extracts proposed plan tags from assistant deltas into agent plan state', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: '<proposed_plan>\n# Dummy Plan',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'running',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'running',
          params: {
            addedLines: 1,
            operation: 'write',
            target: 'plan',
          },
        }),
        metadata: {
          capturingProposedPlan: true,
          planProgress: true,
        },
      }),
    ]);
    expect(snapshot.agents[0].plan?.markdown).toBe('\n# Dummy Plan');

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: '\n\n- [ ] Do nothing\n</proposed_plan>',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].plan).toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-plan',
      explanation: '',
      steps: [],
      markdown: '# Dummy Plan\n\n- [ ] Do nothing',
      updatedAt: '2026-06-05T00:00:01.000Z',
    });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'completed',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'completed',
          params: {
            addedLines: 2,
            operation: 'write',
            target: 'plan',
          },
        }),
        metadata: {
          capturingProposedPlan: false,
          planProgress: true,
        },
      }),
    ]);
  });

  it('keeps text around proposed plan tags while hiding the plan body from chat', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: 'I will draft this.\n<proposed_plan>\n# Plan\n',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'message.delta',
      payload: {
        delta: '- [ ] Do it\n</proposed_plan>\nReady for review.',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      { type: 'text', text: 'I will draft this.\n' },
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        status: 'completed',
        title: 'plan',
      }),
      { type: 'text', text: '\nReady for review.' },
    ]);
    expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).not.toContain('<proposed_plan>');
    expect(JSON.stringify(snapshot.messages.at(-1)?.parts)).not.toContain('- [ ] Do it');
  });

  it('renders typed proposed plan deltas as an ungrouped plan progress tool with line stats', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 0,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'plan-item',
        delta: '# Plan\n',
      },
      occurredAt: '2026-06-05T00:00:00.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-plan',
      type: 'turn.proposedPlanDelta',
      payload: {
        itemId: 'plan-item',
        delta: '- [ ] Do it\n',
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      expect.objectContaining({
        type: 'tool',
        id: 'plan-turn-plan',
        kind: 'generic',
        title: 'plan',
        status: 'running',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'plan',
          phase: 'running',
          params: {
            addedLines: 2,
            operation: 'write',
            target: 'plan',
          },
        }),
        metadata: {
          capturingProposedPlan: false,
          planProgress: true,
        },
      }),
    ]);
  });

  it('handles reducer fallback and error events without Codex protocol leaking into UI state', () => {
    const snapshot = createInitialSnapshot();

    expect(updateAgentFolder(snapshot, 'missing-agent', '/tmp/nope')).toBeNull();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      type: 'message.delta',
      payload: { delta: 'ignored without agent' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-with-empty-delta',
      type: 'message.delta',
      payload: { delta: 123 },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.messages).toHaveLength(0);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'error',
      payload: {},
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Backend error' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'Backend error' }]);
  });
});

function toolPartPayload(toolPart: RendererToolPart): { toolPart: RendererToolPart } {
  return { toolPart };
}

function commandToolPart(input: {
  id: string;
  title: string;
  status: RendererToolPart['status'];
  body?: string;
  cwd?: string;
  commandActions?: unknown;
  exitCode?: number;
  durationMs?: number;
}): RendererToolPart {
  return {
    type: 'tool',
    id: input.id,
    kind: 'command',
    title: input.title,
    status: input.status,
    body: input.body,
    input: {
      command: input.title,
      cwd: input.cwd,
      commandActions: input.commandActions,
    },
    output: {
      exitCode: input.exitCode,
      durationMs: input.durationMs,
    },
    metadata: {
      source: undefined,
      processId: undefined,
    },
  };
}

function mcpToolPart(input: {
  id: string;
  title: string;
  status: RendererToolPart['status'];
  body?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}): RendererToolPart {
  return {
    type: 'tool',
    id: input.id,
    kind: 'mcp',
    title: input.title,
    status: input.status,
    body: input.body,
    input: input.input,
    output: input.output,
    metadata: input.metadata,
  };
}

function dynamicToolPart(input: {
  id: string;
  title: string;
  status: RendererToolPart['status'];
  statusText?: string;
  body?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}): RendererToolPart {
  return {
    type: 'tool',
    id: input.id,
    kind: 'dynamic',
    title: input.title,
    status: input.status,
    ...(input.statusText !== undefined ? { statusText: input.statusText } : {}),
    body: input.body,
    input: input.input,
    output: input.output,
    metadata: input.metadata,
  };
}

function fileChangeToolPart(
  id: string,
  changes: unknown[],
  status: RendererToolPart['status'],
): RendererToolPart {
  return {
    type: 'tool',
    id,
    kind: 'fileChange',
    title: changes.length === 1 ? '1 file change' : `${changes.length} file changes`,
    status,
    body: fileChangesText(changes),
    input: { changes },
    metadata: { changes },
  };
}

function commandOutputDeltaToToolPartUpdate(itemId: string, delta: string): RendererToolPartUpdate {
  return {
    itemId,
    bodyDelta: delta,
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'command',
      title: 'Command',
      status: 'running',
    },
  };
}

function mcpProgressToToolPartUpdate(itemId: string, message: string): RendererToolPartUpdate {
  return {
    itemId,
    bodyAppend: message,
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'mcp',
      title: 'MCP tool',
      status: 'running',
    },
  };
}

function fileChangePatchToToolPartUpdate(itemId: string, changes: unknown[]): RendererToolPartUpdate {
  return {
    itemId,
    body: fileChangesText(changes),
    input: { changes },
    metadata: { changes },
    fallbackToolPart: fileChangeToolPart(itemId, changes, 'running'),
  };
}

function rawOutputToToolPartUpdate(
  itemId: string,
  output: unknown,
  title?: string,
  status: RendererToolPart['status'] = 'completed',
): RendererToolPartUpdate {
  const body = toolOutputText(output);
  return {
    itemId,
    title,
    status,
    body,
    output,
    fallbackToolPart: {
      type: 'tool',
      id: itemId,
      kind: 'generic',
      title: title ?? 'Tool output',
      status,
      body,
      output,
    },
  };
}

function fileChangesText(changes: unknown[]): string | undefined {
  return changes
    .map((change) => {
      if (typeof change !== 'object' || change === null || Array.isArray(change)) {
        return JSON.stringify(change);
      }

      const record = change as Record<string, unknown>;
      const kind = typeof record.kind === 'string' ? record.kind : 'update';
      const path = typeof record.path === 'string' ? record.path : 'unknown';
      return `${kind} ${path}`;
    })
    .join('\n') || undefined;
}
