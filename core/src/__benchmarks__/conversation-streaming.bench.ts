import { bench, describe } from 'vitest';
import type { Agent, AppSnapshot, MainToRendererEvent, RendererMessage } from '../contracts';
import { applyMainEventToSnapshot, createEmptySnapshot } from '../snapshot';

const AGENT_COUNT = 5;
const MESSAGES_PER_AGENT = 400;
const STREAM_DELTAS = 2_000;

describe('five-agent renderer replica', () => {
  bench('hydrates long transcripts and reduces interleaved streaming events', () => {
    const snapshot = longConversationSnapshot();
    for (let index = 0; index < STREAM_DELTAS; index += 1) {
      const agentIndex = index % AGENT_COUNT;
      applyMainEventToSnapshot(snapshot, deltaEvent(index, `benchmark-agent-${agentIndex}`));
    }

    const streamingMessages = snapshot.messages.filter((message) => message.status === 'streaming');
    if (streamingMessages.length !== AGENT_COUNT) {
      throw new Error('The benchmark did not retain one streaming message per agent');
    }
  }, {
    iterations: 10,
    time: 0,
    warmupIterations: 2,
    warmupTime: 0,
  });
});

function longConversationSnapshot(): AppSnapshot {
  const snapshot = createEmptySnapshot();
  snapshot.agents = Array.from({ length: AGENT_COUNT }, (_, index) => benchmarkAgent(index));
  snapshot.teams[0]!.agentIds = snapshot.agents.map((agent) => agent.id);
  snapshot.teams[0]!.activeAgentId = snapshot.agents[0]!.id;
  snapshot.activeAgentId = snapshot.agents[0]!.id;
  snapshot.messages = snapshot.agents.flatMap((agent) => Array.from(
    { length: MESSAGES_PER_AGENT },
    (_, index): RendererMessage => ({
      id: `${agent.id}-message-${index}`,
      agentId: agent.id,
      role: index % 2 === 0 ? 'user' : 'assistant',
      status: 'complete',
      createdAt: new Date(1_700_000_000_000 + index).toISOString(),
      parts: [{ type: 'text', text: `Historical message ${index}` }],
    }),
  ));
  return snapshot;
}

function benchmarkAgent(index: number): Agent {
  return {
    id: `benchmark-agent-${index}`,
    teamId: 'team-codex-claw',
    name: `Agent ${index}`,
    folder: `/tmp/benchmark-agent-${index}`,
    backend: 'codex',
    backendSession: { kind: 'codex', threadId: `benchmark-thread-${index}` },
    status: { type: 'working' },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

function deltaEvent(sequence: number, agentId: string): MainToRendererEvent {
  return {
    seq: sequence + 1,
    agentId,
    backend: 'codex',
    backendSessionId: `benchmark-thread-${agentId}`,
    threadId: `benchmark-thread-${agentId}`,
    turnId: `benchmark-turn-${agentId}`,
    type: 'message.delta',
    payload: { delta: 'x' },
    occurredAt: '2026-08-02T00:00:00.000Z',
  };
}
