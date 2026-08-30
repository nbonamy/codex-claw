import {
  CodexAppBackendTtlCache,
  type CodexAppBackendTtlCacheScheduler,
} from '@codex-app-sdk/backend';
import type { AppSnapshot } from '@codex-claw/core/contracts';

export const DEFAULT_AGENT_TRANSCRIPT_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_AGENT_TRANSCRIPT_SWEEP_INTERVAL_MS = 60 * 1_000;

export type AgentTranscriptRetentionOptions = {
  snapshot: AppSnapshot;
  onEvicted(agentId: string): void | Promise<void>;
  ttlMs?: number;
  sweepIntervalMs?: number | null;
  now?: () => number;
  scheduler?: CodexAppBackendTtlCacheScheduler;
};

/**
 * Keeps recently selected or generating agent transcripts hot. Evicted
 * transcripts are rehydrated from the provider when the agent is selected.
 */
export class AgentTranscriptRetention {
  private readonly cache: CodexAppBackendTtlCache<string>;
  private closed = false;

  constructor(private readonly options: AgentTranscriptRetentionOptions) {
    this.cache = new CodexAppBackendTtlCache({
      ttlMs: options.ttlMs ?? DEFAULT_AGENT_TRANSCRIPT_TTL_MS,
      sweepIntervalMs: options.sweepIntervalMs === undefined
        ? DEFAULT_AGENT_TRANSCRIPT_SWEEP_INTERVAL_MS
        : options.sweepIntervalMs,
      identity: (agentId) => agentId,
      canEvict: (agentId) => this.canEvict(agentId),
      onEvict: (agentId) => this.evict(agentId),
      ...(options.now ? { now: options.now } : {}),
      ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    });
    for (const agent of options.snapshot.agents) this.cache.set(agent.id);
  }

  touch(agentId: string, activityAt?: number): void {
    if (this.closed) return;
    if (this.cache.touch(agentId, activityAt)) return;
    if (this.options.snapshot.agents.some((agent) => agent.id === agentId)) {
      this.cache.set(agentId, activityAt);
    }
  }

  delete(agentId: string): void {
    if (this.closed) return;
    this.cache.delete(agentId);
  }

  sweep(): Promise<readonly string[]> {
    return this.cache.sweep();
  }

  close(): Promise<void> {
    this.closed = true;
    return this.cache.close();
  }

  private canEvict(agentId: string): boolean {
    const { snapshot } = this.options;
    const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent || agent.id === snapshot.activeAgentId || agent.status.type !== 'idle') return false;
    if ((snapshot.queuedPrompts ?? []).some((prompt) => prompt.agentId === agentId)) return false;
    if ((snapshot.backendApprovals[agentId] ?? []).length > 0) return false;
    return snapshot.messages.some((message) => message.agentId === agentId);
  }

  private async evict(agentId: string): Promise<void> {
    await this.options.onEvicted(agentId);
    this.options.snapshot.messages = this.options.snapshot.messages.filter((message) => message.agentId !== agentId);
  }
}
