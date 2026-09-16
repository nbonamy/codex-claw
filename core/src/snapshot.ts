import type { AppSnapshot, MainToRendererEvent } from './contracts';
import { applyCoordinationEventToSnapshot } from './snapshot-coordination-reducer';
import { isSnapshotEventOwnedBy } from './snapshot-event-ownership';
import { applyRuntimeEventToSnapshot } from './snapshot-runtime-reducer';
import { applySubagentEventToSnapshot } from './snapshot-subagent-reducer';

export {
  createEmptySnapshot,
  createInitialSnapshot,
  replaceAppSnapshot,
} from './snapshot-construction';

export function applyMainEventToSnapshot(snapshot: AppSnapshot, event: MainToRendererEvent): void {
  if (
    event.type === 'agent.conversationAttached' &&
    event.agentId &&
    snapshot.subagentTrees[event.agentId]?.rootConversationId !== event.conversationId
  ) {
    delete snapshot.subagentTrees[event.agentId];
  }
  if (isSnapshotEventOwnedBy(event, 'renderer')) return;
  if (isSnapshotEventOwnedBy(event, 'runtime')) {
    applyRuntimeEventToSnapshot(snapshot, event);
    return;
  }
  if (isSnapshotEventOwnedBy(event, 'subagent')) {
    applySubagentEventToSnapshot(snapshot, event);
    return;
  }
  if (isSnapshotEventOwnedBy(event, 'coordination')) {
    applyCoordinationEventToSnapshot(snapshot, event);
    return;
  }

  const exhaustiveEvent: never = event;
  void exhaustiveEvent;
}
