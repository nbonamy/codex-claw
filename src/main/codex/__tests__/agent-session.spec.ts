import { describe, expect, it, vi } from 'vitest';
import { CodexAgentSessionManager, expandHome } from '../agent-session';
import { CodexRpcClient, type CodexTransport } from '../rpc-client';
import type { Agent } from '../../../shared/contracts';
import type { JsonRpcClientMessage, JsonRpcServerMessage } from '../protocol';

class FakeTransport implements CodexTransport {
  sent: JsonRpcClientMessage[] = [];
  private messageListener: ((message: JsonRpcServerMessage) => void) | null = null;

  start = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);

  send(message: JsonRpcClientMessage): void {
    this.sent.push(message);
  }

  onMessage(listener: (message: JsonRpcServerMessage) => void): () => void {
    this.messageListener = listener;
    return () => {
      this.messageListener = null;
    };
  }

  onError(): () => void {
    return () => undefined;
  }

  receive(message: JsonRpcServerMessage): void {
    this.messageListener?.(message);
  }
}

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/codex-claw',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('CodexAgentSessionManager', () => {
  it('starts a thread tied to the agent folder and sends a text turn', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const prompt = manager.sendPrompt(agent, 'hello codex');
    await waitForSentCount(transport, 1);
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 3);
    transport.receive({
      id: 2,
      result: {
        thread: {
          id: 'thread-1',
          cwd: '/Users/nbonamy/src/codex-claw',
        },
      },
    });
    await waitForSentCount(transport, 4);
    transport.receive({
      id: 3,
      result: {
        turn: {
          id: 'turn-1',
          status: 'running',
        },
      },
    });

    await expect(prompt).resolves.toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    expect(transport.sent).toStrictEqual([
      {
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'codex_claw',
            title: 'Codex Claw',
            version: '0.1.0',
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
          },
        },
      },
      { method: 'initialized' },
      {
        id: 2,
        method: 'thread/start',
        params: {
          cwd: expandHome('~/src/codex-claw'),
          approvalPolicy: 'never',
          sandbox: 'workspace-write',
          serviceName: 'codex_claw',
        },
      },
      {
        id: 3,
        method: 'turn/start',
        params: {
          threadId: 'thread-1',
          input: [
            {
              type: 'text',
              text: 'hello codex',
              text_elements: [],
            },
          ],
          cwd: expandHome('~/src/codex-claw'),
        },
      },
    ]);
  });

  it('passes selected model and reasoning effort to turn start', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const prompt = manager.sendPrompt(agent, 'hello codex', {
      model: 'gpt-5.1-codex',
      reasoningEffort: 'high',
    });
    await waitForSentCount(transport, 1);
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 3);
    transport.receive({
      id: 2,
      result: {
        thread: {
          id: 'thread-1',
          cwd: '/Users/nbonamy/src/codex-claw',
        },
      },
    });
    await waitForSentCount(transport, 4);
    transport.receive({
      id: 3,
      result: {
        turn: {
          id: 'turn-1',
          status: 'running',
        },
      },
    });

    await prompt;

    expect(transport.sent.at(-1)).toStrictEqual({
      id: 3,
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [
          {
            type: 'text',
            text: 'hello codex',
            text_elements: [],
          },
        ],
        cwd: expandHome('~/src/codex-claw'),
        model: 'gpt-5.1-codex',
        effort: 'high',
      },
    });
  });

  it('passes plan mode as a Codex collaboration mode override', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const prompt = manager.sendPrompt(agent, 'plan the work', {
      model: 'gpt-5.1-codex',
      planMode: true,
      reasoningEffort: 'high',
    });
    await waitForSentCount(transport, 1);
    transport.receive({ id: 1, result: { userAgent: 'codex', codexHome: '/tmp/codex-home', platformFamily: 'unix', platformOs: 'macos' } });
    await waitForSentCount(transport, 3);
    transport.receive({ id: 2, result: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    await waitForSentCount(transport, 4);
    transport.receive({ id: 3, result: { turn: { id: 'turn-1', status: 'running' } } });

    await prompt;

    expect(transport.sent.at(-1)).toStrictEqual({
      id: 3,
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [
          {
            type: 'text',
            text: 'plan the work',
            text_elements: [],
          },
        ],
        cwd: expandHome('~/src/codex-claw'),
        model: 'gpt-5.1-codex',
        effort: 'high',
        collaborationMode: {
          mode: 'plan',
          settings: {
            model: 'gpt-5.1-codex',
            reasoning_effort: 'high',
            developer_instructions: null,
          },
        },
      },
    });
  });

  it('sets a thread goal before starting a goal-mode prompt', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const prompt = manager.sendPrompt(agent, 'ship the feature', {
      goalMode: true,
    });
    await waitForSentCount(transport, 1);
    transport.receive({ id: 1, result: { userAgent: 'codex', codexHome: '/tmp/codex-home', platformFamily: 'unix', platformOs: 'macos' } });
    await waitForSentCount(transport, 3);
    transport.receive({ id: 2, result: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    await waitForSentCount(transport, 4);

    expect(transport.sent.at(-1)).toStrictEqual({
      id: 3,
      method: 'thread/goal/set',
      params: {
        threadId: 'thread-1',
        objective: 'ship the feature',
        status: 'active',
      },
    });

    transport.receive({ id: 3, result: { goal: { threadId: 'thread-1', objective: 'ship the feature', status: 'active', tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 0, updatedAt: 0 } } });
    await waitForSentCount(transport, 5);
    transport.receive({ id: 4, result: { turn: { id: 'turn-1', status: 'running' } } });

    await expect(prompt).resolves.toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    expect(transport.sent.at(-1)).toMatchObject({
      id: 4,
      method: 'turn/start',
    });
  });

  it('resumes a persisted agent thread before starting a turn', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));
    const persistedAgent: Agent = {
      ...agent,
      codexThreadId: 'thread-persisted',
    };

    const prompt = manager.sendPrompt(persistedAgent, 'continue');
    await waitForSentCount(transport, 1);
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 3);
    transport.receive({
      id: 2,
      result: {
        thread: {
          id: 'thread-persisted',
          cwd: '/Users/nbonamy/src/codex-claw',
          turns: [
            {
              id: 'turn-history',
              status: 'completed',
              startedAt: 1_780_000_000,
              completedAt: 1_780_000_010,
              items: [
                {
                  type: 'userMessage',
                  id: 'user-history',
                  content: [
                    {
                      type: 'text',
                      text: 'what did we do?',
                      text_elements: [],
                    },
                  ],
                },
                {
                  type: 'agentMessage',
                  id: 'message-history',
                  text: 'We built the first MVP.',
                },
              ],
            },
          ],
        },
      },
    });
    await waitForSentCount(transport, 4);
    transport.receive({
      id: 3,
      result: {
        turn: {
          id: 'turn-resumed',
          status: 'running',
        },
      },
    });

    await expect(prompt).resolves.toStrictEqual({
      threadId: 'thread-persisted',
      turnId: 'turn-resumed',
    });
    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-persisted',
        type: 'thread.historyLoaded',
        payload: {
          messages: [
            {
              id: 'user-thread-persisted-turn-history-user-history',
              agentId: 'agent-dina',
              role: 'user',
              status: 'complete',
              createdAt: '2026-05-28T20:26:40.000Z',
              parts: [{ type: 'text', text: 'what did we do?' }],
            },
            {
              id: 'assistant-turn-history',
              agentId: 'agent-dina',
              role: 'assistant',
              status: 'complete',
              createdAt: '2026-05-28T20:26:40.000Z',
              parts: [{ type: 'text', text: 'We built the first MVP.', itemId: 'message-history' }],
            },
          ],
        },
        occurredAt: '<now>',
      },
    ]);

    expect(transport.sent).toContainEqual({
      id: 2,
      method: 'thread/resume',
      params: {
        threadId: 'thread-persisted',
        cwd: expandHome('~/src/codex-claw'),
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      },
    });
    expect(transport.sent).not.toContainEqual(expect.objectContaining({
      method: 'thread/start',
    }));
    expect(transport.sent.at(-1)).toStrictEqual({
      id: 3,
      method: 'turn/start',
      params: {
        threadId: 'thread-persisted',
        input: [
          {
            type: 'text',
            text: 'continue',
            text_elements: [],
          },
        ],
        cwd: expandHome('~/src/codex-claw'),
      },
    });
  });

  it('hydrates a persisted agent thread without starting a turn', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    const hydration = manager.hydrateAgent({
      ...agent,
      codexThreadId: 'thread-persisted',
    });
    await waitForSentCount(transport, 1);
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 3);
    transport.receive({
      id: 2,
      result: {
        thread: {
          id: 'thread-persisted',
          cwd: '/Users/nbonamy/src/codex-claw',
          turns: [
            {
              id: 'turn-history',
              status: 'completed',
              startedAt: 1_780_000_000,
              completedAt: 1_780_000_010,
              items: [
                {
                  type: 'agentMessage',
                  id: 'message-history',
                  text: 'Restored.',
                },
              ],
            },
          ],
        },
      },
    });

    await expect(hydration).resolves.toBe('thread-persisted');
    expect(transport.sent).toContainEqual({
      id: 2,
      method: 'thread/resume',
      params: {
        threadId: 'thread-persisted',
        cwd: expandHome('~/src/codex-claw'),
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      },
    });
    expect(transport.sent).not.toContainEqual(expect.objectContaining({
      method: 'turn/start',
    }));
    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-persisted',
        type: 'thread.historyLoaded',
        payload: {
          messages: [
            {
              id: 'assistant-turn-history',
              agentId: 'agent-dina',
              role: 'assistant',
              status: 'complete',
              createdAt: '2026-05-28T20:26:40.000Z',
              parts: [{ type: 'text', text: 'Restored.', itemId: 'message-history' }],
            },
          ],
        },
        occurredAt: '<now>',
      },
    ]);
  });

  it('lists Codex models and preserves app-server reasoning effort order', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const models = manager.listModels();
    await waitForSentCount(transport, 1);
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 3);
    transport.receive({
      id: 2,
      result: {
        data: [
          {
            id: 'codex-max',
            model: 'gpt-5.1-codex-max',
            displayName: 'GPT-5.1 Codex Max',
            description: 'Best for large implementation work',
            hidden: false,
            supportedReasoningEfforts: [
              { reasoningEffort: 'medium', description: 'Balanced' },
              { reasoningEffort: 'high', description: 'Deep reasoning' },
              { reasoningEffort: 'xhigh', description: 'Maximum reasoning' },
            ],
            defaultReasoningEffort: 'high',
            isDefault: true,
          },
        ],
        nextCursor: null,
      },
    });

    await expect(models).resolves.toStrictEqual([
      {
        id: 'codex-max',
        model: 'gpt-5.1-codex-max',
        displayName: 'GPT-5.1 Codex Max',
        description: 'Best for large implementation work',
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: 'medium', description: 'Balanced' },
          { reasoningEffort: 'high', description: 'Deep reasoning' },
          { reasoningEffort: 'xhigh', description: 'Maximum reasoning' },
        ],
        defaultReasoningEffort: 'high',
        isDefault: true,
      },
    ]);
    expect(transport.sent.at(-1)).toStrictEqual({
      id: 2,
      method: 'model/list',
      params: {
        cursor: null,
        includeHidden: false,
      },
    });
  });

  it('injects Codex Claw agent instructions when MCP is enabled', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport), {
      clawMcpEnabled: true,
    });

    const prompt = manager.sendPrompt(agent, 'hello codex');
    await waitForSentCount(transport, 1);
    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 3);

    expect(transport.sent[2]).toStrictEqual({
      id: 2,
      method: 'thread/start',
      params: {
        cwd: expandHome('~/src/codex-claw'),
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        serviceName: 'codex_claw',
        developerInstructions: expect.stringContaining('Your Codex Claw agent ID is agent-dina.'),
      },
    });

    transport.receive({
      id: 2,
      result: {
        thread: {
          id: 'thread-1',
          cwd: '/Users/nbonamy/src/codex-claw',
        },
      },
    });
    await waitForSentCount(transport, 4);
    transport.receive({
      id: 3,
      result: {
        turn: {
          id: 'turn-1',
          status: 'running',
        },
      },
    });

    await expect(prompt).resolves.toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
  });

  it('shares app-server initialization across concurrent agent prompts', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const secondAgent: Agent = {
      ...agent,
      id: 'agent-jesse',
      name: 'Jesse',
      avatar: 'JE',
    };

    const dinaPrompt = manager.sendPrompt(agent, 'dina prompt');
    const jessePrompt = manager.sendPrompt(secondAgent, 'jesse prompt');
    await waitForSentCount(transport, 1);

    expect(transport.sent.filter((message) => 'method' in message && message.method === 'initialize')).toHaveLength(1);

    transport.receive({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: '/tmp/codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
      },
    });
    await waitForSentCount(transport, 4);

    const threadStarts = transport.sent.filter((message) => 'method' in message && message.method === 'thread/start');
    expect(threadStarts).toHaveLength(2);

    transport.receive({
      id: 2,
      result: {
        thread: {
          id: 'thread-dina',
          cwd: '/Users/nbonamy/src/codex-claw',
        },
      },
    });
    transport.receive({
      id: 3,
      result: {
        thread: {
          id: 'thread-jesse',
          cwd: '/Users/nbonamy/src/codex-claw',
        },
      },
    });
    await waitForSentCount(transport, 6);

    transport.receive({
      id: 4,
      result: {
        turn: {
          id: 'turn-dina',
          status: 'running',
        },
      },
    });
    transport.receive({
      id: 5,
      result: {
        turn: {
          id: 'turn-jesse',
          status: 'running',
        },
      },
    });

    await expect(dinaPrompt).resolves.toStrictEqual({
      threadId: 'thread-dina',
      turnId: 'turn-dina',
    });
    await expect(jessePrompt).resolves.toStrictEqual({
      threadId: 'thread-jesse',
      turnId: 'turn-jesse',
    });
  });

  it('adapts Codex notifications into app-owned renderer events', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    const prompt = manager.sendPrompt(agent, 'hello codex');
    await waitForSentCount(transport, 1);
    transport.receive({ id: 1, result: { userAgent: 'codex', codexHome: '/tmp/codex-home', platformFamily: 'unix', platformOs: 'macos' } });
    await waitForSentCount(transport, 3);
    transport.receive({ id: 2, result: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    await waitForSentCount(transport, 4);
    transport.receive({ id: 3, result: { turn: { id: 'turn-1', status: 'running' } } });
    await prompt;

    transport.receive({ method: 'thread/started', params: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    transport.receive({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'running' } } });
    transport.receive({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'item-1',
        delta: 'Hello back.',
      },
    });
    transport.receive({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'npm test',
          status: 'inProgress',
        },
      },
    });
    transport.receive({
      method: 'item/commandExecution/outputDelta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'cmd-1',
        delta: 'running\n',
      },
    });
    transport.receive({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'npm test',
          status: 'completed',
          aggregatedOutput: 'passed',
        },
      },
    });
    transport.receive({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'thread.started',
        payload: { cwd: '/Users/nbonamy/src/codex-claw' },
        occurredAt: '<now>',
      },
      {
        seq: 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'turn.started',
        payload: { status: 'running' },
        occurredAt: '<now>',
      },
      {
        seq: 3,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'message.delta',
        payload: { itemId: 'item-1', delta: 'Hello back.' },
        occurredAt: '<now>',
      },
      {
        seq: 4,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'item.started',
        payload: {
          toolPart: {
            type: 'tool',
            id: 'cmd-1',
            kind: 'command',
            title: 'npm test',
            status: 'running',
            body: undefined,
            input: {
              command: 'npm test',
              cwd: undefined,
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
        },
        occurredAt: '<now>',
      },
      {
        seq: 5,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'item.updated',
        payload: {
          itemId: 'cmd-1',
          bodyDelta: 'running\n',
          fallbackToolPart: {
            type: 'tool',
            id: 'cmd-1',
            kind: 'command',
            title: 'Command',
            status: 'running',
          },
        },
        occurredAt: '<now>',
      },
      {
        seq: 6,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'item.completed',
        payload: {
          toolPart: {
            type: 'tool',
            id: 'cmd-1',
            kind: 'command',
            title: 'npm test',
            status: 'completed',
            body: 'passed',
            input: {
              command: 'npm test',
              cwd: undefined,
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
        },
        occurredAt: '<now>',
      },
      {
        seq: 7,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'turn.completed',
        payload: { status: 'completed' },
        occurredAt: '<now>',
      },
    ]);
  });

  it('maps plan, mode, and goal notifications into app-owned events', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);

    transport.receive({
      method: 'turn/plan/updated',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        explanation: 'Working plan',
        plan: [
          { step: 'Inspect composer', status: 'completed' },
          { step: 'Wire mode toggle', status: 'inProgress' },
        ],
      },
    });
    transport.receive({
      method: 'thread/settings/updated',
      params: {
        threadId: 'thread-1',
        threadSettings: {
          cwd: '/Users/nbonamy/src/codex-claw',
          model: 'gpt-5.5',
          collaborationMode: {
            mode: 'plan',
          },
        },
      },
    });
    transport.receive({
      method: 'thread/goal/updated',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
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
    });
    transport.receive({
      method: 'thread/goal/cleared',
      params: {
        threadId: 'thread-1',
      },
    });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'turn.planUpdated',
        payload: {
          explanation: 'Working plan',
          plan: [
            { step: 'Inspect composer', status: 'completed' },
            { step: 'Wire mode toggle', status: 'inProgress' },
          ],
        },
        occurredAt: '<now>',
      },
      {
        seq: 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'thread.settingsUpdated',
        payload: {
          threadSettings: {
            cwd: '/Users/nbonamy/src/codex-claw',
            model: 'gpt-5.5',
            collaborationMode: {
              mode: 'plan',
            },
          },
        },
        occurredAt: '<now>',
      },
      {
        seq: 3,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'thread.modeUpdated',
        payload: {
          mode: 'plan',
        },
        occurredAt: '<now>',
      },
      {
        seq: 4,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
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
        occurredAt: '<now>',
      },
      {
        seq: 5,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'thread.goalCleared',
        payload: {},
        occurredAt: '<now>',
      },
    ]);
  });

  it('maps token usage and rate-limit notifications into app-owned events', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);

    transport.receive({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        tokenUsage: {
          total: {
            totalTokens: 397_740,
            inputTokens: 320_000,
            cachedInputTokens: 80_000,
            outputTokens: 72_000,
            reasoningOutputTokens: 24_000,
          },
          last: {
            totalTokens: 64_600,
            inputTokens: 50_000,
            cachedInputTokens: 500,
            outputTokens: 12_000,
            reasoningOutputTokens: 2_600,
          },
          modelContextWindow: 258_400,
        },
      },
    });
    transport.receive({
      method: 'account/rateLimits/updated',
      params: {
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
    });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'thread.tokenUsageUpdated',
        payload: {
          contextUsage: {
            totalTokens: 397_740,
            inputTokens: 320_000,
            cachedInputTokens: 80_000,
            outputTokens: 72_000,
            reasoningOutputTokens: 24_000,
            lastTotalTokens: 64_600,
            modelContextWindow: 258_400,
            usedPercent: 25,
          },
        },
        occurredAt: '<now>',
      },
      {
        seq: 2,
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
        occurredAt: '<now>',
      },
    ]);
  });

  it('maps Codex thread status notifications into agent status events', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);

    transport.receive({
      method: 'thread/status/changed',
      params: {
        threadId: 'thread-1',
        status: {
          type: 'active',
          activeFlags: ['waitingOnApproval'],
        },
      },
    });
    transport.receive({
      method: 'thread/status/changed',
      params: {
        threadId: 'thread-1',
        status: {
          type: 'active',
          activeFlags: [],
        },
      },
    });
    transport.receive({
      method: 'thread/status/changed',
      params: {
        threadId: 'thread-1',
        status: {
          type: 'idle',
        },
      },
    });
    transport.receive({
      method: 'thread/status/changed',
      params: {
        threadId: 'thread-1',
        status: {
          type: 'systemError',
        },
      },
    });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'agent.statusChanged',
        payload: { type: 'awaitingInput', detail: 'Waiting for approval' },
        occurredAt: '<now>',
      },
      {
        seq: 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'agent.statusChanged',
        payload: { type: 'working' },
        occurredAt: '<now>',
      },
      {
        seq: 3,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'agent.statusChanged',
        payload: { type: 'idle' },
        occurredAt: '<now>',
      },
      {
        seq: 4,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        type: 'agent.statusChanged',
        payload: { type: 'error', message: 'Codex app-server reported a system error.' },
        occurredAt: '<now>',
      },
    ]);
  });

  it('turns MCP tool approval elicitations into client requests and resolves user decisions', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);

    transport.receive({
      id: 'approval-1',
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        serverName: 'codex_claw',
        mode: 'form',
        message: 'Allow codex_claw to run tool "send_message"?',
        _meta: {
          codex_approval_kind: 'mcp_tool_call',
          persist: ['session', 'always'],
          tool_name: 'send_message',
          tool_params: {
            to: 'agent-jesse',
            content: 'please review this',
          },
        },
        requestedSchema: {
          type: 'object',
          properties: {},
        },
      },
    });

    expect(events).toStrictEqual([
      {
        seq: 1,
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
              argumentsPreview: '{\n  "to": "agent-jesse",\n  "content": "please review this"\n}',
              integrationId: 'codex_claw',
              integrationName: 'codex_claw',
              summary: 'Allow codex_claw to run tool "send_message"?',
              toolName: 'send_message',
            },
          },
        },
        occurredAt: '<now>',
      },
    ]);

    await manager.respondToClientRequest({
      id: 'approval-1',
      payload: {
        decision: 'allow_conversation',
      },
    });

    expect(transport.sent.at(-1)).toStrictEqual({
      id: 'approval-1',
      result: {
        action: 'accept',
        content: null,
        _meta: {
          persist: 'session',
        },
      },
    });
    expect(events.at(-1)).toStrictEqual({
      seq: 2,
      agentId: 'agent-dina',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
      occurredAt: '<now>',
    });
  });

  it('declines denied MCP tool approval elicitations', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    await resolveStartedPrompt(transport, manager);
    transport.receive({
      id: 'approval-denied',
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        serverName: 'codex_claw',
        mode: 'form',
        message: 'Allow codex_claw to run tool "send_message"?',
        _meta: {
          codex_approval_kind: 'mcp_tool_call',
          tool_name: 'send_message',
        },
        requestedSchema: {
          type: 'object',
          properties: {},
        },
      },
    });

    await manager.respondToClientRequest({
      id: 'approval-denied',
      payload: {
        decision: 'deny',
      },
    });

    expect(transport.sent.at(-1)).toStrictEqual({
      id: 'approval-denied',
      result: {
        action: 'decline',
        content: null,
        _meta: null,
      },
    });
    await expect(manager.respondToClientRequest({ id: 'approval-denied', payload: { decision: 'deny' } }))
      .rejects.toThrow("Unknown client request 'approval-denied'.");
  });

  it('turns app-server user input requests into client requests and resolves answers', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);

    transport.receive({
      id: 'ask-1',
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'ask-user-item',
        questions: [
          {
            id: 'target_file',
            header: 'Target',
            question: 'Which file should I inspect?',
            isOther: true,
            isSecret: false,
            options: [
              {
                label: 'README.md',
                description: 'Read the project README.',
              },
            ],
          },
        ],
      },
    });

    expect(events).toStrictEqual([
      {
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
                  options: [
                    {
                      label: 'README.md',
                      description: 'Read the project README.',
                    },
                  ],
                },
              ],
            },
          },
        },
        occurredAt: '<now>',
      },
    ]);

    await manager.respondToClientRequest({
      id: 'ask-1',
      payload: {
        answers: {
          target_file: {
            answers: ['README.md'],
          },
        },
      },
    });

    expect(transport.sent.at(-1)).toStrictEqual({
      id: 'ask-1',
      result: {
        answers: {
          target_file: {
            answers: ['README.md'],
          },
        },
      },
    });
  });

  it('maps context compaction items and deprecated compaction notifications into timeline events', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);
    transport.receive({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'contextCompaction',
          id: 'compact-1',
        },
      },
    });
    transport.receive({
      method: 'thread/compacted',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-2',
      },
    });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'context.compactionStarted',
        payload: {
          itemId: 'compact-1',
        },
        occurredAt: '<now>',
      },
      {
        seq: 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-2',
        type: 'context.compactionStarted',
        payload: {},
        occurredAt: '<now>',
      },
    ]);
  });

  it('consumes server request resolved notifications after pending approvals clear', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);
    transport.receive({
      id: 'approval-cleanup',
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        serverName: 'codex_claw',
        mode: 'form',
        message: 'Allow codex_claw to run tool "register-agent"?',
        _meta: {
          codex_approval_kind: 'mcp_tool_call',
          tool_name: 'register-agent',
        },
        requestedSchema: {
          type: 'object',
          properties: {},
        },
      },
    });
    transport.receive({
      method: 'serverRequest/resolved',
      params: {
        threadId: 'thread-1',
        requestId: 'approval-cleanup',
      },
    });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'approval.requested',
        payload: expect.objectContaining({
          id: 'approval-cleanup',
          kind: 'confirm_tool',
        }),
        occurredAt: '<now>',
      },
      {
        seq: 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'agent.statusChanged',
        payload: { type: 'working' },
        occurredAt: '<now>',
      },
    ]);
    await expect(manager.respondToClientRequest({ id: 'approval-cleanup', payload: { decision: 'allow' } }))
      .rejects.toThrow("Unknown client request 'approval-cleanup'.");
  });

  it('adapts raw response tool items into app-owned renderer events', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    const events: unknown[] = [];
    manager.onEvent((event) => events.push({
      ...event,
      occurredAt: '<now>',
    }));

    await resolveStartedPrompt(transport, manager);

    transport.receive({
      method: 'rawResponseItem/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'function_call',
          name: 'shell_command',
          call_id: 'raw-call-1',
          arguments: JSON.stringify({
            command: 'sed -n 1,80p docs/architecture.md',
            workdir: '/Users/nbonamy/src/codex-claw',
          }),
        },
      },
    });
    transport.receive({
      method: 'rawResponseItem/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'function_call_output',
          call_id: 'raw-call-1',
          output: 'architecture contents',
        },
      },
    });

    expect(events).toStrictEqual([
      {
        seq: 1,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'item.started',
        payload: {
          toolPart: {
            type: 'tool',
            id: 'raw-call-1',
            kind: 'command',
            title: 'sed -n 1,80p docs/architecture.md',
            status: 'running',
            body: undefined,
            input: {
              command: 'sed -n 1,80p docs/architecture.md',
              cwd: '/Users/nbonamy/src/codex-claw',
              commandActions: [],
            },
            output: {
              exitCode: undefined,
              durationMs: undefined,
            },
            metadata: {
              source: 'agent',
              processId: null,
            },
          },
        },
        occurredAt: '<now>',
      },
      {
        seq: 2,
        agentId: 'agent-dina',
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'item.updated',
        payload: {
          itemId: 'raw-call-1',
          body: 'architecture contents',
          output: 'architecture contents',
          status: 'completed',
          title: undefined,
          fallbackToolPart: {
            type: 'tool',
            id: 'raw-call-1',
            kind: 'generic',
            title: 'Tool output',
            status: 'completed',
            body: 'architecture contents',
            output: 'architecture contents',
          },
        },
        occurredAt: '<now>',
      },
    ]);
  });

  it('reuses an existing thread for follow-up prompts', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    const first = manager.sendPrompt(agent, 'first');
    await waitForSentCount(transport, 1);
    transport.receive({ id: 1, result: { userAgent: 'codex', codexHome: '/tmp/codex-home', platformFamily: 'unix', platformOs: 'macos' } });
    await waitForSentCount(transport, 3);
    transport.receive({ id: 2, result: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
    await waitForSentCount(transport, 4);
    transport.receive({ id: 3, result: { turn: { id: 'turn-1', status: 'running' } } });
    await first;

    const second = manager.sendPrompt(agent, 'second');
    await waitForSentCount(transport, 5);
    transport.receive({ id: 4, result: { turn: { id: 'turn-2', status: 'running' } } });
    await second;

    expect(transport.sent.filter((message) => 'method' in message && message.method === 'thread/start')).toHaveLength(1);
    expect(transport.sent.at(-1)).toStrictEqual({
      id: 4,
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [
          {
            type: 'text',
            text: 'second',
            text_elements: [],
          },
        ],
        cwd: expandHome('~/src/codex-claw'),
      },
    });
  });

  it('steers the active turn with an expected turn id', async () => {
    const transport = new FakeTransport();
    const manager = new CodexAgentSessionManager(new CodexRpcClient(transport));

    await resolveStartedPrompt(transport, manager);

    const steer = manager.steerPrompt(agent, 'try the smaller fix');
    await waitForSentCount(transport, 5);

    expect(transport.sent.at(-1)).toStrictEqual({
      id: 4,
      method: 'turn/steer',
      params: {
        threadId: 'thread-1',
        expectedTurnId: 'turn-1',
        input: [
          {
            type: 'text',
            text: 'try the smaller fix',
            text_elements: [],
          },
        ],
      },
    });

    transport.receive({
      id: 4,
      result: {
        turnId: 'turn-1',
      },
    });
    await expect(steer).resolves.toStrictEqual({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    transport.receive({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          status: 'completed',
        },
      },
    });

    await expect(manager.steerPrompt(agent, 'too late')).rejects.toThrow('No active Codex turn to steer.');
  });
});

async function resolveStartedPrompt(transport: FakeTransport, manager: CodexAgentSessionManager): Promise<void> {
  const prompt = manager.sendPrompt(agent, 'hello codex');
  await waitForSentCount(transport, 1);
  transport.receive({ id: 1, result: { userAgent: 'codex', codexHome: '/tmp/codex-home', platformFamily: 'unix', platformOs: 'macos' } });
  await waitForSentCount(transport, 3);
  transport.receive({ id: 2, result: { thread: { id: 'thread-1', cwd: '/Users/nbonamy/src/codex-claw' } } });
  await waitForSentCount(transport, 4);
  transport.receive({ id: 3, result: { turn: { id: 'turn-1', status: 'running' } } });
  await prompt;
}

async function waitForSentCount(transport: FakeTransport, count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(transport.sent.length).toBeGreaterThanOrEqual(count);
  });
}
