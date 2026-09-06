import type { AppSnapshot, MainToRendererEvent } from './contracts';
import { applyConversationEventToSnapshot } from './snapshot-conversation-reducer';
import { isSnapshotEventOwnedBy } from './snapshot-event-ownership';
import { applyRuntimeEventToSnapshot } from './snapshot-runtime-reducer';
import { applySubagentEventToSnapshot } from './snapshot-subagent-reducer';

export {
  createEmptySnapshot,
  createInitialSnapshot,
  applySnapshotMetadata,
  snapshotMetadata,
} from './snapshot-construction';

export { appendUserPrompt } from './snapshot-conversation-transcript';

export { formatThreadPlanMarkdown } from './snapshot-conversation-plans';

export function applyMainEventToSnapshot(snapshot: AppSnapshot, event: MainToRendererEvent): void {
  if (
    event.type === 'thread.started' &&
    event.agentId &&
    event.threadId &&
    snapshot.subagentTrees[event.agentId]?.rootConversationId !== event.threadId
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
  if (isSnapshotEventOwnedBy(event, 'conversation')) {
    applyConversationEventToSnapshot(snapshot, event);
    return;
  }

  const exhaustiveEvent: never = event;
  void exhaustiveEvent;
}
