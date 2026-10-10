import type { AntigravityConversationEvent, AntigravityConversationSnapshot } from './contracts/antigravity-conversation';

/** Antigravity owns this replica; the app coordination reducer never contains its transcript. */
export function createAntigravityConversationReplica(initial: AntigravityConversationSnapshot) {
  let snapshot = structuredClone(initial);
  return {
    getSnapshot: () => snapshot,
    apply(event: AntigravityConversationEvent): AntigravityConversationSnapshot {
      if (event.agentId !== snapshot.agentId || event.sessionId !== snapshot.sessionId) throw new Error('Antigravity conversation identity mismatch.');
      const next = structuredClone(snapshot);
      switch (event.type) {
        case 'message.upsert': {
          const index = next.messages.findIndex(message => message.id === event.payload.message.id);
          if (index === -1) next.messages.push(structuredClone(event.payload.message));
          else next.messages[index] = structuredClone(event.payload.message);
          break;
        }
        case 'turn.started':
          if (next.busy) throw new Error('Antigravity prompts must be serialized.');
          next.activeTurnId = event.turnId;
          next.busy = true;
          next.error = null;
          next.turns.push({ id: event.turnId, status: 'inProgress', error: null, willRetry: false, startedAt: event.occurredAt, completedAt: null, durationMs: null });
          break;
        case 'turn.completed': {
          const turn = next.turns.find(value => value.id === event.turnId);
          if (turn) {
            turn.status = event.payload.turn.status; turn.completedAt = event.occurredAt;
            turn.durationMs = turn.startedAt ? Math.max(0, Date.parse(event.occurredAt) - Date.parse(turn.startedAt)) : null;
          }
          if (next.activeTurnId === event.turnId) {
            next.activeTurnId = null; next.busy = false; next.error = event.payload.error ?? null;
          }
          next.messages.filter(message => message.turnId === event.turnId && message.status === 'streaming')
            .forEach(message => { message.status = event.payload.turn.status === 'failed' ? 'error' : 'complete'; });
          break;
        }
        case 'request.created': next.clientRequests.push(structuredClone(event.payload.request)); break;
        case 'request.resolved':
          next.clientRequests = next.clientRequests.filter(request => request.id !== event.payload.id);
          if (!next.answeredClientRequestIds.includes(event.payload.id)) next.answeredClientRequestIds.push(event.payload.id);
          break;
        case 'context.updated': next.contextUsage = structuredClone(event.payload.usage); break;
      }
      snapshot = next;
      return snapshot;
    },
  };
}

export function emptyAntigravitySnapshot(agentId: string, sessionId: string): AntigravityConversationSnapshot {
  return { agentId, sessionId, activeTurnId: null, turns: [], messages: [], clientRequests: [],
    answeredClientRequestIds: [], busy: false, historyLoading: false,
    historyState: { hasOlder: false, loadingOlder: false }, contextUsage: null, error: null };
}
