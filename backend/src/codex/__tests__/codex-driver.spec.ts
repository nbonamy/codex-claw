import { describe, expect, it, vi } from 'vitest';
import { CodexBackendDriver } from '../codex-driver';
import type { CodexSurfaceAgentAdapter } from '../codex-surface-adapter';
import type { Agent } from '@codex-claw/core/contracts';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';

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
  it('delegates ephemeral text generation without creating an agent session', async () => {
    const generateText = vi.fn().mockResolvedValue({ text: '{"message":"feat: generated"}' });
    const sessionManager = createSessionManager({ generateText });
    const driver = new CodexBackendDriver(sessionManager);
    const input = {
      prompt: 'Describe the diff',
      cwd: '/repo',
      outputSchema: { type: 'object' },
    } as const;

    await expect(driver.generateText(agent, input)).resolves.toStrictEqual({ text: '{"message":"feat: generated"}' });
    expect(generateText).toHaveBeenCalledWith(agent, input);
    expect(sessionManager.sendPrompt).not.toHaveBeenCalled();
  });

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

  it('routes review prompts through SDK slash handling', async () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.tryHandlePromptCommand(agent, '/review')).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-review' },
      turnId: 'turn-review',
    });
    expect(sessionManager.sendPrompt).toHaveBeenCalledWith(agent, '/review');

    await driver.tryHandlePromptCommand(agent, '/review check regressions');
    expect(sessionManager.sendPrompt).toHaveBeenLastCalledWith(agent, '/review check regressions');
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

  it('prepares generic prompt options for Codex sessions', () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    expect(driver.preparePromptOptions(agent, {
      model: 'gpt-5.1-codex',
      planMode: false,
      reasoningEffort: 'high',
      serviceTier: 'fast',
      skills: [{
        name: 'frontend-design',
        path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
      }],
    })).toStrictEqual({
      model: 'gpt-5.1-codex',
      planMode: false,
      backendOptions: {
        kind: 'codex',
        reasoningEffort: 'high',
        serviceTier: 'fast',
        skills: [{
          name: 'frontend-design',
          path: '/Users/nbonamy/.codex/skills/frontend-design/SKILL.md',
        }],
      },
    });
  });

  it('preserves image and file attachments through prepared options into the surface adapter', async () => {
    const sendPrompt = vi.fn().mockResolvedValue({ threadId: 'thread-attachments', turnId: 'turn-attachments' });
    const sessionManager = createSessionManager({ sendPrompt });
    const driver = new CodexBackendDriver(sessionManager);
    const attachments = [
      { type: 'image' as const, path: '/tmp/screenshot.png', detail: 'high' as const },
      { type: 'file' as const, path: '/tmp/README.md', name: 'README' },
    ];
    const prepared = driver.preparePromptOptions(agent, { attachments });

    expect(prepared).toStrictEqual({ attachments, model: null });
    await expect(driver.sendPrompt(agent, 'Inspect these', prepared)).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-attachments' },
      turnId: 'turn-attachments',
    });
    expect(sendPrompt).toHaveBeenCalledWith(agent, 'Inspect these', { attachments, model: null });
  });

  it('sets approval presets through the session manager', async () => {
    const sessionManager = createSessionManager();
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.setApprovalPreset(agent, 'full-access')).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-approval' },
      approvalPreset: 'full-access',
    });
    expect(sessionManager.setApprovalPreset).toHaveBeenCalledWith(agent, 'full-access');
  });

  it('exposes capabilities from the session manager', () => {
    const sessionManager = createSessionManager({
      getCapabilities: vi.fn().mockReturnValue({
        ...codexBackendCapabilities,
        approvalPresets: ['ask-for-approval'],
      }),
    });
    const driver = new CodexBackendDriver(sessionManager);

    expect(driver.getCapabilities(agent).approvalPresets).toStrictEqual(['ask-for-approval']);
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

  it('lists, resumes, and forks conversations through the session manager', async () => {
    const targetAgent = { ...agent, id: 'agent-forked', name: 'Dina (fork)', backendSession: undefined };
    const messages = [{
      id: 'user-thread-dina-user-1',
      agentId: 'agent-dina',
      role: 'user' as const,
      status: 'complete' as const,
      createdAt: '2026-06-09T10:00:00.000Z',
      parts: [{ type: 'text' as const, text: 'hello' }],
    }];
    const conversations = [{
      id: 'thread-dina',
      title: 'hello',
      updatedAt: '2026-06-09T10:00:00.000Z',
      messageCount: 1,
      ref: { backend: 'codex' as const, threadId: 'thread-dina' },
    }];
    const sessionManager = createSessionManager({
      forkConversation: vi.fn().mockResolvedValue({
        threadId: 'thread-forked',
        messages,
      }),
      listConversations: vi.fn().mockResolvedValue(conversations),
      resumeConversation: vi.fn().mockResolvedValue({
        threadId: 'thread-dina',
        messages,
      }),
    });
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.listConversations(agent)).resolves.toStrictEqual(conversations);
    await expect(driver.resumeConversation(agent, { backend: 'codex', threadId: 'thread-dina' })).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-dina' },
    });
    expect(sessionManager.listConversations).toHaveBeenCalledWith(agent);
    expect(sessionManager.resumeConversation).toHaveBeenCalledWith(agent, 'thread-dina');
    await expect(driver.forkConversation(agent, targetAgent)).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-forked' },
    });
    await expect(driver.forkConversation(agent, targetAgent, 'turn-5')).resolves.toStrictEqual({
      backendSession: { kind: 'codex', threadId: 'thread-forked' },
    });
    expect(sessionManager.forkConversation).toHaveBeenNthCalledWith(1, agent, targetAgent);
    expect(sessionManager.forkConversation).toHaveBeenNthCalledWith(2, agent, targetAgent, 'turn-5');
  });

  it('loads one older history page through the session manager', async () => {
    const loadOlderHistory = vi.fn().mockResolvedValue({ hasOlder: true });
    const sessionManager = createSessionManager({ loadOlderHistory });
    const driver = new CodexBackendDriver(sessionManager);

    await expect(driver.loadOlderHistory(agent)).resolves.toStrictEqual({ hasOlder: true });
    expect(loadOlderHistory).toHaveBeenCalledWith(agent);
  });
});

function createSessionManager(overrides: Partial<CodexSurfaceAgentAdapter> = {}): CodexSurfaceAgentAdapter {
  return {
    compactThread: vi.fn().mockResolvedValue({ threadId: 'thread-compact' }),
    clearThreadGoal: vi.fn().mockResolvedValue({ threadId: 'thread-goal', cleared: true }),
    reviewThread: vi.fn().mockResolvedValue({ threadId: 'thread-review', turnId: 'turn-review' }),
    getRuntimeStatus: vi.fn().mockReturnValue({ backend: 'codex', status: 'notConfigured' }),
    sendPrompt: vi.fn().mockResolvedValue({ threadId: 'thread-review', turnId: 'turn-review' }),
    listConversations: vi.fn().mockResolvedValue([]),
    forkConversation: vi.fn().mockResolvedValue({ threadId: 'thread-forked' }),
    resumeConversation: vi.fn().mockResolvedValue({ threadId: 'thread-dina' }),
    readConversationMessages: vi.fn().mockResolvedValue([]),
    loadOlderHistory: vi.fn().mockResolvedValue({ hasOlder: false }),
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
  } as unknown as CodexSurfaceAgentAdapter;
}
