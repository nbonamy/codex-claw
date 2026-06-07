import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../app-controller';
import { createInitialSnapshot } from '../../shared/snapshot';
import type { MainToRendererEvent } from '../../shared/contracts';
import type { AppStatePersistence } from '../state-persistence';
import type { AgentBackendDriver } from '../backends/types';
import { claudeBackendCapabilities, codexBackendCapabilities } from '../../shared/backend-capabilities';

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
} {
  return (controller as unknown as {
    mcpCoordinator: {
      setStatus(agentId: string, status: string): string;
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
