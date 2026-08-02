import { describe, expect, it, vi } from 'vitest';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';
import type { Agent, RendererMessage } from '@codex-claw/shared/contracts';
import { AgentTranscriptRetention } from '../agent-transcript-retention';

describe('AgentTranscriptRetention', () => {
  it('evicts after the latest activity', async () => {
    let now = 0;
    const snapshot = createEmptySnapshot();
    snapshot.agents = [agent('active'), agent('background')];
    snapshot.activeAgentId = 'active';
    snapshot.messages = [...transcript('active'), ...transcript('background')];
    const onEvicted = vi.fn();
    const retention = new AgentTranscriptRetention({
      snapshot,
      onEvicted,
      ttlMs: 300,
      sweepIntervalMs: null,
      now: () => now,
    });

    retention.touch('background', 120);
    retention.touch('background', 110);
    now = 419;
    await expect(retention.sweep()).resolves.toStrictEqual([]);
    now = 420;
    await expect(retention.sweep()).resolves.toStrictEqual(['background']);

    expect(snapshot.messages.every((message) => message.agentId === 'active')).toBe(true);
    expect(onEvicted).toHaveBeenCalledWith('background');
    await retention.close();
  });

  it('keeps active, generating, queued, and approval-blocked agents hot', async () => {
    let now = 0;
    const snapshot = createEmptySnapshot();
    snapshot.agents = [
      agent('active'),
      agent('working', { type: 'working' }),
      agent('queued'),
      agent('approval'),
    ];
    snapshot.activeAgentId = 'active';
    snapshot.messages = snapshot.agents.flatMap((candidate) => transcript(candidate.id));
    snapshot.queuedPrompts = [{
      id: 'prompt-queued',
      agentId: 'queued',
      text: 'later',
      createdAt: '2026-08-02T00:00:00.000Z',
    }];
    snapshot.backendApprovals.approval = [{
      id: 'approval-1',
      kind: 'command',
      conversationId: 'thread-approval',
      itemId: 'item-approval',
      title: 'Allow command',
    }];
    const retention = new AgentTranscriptRetention({
      snapshot,
      onEvicted: vi.fn(),
      ttlMs: 1,
      sweepIntervalMs: null,
      now: () => now,
    });

    now = 1;
    await expect(retention.sweep()).resolves.toStrictEqual([]);
    expect(snapshot.messages).toHaveLength(8);
    await retention.close();
  });

  it('ignores late activity after shutdown', async () => {
    const snapshot = createEmptySnapshot();
    snapshot.agents = [agent('late')];
    const retention = new AgentTranscriptRetention({
      snapshot,
      onEvicted: vi.fn(),
      sweepIntervalMs: null,
    });

    await retention.close();
    expect(() => retention.touch('late')).not.toThrow();
    expect(() => retention.delete('late')).not.toThrow();
  });
});

function agent(id: string, status: Agent['status'] = { type: 'idle' }): Agent {
  return {
    id,
    name: id,
    folder: `/tmp/${id}`,
    backend: 'codex',
    backendSession: { kind: 'codex', threadId: `thread-${id}` },
    status,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

function transcript(agentId: string): RendererMessage[] {
  return [
    {
      id: `${agentId}-user`,
      agentId,
      role: 'user',
      status: 'complete',
      createdAt: '2026-08-02T00:00:00.000Z',
      parts: [{ type: 'text', text: 'Inspect this repository' }],
    },
    {
      id: `${agentId}-assistant`,
      agentId,
      role: 'assistant',
      status: 'complete',
      createdAt: '2026-08-02T00:00:01.000Z',
      parts: [{
        type: 'tool',
        id: `${agentId}-tool`,
        kind: 'command',
        title: 'Ran rg --files',
        status: 'completed',
        input: { cmd: 'rg --files' },
        output: 'README.md',
      }],
    },
  ];
}
