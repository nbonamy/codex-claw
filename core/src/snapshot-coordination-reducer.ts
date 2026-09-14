import type { AppSnapshot, TurnGitDiff } from './contracts';
import { setAgentStatusInSnapshot } from './agent-manager';
import type { SnapshotEventOwnedBy } from './snapshot-event-ownership';

/** Applies Claw-owned prompt, approval, and diff projections. */
export function applyCoordinationEventToSnapshot(
  snapshot: AppSnapshot,
  event: SnapshotEventOwnedBy<'coordination'>,
): void {
  if (!event.agentId) return;

  if (event.type === 'agent.promptQueued') {
    const queuedPrompts = snapshot.queuedPrompts ?? [];
    if (!queuedPrompts.some((prompt) => prompt.agentId === event.agentId && prompt.id === event.payload.id)) {
      snapshot.queuedPrompts = [...queuedPrompts, {
        id: event.payload.id,
        agentId: event.agentId,
        text: event.payload.text,
        createdAt: event.occurredAt,
        ...(event.payload.options ? { options: event.payload.options } : {}),
        ...(event.payload.submitted === true ? { submitted: true } : {}),
      }];
    }
    return;
  }

  if (event.type === 'agent.promptRetryScheduled') {
    const prompt = (snapshot.queuedPrompts ?? []).find((candidate) => (
      candidate.agentId === event.agentId && candidate.id === event.payload.id
    ));
    if (!prompt) return;
    prompt.attempts = event.payload.attempts;
    prompt.lastError = event.payload.lastError;
    prompt.submitted = true;
    if (event.payload.retryAt !== undefined) prompt.retryAt = event.payload.retryAt;
    else delete prompt.retryAt;
    return;
  }

  if (event.type === 'agent.promptDequeued') {
    const ids = new Set(event.payload.ids);
    snapshot.queuedPrompts = (snapshot.queuedPrompts ?? []).filter((prompt) => (
      prompt.agentId !== event.agentId || !ids.has(prompt.id)
    ));
    return;
  }

  if (event.type === 'backendApproval.requested') {
    const approvals = snapshot.backendApprovals[event.agentId] ?? [];
    snapshot.backendApprovals[event.agentId] = [
      ...approvals.filter((candidate) => candidate.id !== event.payload.approval.id),
      event.payload.approval,
    ];
    setAgentStatusInSnapshot(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: event.payload.approval.title,
    }, event.occurredAt);
    return;
  }

  if (event.type === 'backendApproval.resolved') {
    snapshot.backendApprovals[event.agentId] = (snapshot.backendApprovals[event.agentId] ?? [])
      .filter((candidate) => candidate.id !== event.payload.approval.id);
    return;
  }

  if (event.type === 'diff.updated') {
    const { addedLines, removedLines } = event.payload;
    if (!addedLines && !removedLines) return;
    const diff: TurnGitDiff = {
      agentId: event.agentId,
      turnId: event.turnId,
      addedLines,
      removedLines,
      updatedAt: event.occurredAt,
      ...(event.payload.diff ? { diff: event.payload.diff } : {}),
    };
    snapshot.turnGitDiffs = { ...snapshot.turnGitDiffs, [event.turnId]: diff };
    return;
  }

  const exhaustiveEvent: never = event;
  void exhaustiveEvent;
}
