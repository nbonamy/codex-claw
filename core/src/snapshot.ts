import type { AppSnapshot, MainToRendererEvent } from './contracts';
import { applyConversationEventToSnapshot } from './snapshot-conversation-reducer';
import { applyRuntimeEventToSnapshot } from './snapshot-runtime-reducer';
import { applySubagentEventToSnapshot } from './snapshot-subagent-reducer';

export {
  createAgentFromInput,
  createAgentInSnapshot,
  createQuickChatInSnapshot,
  selectAgent,
  updateAgentFolder,
  updateAgentFromInput,
  updateAgentOpenInApplication,
  updateAgentWorkspace,
} from './agent-manager';

export {
  createDefaultRemoteConnectionsState,
  createEmptySnapshot,
  createInitialSnapshot,
  applySnapshotMetadata,
  snapshotMetadata,
} from './snapshot-construction';

export {
  appendSteerPrompt,
  appendSystemMessage,
  appendUserPrompt,
} from './snapshot-conversation-transcript';

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
  if (applyRuntimeEventToSnapshot(snapshot, event)) return;
  if (!event.agentId) return;

  if (
    event.type === 'subagent.operationChanged' ||
    event.type === 'subagent.activityChanged' ||
    event.type === 'subagent.identityChanged' ||
    event.type === 'subagent.statusChanged'
  ) {
    applySubagentEventToSnapshot(snapshot, event);
    return;
  }

  applyConversationEventToSnapshot(snapshot, event);
}

function normalizedFolder(folder: string): string {
  return folder.trim();
}

function folderBasename(folder: string): string {
  return normalizedFolder(folder).split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}
