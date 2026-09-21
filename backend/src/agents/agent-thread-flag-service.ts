import type { Agent } from '@codex-claw/core/contracts';
import type { ThreadFlagResponse } from '@codex-claw/core/thread-flags';

export const WORKTREE_DELEGATION_PROMPT = [
  'Delegate this implementation to a Codex Claw co-agent in a dedicated worktree.',
  'Use the current conversation as context, choose an appropriate branch name, and provide a self-contained handoff prompt.',
  'Use the create-agent tool with createWorktree set to true.',
].join(' ');

export class AgentThreadFlagService {
  private readonly inFlight = new Set<string>();

  constructor(private readonly options: {
    submit: (agent: Agent, prompt: string) => Promise<void>;
  }) {}

  async respond(agent: Agent, response: ThreadFlagResponse): Promise<void> {
    if (agent.threadFlags?.[response.id] !== true) {
      throw new Error('This thread flag is no longer active.');
    }
    if (!['execute', 'dismiss'].includes(response.action)) {
      throw new Error('Invalid thread flag action.');
    }
    const key = `${agent.id}:${response.id}`;
    if (this.inFlight.has(key)) throw new Error('This thread flag is already being handled.');

    this.inFlight.add(key);
    try {
      if (response.action === 'execute' && response.id === 'delegate_to_worktree') {
        await this.options.submit(agent, WORKTREE_DELEGATION_PROMPT);
      }
      if (agent.threadFlags?.[response.id] !== true) {
        throw new Error('The thread flag changed while the action was being submitted.');
      }
      const threadFlags = { ...agent.threadFlags };
      delete threadFlags[response.id];
      agent.threadFlags = Object.keys(threadFlags).length > 0 ? threadFlags : undefined;
      agent.updatedAt = new Date().toISOString();
    } finally {
      this.inFlight.delete(key);
    }
  }
}
