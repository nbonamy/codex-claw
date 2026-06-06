import { describe, expect, it } from 'vitest';
import {
  appendUserPrompt,
  applyMainEventToSnapshot,
  createAgentInSnapshot,
  createInitialSnapshot,
  selectAgent,
  updateAgentFromInput,
  updateAgentFolder,
} from '../snapshot';
import type { RendererToolPart, RendererToolPartUpdate } from '../contracts';
import { toolOutputText } from '../tool-output';

describe('snapshot reducer', () => {
  it('updates the agent folder and clears the old thread mapping', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].codexThreadId = 'thread-old';
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
    snapshot.agents[0].isRegistered = true;
    snapshot.agents[0].mcpSessionId = 'mcp-session';
    snapshot.agents[0].statusText = 'Registered';

    expect(updateAgentFolder(snapshot, 'agent-dina', '/Users/nbonamy/src/id8', '2026-06-05T00:00:01.000Z')).toStrictEqual({
      id: 'agent-dina',
      teamId: 'team-codex-claw',
      name: 'Dina',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/id8',
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
    }, '2026-06-05T10:11:12.000Z');

    expect(snapshot.activeAgentId).toBe('agent-jules-20260605t101112000z');
    expect(snapshot.teams[0].agentIds).toContain('agent-jules-20260605t101112000z');
    expect(snapshot.teams[0].activeAgentId).toBe('agent-jules-20260605t101112000z');
    expect(snapshot.agents.at(-1)).toStrictEqual({
      id: 'agent-jules-20260605t101112000z',
      teamId: 'team-codex-claw',
      name: 'Jules',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/id8',
      status: { type: 'idle' },
      createdAt: '2026-06-05T10:11:12.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
  });

  it('defaults a blank created agent name from the folder basename', () => {
    const snapshot = createInitialSnapshot();

    createAgentInSnapshot(snapshot, {
      name: ' ',
      folder: '/tmp/codex-claw',
    }, '2026-06-05T10:11:12.000Z');

    expect(snapshot.agents.at(-1)?.name).toBe('codex-claw');
    expect(snapshot.agents.at(-1)?.id).toBe('agent-codex-claw-20260605t101112000z');
  });

  it('updates idle agents and clears Codex runtime state when the folder changes', () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.codexThreadId = 'thread-old';
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
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T10:11:12.000Z',
    });
  });

  it('updates idle agents without clearing the thread when the folder is unchanged', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].codexThreadId = 'thread-existing';

    updateAgentFromInput(snapshot, {
      id: 'agent-dina',
      name: 'Dina Prime',
      avatar: undefined,
      folder: '~/src/codex-claw',
    }, '2026-06-05T10:11:12.000Z');

    expect(snapshot.agents[0].codexThreadId).toBe('thread-existing');
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
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'message.delta',
      payload: { delta: 'hello' },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
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
      payload: { prompt: 'read all the markdown files' },
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
        createdAt: '2026-06-05T00:00:03.000Z',
        parts: [{ type: 'text', text: 'read all the markdown files' }],
      },
      {
        id: 'assistant-turn-1-segment-20260605t000003000z',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
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

  it('records thread starts and app-server status updates', () => {
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
      type: 'appServer.statusChanged',
      payload: { status: 'running', detail: 'connected' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.agents[0].codexThreadId).toBe('thread-1');
    expect(snapshot.appServer).toStrictEqual({ status: 'running', detail: 'connected' });
  });

  it('records thread settings updates as durable agent thread mappings', () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].codexThreadId = 'thread-old';

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      type: 'thread.settingsUpdated',
      payload: {
        threadSettings: {
          cwd: '/Users/nbonamy/src/codex-claw',
          model: 'gpt-5.5',
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.agents[0].codexThreadId).toBe('thread-1');
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
            parts: [{ type: 'text', text: 'older prompt' }],
          },
          {
            id: 'assistant-turn-old',
            agentId: 'agent-dina',
            role: 'assistant',
            status: 'complete',
            createdAt: '2026-06-05T00:00:02.000Z',
            parts: [{ type: 'text', text: 'older answer' }],
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
      isRegistered: true,
      mcpSessionId: 'mcp-session-1',
      statusText: 'Reviewing MCP shape',
      status: { type: 'idle' },
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:02.000Z',
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

  it('inserts compaction markers at the streaming turn position and starts a new assistant segment', () => {
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
        createdAt: expect.any(String),
        parts: [{ type: 'text', text: 'Before compaction.' }],
      },
      {
        id: 'compaction-turn-1',
        agentId: 'agent-dina',
        kind: 'compaction',
        role: 'assistant',
        status: 'complete',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [],
      },
      {
        id: 'assistant-turn-1-segment-20260605t000002000z',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'streaming',
        createdAt: '2026-06-05T00:00:02.000Z',
        parts: [{ type: 'text', text: 'After compaction.' }],
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

  it('renders app-owned plan updates as transcript text', () => {
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

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'text',
        text: 'Current plan\n- [x] Inspect composer\n- [ ] Wire Plan mode',
      },
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
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'text', text: '' }]);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'error',
      payload: {},
      occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.agents[0].status).toStrictEqual({ type: 'error', message: 'Codex app-server error' });
    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([{ type: 'status', text: 'Codex app-server error' }]);
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
