import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../app-controller';
import { createInitialSnapshot } from '../../shared/snapshot';
import type { MainToRendererEvent } from '../../shared/contracts';
import type { AppStatePersistence } from '../state-persistence';

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

  it('interrupts the active Codex turn and keeps status until completion arrives', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.agents[0].status = { type: 'working' };
    const persistence = {
      load: vi.fn().mockResolvedValue(snapshot),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppStatePersistence;
    const controller = new AppController(persistence);
    const sessionManager = {
      interruptTurn: vi.fn().mockResolvedValue({ threadId: 'thread-dina', turnId: 'turn-1' }),
    };

    await controller.initialize();
    setCodexSessionManager(controller, sessionManager);
    await interruptAgent(controller, 'agent-dina');

    expect(sessionManager.interruptTurn).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-dina' }));
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'working' });
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

function setCodexSessionManager(
  controller: AppController,
  sessionManager: { interruptTurn(agent: unknown): Promise<{ threadId: string; turnId: string }> },
): void {
  (controller as unknown as {
    codexSessionManager: typeof sessionManager;
  }).codexSessionManager = sessionManager;
}

async function interruptAgent(controller: AppController, agentId: string): Promise<void> {
  await (controller as unknown as {
    interruptAgent(agentId: string): Promise<void>;
  }).interruptAgent(agentId);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
