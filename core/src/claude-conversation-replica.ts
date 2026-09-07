import type {
  Agent,
  AppSnapshot,
  ClaudeConversationEvent,
  ClaudeConversationSnapshot,
  ClaudeConversationTurn,
} from './contracts';
import { applyConversationEventToSnapshot } from './snapshot-conversation-reducer';
import type { SnapshotEventOwnedBy } from './snapshot-event-ownership';
import { createEmptySnapshot } from './snapshot-construction';

export type ClaudeConversationReplica = {
  apply(event: ClaudeConversationEvent): ClaudeConversationSnapshot;
  getSnapshot(): ClaudeConversationSnapshot;
};

export function createClaudeConversationReplica(
  initialSnapshot: ClaudeConversationSnapshot,
): ClaudeConversationReplica {
  const state = replicaState(initialSnapshot);
  let snapshot = projectSnapshot(state, initialSnapshot);

  return {
    apply(event) {
      if (event.agentId !== snapshot.agentId) {
        throw new Error(`Claude conversation event belongs to '${event.agentId}', expected '${snapshot.agentId}'.`);
      }
      if (event.type === 'clientRequest.resolved') {
        if (!snapshot.answeredClientRequestIds.includes(event.payload.id)) {
          snapshot = {
            ...snapshot,
            answeredClientRequestIds: [...snapshot.answeredClientRequestIds, event.payload.id],
          };
        }
        return snapshot;
      }

      const replicaEvent = structuredClone(event);
      applyConversationEventToSnapshot(
        state,
        replicaEvent as SnapshotEventOwnedBy<'conversation'>,
      );
      snapshot = projectSnapshot(state, applyTurnLifecycle(snapshot, event));
      return snapshot;
    },
    getSnapshot() {
      return snapshot;
    },
  };
}

function replicaState(initialSnapshot: ClaudeConversationSnapshot): AppSnapshot {
  const state = createEmptySnapshot();
  state.agents = [replicaAgent(initialSnapshot)];
  state.messages = [...initialSnapshot.messages];
  return state;
}

function replicaAgent(snapshot: ClaudeConversationSnapshot): Agent {
  return {
    id: snapshot.agentId,
    name: snapshot.agentId,
    folder: null,
    backend: 'claude',
    ...(snapshot.sessionId ? {
      backendSession: { kind: 'claude', sessionId: snapshot.sessionId, transport: 'stdio' },
    } : {}),
    ...(snapshot.contextUsage ? { contextUsage: snapshot.contextUsage } : {}),
    ...(snapshot.plan ? { plan: snapshot.plan } : {}),
    status: snapshot.busy ? { type: 'working' } : { type: 'idle' },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function applyTurnLifecycle(
  snapshot: ClaudeConversationSnapshot,
  event: ClaudeConversationEvent,
): ClaudeConversationSnapshot {
  if (event.type === 'turn.started') {
    return {
      ...snapshot,
      activeTurnId: event.turnId,
      turnIds: snapshot.turnIds.includes(event.turnId)
        ? snapshot.turnIds
        : [...snapshot.turnIds, event.turnId],
      turns: upsertTurn(snapshot.turns, {
        id: event.turnId,
        status: 'inProgress',
        error: null,
        willRetry: false,
        startedAt: event.occurredAt,
        completedAt: null,
        durationMs: null,
      }),
      busy: true,
      error: null,
    };
  }
  if (event.type === 'turn.completed') {
    return {
      ...snapshot,
      activeTurnId: snapshot.activeTurnId === event.turnId ? null : snapshot.activeTurnId,
      turns: completeTurn(snapshot.turns, event),
      busy: false,
    };
  }
  if (event.type === 'error' && event.payload.willRetry !== true) {
    return { ...snapshot, error: event.payload.message };
  }
  return snapshot;
}

function completeTurn(
  turns: ClaudeConversationTurn[],
  event: Extract<ClaudeConversationEvent, { type: 'turn.completed' }>,
): ClaudeConversationTurn[] {
  const existing = turns.find((candidate) => candidate.id === event.turnId);
  const startedAt = existing?.startedAt ?? null;
  const completedAt = event.occurredAt;
  return upsertTurn(turns, {
    id: event.turnId,
    status: event.payload.turn.status,
    error: null,
    willRetry: false,
    startedAt,
    completedAt,
    durationMs: startedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null,
  });
}

function projectSnapshot(
  state: AppSnapshot,
  snapshot: ClaudeConversationSnapshot,
): ClaudeConversationSnapshot {
  const agent = state.agents[0];
  return {
    ...snapshot,
    messages: [...state.messages],
    contextUsage: agent?.contextUsage ?? snapshot.contextUsage,
    plan: agent?.plan ?? null,
  };
}

function upsertTurn(
  turns: ClaudeConversationTurn[],
  turn: ClaudeConversationTurn,
): ClaudeConversationTurn[] {
  const index = turns.findIndex((candidate) => candidate.id === turn.id);
  if (index === -1) return [...turns, turn];
  const next = [...turns];
  next[index] = turn;
  return next;
}
