import type { MainToRendererEvent } from './contracts';

export type SnapshotEventOwner = 'runtime' | 'conversation' | 'subagent' | 'renderer';

export const snapshotEventOwnership = {
  'backend.statusChanged': 'runtime',
  'client.connectionChanged': 'renderer',
  'snapshot.updated': 'runtime',
  'account.rateLimitsUpdated': 'runtime',
  'devicePairing.statusChanged': 'renderer',
  'models.changed': 'renderer',
  'skills.changed': 'renderer',
  'codex.conversationSnapshotChanged': 'renderer',
  'codex.conversationEventReceived': 'renderer',
  'sidePanel.markdownRequested': 'renderer',
  'sidePanel.gitDiffRequested': 'renderer',
  'celebration.requested': 'renderer',
  'agentCreation.progress': 'renderer',
  'git.operationProgress': 'renderer',
  'browser.annotationCreated': 'renderer',
  'workBacklog.assignmentUpdated': 'runtime',
  'clientRequest.resolved': 'renderer',
  'agent.updated': 'runtime',
  'agent.statusChanged': 'runtime',
  'thread.started': 'runtime',
  'thread.settingsUpdated': 'runtime',
  'thread.modeUpdated': 'renderer',
  'thread.goalUpdated': 'runtime',
  'thread.goalCleared': 'runtime',
  'thread.tokenUsageUpdated': 'runtime',
  'thread.historyLoaded': 'conversation',
  'thread.historyHydrationFailed': 'renderer',
  'subagent.operationChanged': 'subagent',
  'subagent.activityChanged': 'subagent',
  'subagent.identityChanged': 'subagent',
  'subagent.statusChanged': 'subagent',
  'turn.started': 'conversation',
  'turn.planUpdated': 'conversation',
  'turn.proposedPlanDelta': 'conversation',
  'turn.proposedPlanCompleted': 'conversation',
  'turn.completed': 'conversation',
  'context.compactionStarted': 'conversation',
  'context.compactionCompleted': 'conversation',
  'message.delta': 'conversation',
  'message.updated': 'conversation',
  'message.userSubmitted': 'conversation',
  'message.steer': 'conversation',
  'agent.promptQueued': 'conversation',
  'agent.promptRetryScheduled': 'conversation',
  'agent.promptDequeued': 'conversation',
  'item.started': 'conversation',
  'item.updated': 'conversation',
  'item.completed': 'conversation',
  'diff.updated': 'conversation',
  'file.activity': 'renderer',
  'git.statusUpdated': 'runtime',
  'approval.requested': 'conversation',
  'toolInput.requested': 'conversation',
  'backendApproval.requested': 'conversation',
  'backendApproval.resolved': 'conversation',
  error: 'conversation',
} as const satisfies Record<MainToRendererEvent['type'], SnapshotEventOwner>;

export type SnapshotEventTypeOwnedBy<Owner extends SnapshotEventOwner> = {
  [Type in keyof typeof snapshotEventOwnership]:
    (typeof snapshotEventOwnership)[Type] extends Owner ? Type : never;
}[keyof typeof snapshotEventOwnership];

export type SnapshotEventOwnedBy<Owner extends SnapshotEventOwner> = Extract<
  MainToRendererEvent,
  { type: SnapshotEventTypeOwnedBy<Owner> }
>;

export type RendererOnlySnapshotEvent = SnapshotEventOwnedBy<'renderer'>;

export function isSnapshotEventOwnedBy<Owner extends SnapshotEventOwner>(
  event: MainToRendererEvent,
  owner: Owner,
): event is SnapshotEventOwnedBy<Owner> {
  return snapshotEventOwnership[event.type] === owner;
}
