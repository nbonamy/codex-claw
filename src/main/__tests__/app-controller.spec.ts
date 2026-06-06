import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../app-controller';
import { createInitialSnapshot } from '../../shared/snapshot';
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
