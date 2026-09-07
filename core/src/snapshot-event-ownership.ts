import type { MainToRendererEvent } from './contracts';

export type SnapshotEventOwner = 'runtime' | 'coordination' | 'subagent' | 'renderer';

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
  'claude.conversationSnapshotChanged': 'renderer',
  'claude.conversationEventReceived': 'renderer',
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
  'thread.historyHydrationFailed': 'renderer',
  'subagent.operationChanged': 'subagent',
  'subagent.activityChanged': 'subagent',
  'subagent.identityChanged': 'subagent',
  'subagent.statusChanged': 'subagent',
  'agent.promptQueued': 'coordination',
  'agent.promptRetryScheduled': 'coordination',
  'agent.promptDequeued': 'coordination',
  'diff.updated': 'coordination',
  'file.activity': 'renderer',
  'git.statusUpdated': 'runtime',
  'backendApproval.requested': 'coordination',
  'backendApproval.resolved': 'coordination',
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
