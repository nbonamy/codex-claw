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

  it('sets and clears goals through the session manager', async () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.setGoal(agent, 'ship the shelf')).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      goal: {
        threadId: 'thread-goal',
        objective: 'ship the shelf',
        status: 'active',
        tokenBudget: null,
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    });
    expect(sessionManager.setThreadGoal).toHaveBeenCalledWith(agent, 'ship the shelf');

    await expect(driver.clearGoal(agent)).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-goal' },
      cleared: true,
    });
    expect(sessionManager.clearThreadGoal).toHaveBeenCalledWith(agent);
  });

  it('sets Codex approval presets through the session manager', async () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.setCodexApprovalPreset(agent, 'full-access')).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-approval' },
      approvalPreset: 'full-access',
    });
    expect(sessionManager.setApprovalPreset).toHaveBeenCalledWith(agent, 'full-access');
  });

  it('sets conversation titles through the session manager', async () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.setConversationTitle(agent, 'Dina - Jun 10, 2026 3:42 PM')).resolves.toBeUndefined();
    expect(sessionManager.setConversationTitle).toHaveBeenCalledWith(agent, 'Dina - Jun 10, 2026 3:42 PM');
  });

  it('propagates conversation title failures from the session manager', async () => {
    const sessionManager = createSessionManager({
      setConversationTitle: vi.fn().mockRejectedValue(new Error('rename failed')),
    });
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.setConversationTitle(agent, 'Dina - Jun 10, 2026 3:42 PM')).rejects.toThrow('rename failed');
  });

  it('reads historical conversation messages through the session manager', async () => {
    const messages = [{
      id: 'user-thread-dina-user-1',
      agentId: 'agent-dina',
      role: 'user' as const,
      status: 'complete' as const,
      createdAt: '2026-06-09T10:00:00.000Z',
      parts: [{ type: 'text' as const, text: 'hello' }],
    }];
    const sessionManager = createSessionManager({
      readConversationMessages: vi.fn().mockResolvedValue(messages),
    });
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.readConversationMessages({ backend: 'codex', threadId: 'thread-dina' }, 'agent-dina')).resolves.toStrictEqual(messages);
    expect(sessionManager.readConversationMessages).toHaveBeenCalledWith('thread-dina', 'agent-dina');
  });
});

function createSessionManager(overrides: Partial<CodexAgentSessionManager> = {}): CodexAgentSessionManager {
  return {
    compactThread: vi.fn().mockResolvedValue({ threadId: 'thread-compact' }),
    clearThreadGoal: vi.fn().mockResolvedValue({ threadId: 'thread-goal', cleared: true }),
    reviewThread: vi.fn().mockResolvedValue({ threadId: 'thread-review', turnId: 'turn-review' }),
    sendPrompt: vi.fn(),
    readConversationMessages: vi.fn().mockResolvedValue([]),
    setConversationTitle: vi.fn().mockResolvedValue(undefined),
    setApprovalPreset: vi.fn().mockResolvedValue({ threadId: 'thread-approval', approvalPreset: 'full-access' }),
    setThreadGoal: vi.fn().mockResolvedValue({
      threadId: 'thread-goal',
      goal: {
        threadId: 'thread-goal',
        objective: 'ship the shelf',
        status: 'active',
        tokenBudget: null,
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    }),
    ...overrides,
  } as unknown as CodexAgentSessionManager;
}
