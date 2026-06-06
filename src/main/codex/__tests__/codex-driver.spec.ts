import { describe, expect, it, vi } from 'vitest';
import { CodexBackendDriver } from '../codex-driver';
import type { CodexAgentSessionManager } from '../agent-session';
import type { Agent } from '../../../shared/contracts';

const agent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '~/src/codex-claw',
  backend: 'codex',
  backendDefaults: { kind: 'codex' },
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('CodexBackendDriver', () => {
  it('routes bare compact prompts to manual compaction', async () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    const result = driver.tryHandlePromptCommand(agent, '/compact');

    await expect(result).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-compact' },
      turnId: undefined,
    });
    expect(sessionManager.compactThread).toHaveBeenCalledWith(agent);
    expect(sessionManager.sendPrompt).not.toHaveBeenCalled();
  });

  it('keeps compact prompts with extra text as normal prompts', () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    expect(driver.tryHandlePromptCommand(agent, '/compact remember this')).toBeNull();
    expect(sessionManager.compactThread).not.toHaveBeenCalled();
  });

  it('routes review prompts to review targets', async () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.tryHandlePromptCommand(agent, '/review')).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-review' },
      turnId: 'turn-review',
    });
    expect(sessionManager.reviewThread).toHaveBeenCalledWith(agent, {
      type: 'uncommittedChanges',
    });

    await driver.tryHandlePromptCommand(agent, '/review check regressions');
    expect(sessionManager.reviewThread).toHaveBeenLastCalledWith(agent, {
      type: 'custom',
      instructions: 'check regressions',
    });
  });
});

function createSessionManager(): CodexAgentSessionManager {
  return {
    compactThread: vi.fn().mockResolvedValue({ threadId: 'thread-compact' }),
    reviewThread: vi.fn().mockResolvedValue({ threadId: 'thread-review', turnId: 'turn-review' }),
    sendPrompt: vi.fn(),
  } as unknown as CodexAgentSessionManager;
}
