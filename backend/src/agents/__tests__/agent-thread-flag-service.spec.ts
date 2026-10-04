import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { AgentThreadFlagService } from '../agent-thread-flag-service';
import { WORKTREE_DELEGATION_PROMPT } from '../worktree-delegation';

describe('AgentThreadFlagService', () => {
  it('submits the fixed delegation prompt and clears the flag only after acceptance', async () => {
    const agent = createInitialSnapshot().agents[0]!;
    agent.threadFlags = { delegate_to_worktree: true };
    const submit = vi.fn().mockResolvedValue(undefined);
    const service = new AgentThreadFlagService({ submit });

    await service.respond(agent, { id: 'delegate_to_worktree', action: 'execute' });

    expect(submit).toHaveBeenCalledExactlyOnceWith(agent, WORKTREE_DELEGATION_PROMPT);
    expect(agent.threadFlags).toBeUndefined();
  });

  it('preserves the flag when prompt submission fails so the action can be retried', async () => {
    const agent = createInitialSnapshot().agents[0]!;
    agent.threadFlags = { delegate_to_worktree: true };
    const submit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const service = new AgentThreadFlagService({ submit });

    await expect(service.respond(agent, { id: 'delegate_to_worktree', action: 'execute' })).rejects.toThrow('offline');
    expect(agent.threadFlags).toStrictEqual({ delegate_to_worktree: true });
    await service.respond(agent, { id: 'delegate_to_worktree', action: 'execute' });
    expect(agent.threadFlags).toBeUndefined();
  });

  it('clears review readiness without submitting a conversation prompt', async () => {
    const agent = createInitialSnapshot().agents[0]!;
    agent.threadFlags = { ready_for_review: true };
    const submit = vi.fn();
    const service = new AgentThreadFlagService({ submit });

    await service.respond(agent, { id: 'ready_for_review', action: 'execute' });

    expect(submit).not.toHaveBeenCalled();
    expect(agent.threadFlags).toBeUndefined();
  });

  it('dismisses without prompting and rejects stale or concurrent actions', async () => {
    const agent = createInitialSnapshot().agents[0]!;
    agent.threadFlags = { delegate_to_worktree: true };
    let accept!: () => void;
    const submit = vi.fn(() => new Promise<void>((resolve) => { accept = resolve; }));
    const service = new AgentThreadFlagService({ submit });
    const pending = service.respond(agent, { id: 'delegate_to_worktree', action: 'execute' });
    await expect(service.respond(agent, { id: 'delegate_to_worktree', action: 'dismiss' })).rejects.toThrow('already being handled');
    accept();
    await pending;
    await expect(service.respond(agent, { id: 'delegate_to_worktree', action: 'dismiss' })).rejects.toThrow('no longer active');

    agent.threadFlags = { delegate_to_worktree: true };
    await service.respond(agent, { id: 'delegate_to_worktree', action: 'dismiss' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('rejects response actions outside the app-owned contract', async () => {
    const agent = createInitialSnapshot().agents[0]!;
    agent.threadFlags = { delegate_to_worktree: true };
    const service = new AgentThreadFlagService({ submit: vi.fn() });

    await expect(service.respond(agent, {
      id: 'delegate_to_worktree',
      action: 'invent-ui',
    } as never)).rejects.toThrow('Invalid thread flag action');
  });
});
