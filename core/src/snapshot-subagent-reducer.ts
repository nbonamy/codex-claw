import type {
  AgentSubagentTree,
  AppSnapshot,
  SubagentIdentityChange,
  SubagentStatusChange,
} from './contracts';
import type { SnapshotEventOwnedBy } from './snapshot-event-ownership';
import {
  isSubagentActivityKind,
  isSubagentOperationKind,
  isSubagentOperationLifecycle,
  isSubagentOperationStatus,
  isSubagentStatus,
} from './subagent-values';

export function applySubagentEventToSnapshot(
  snapshot: AppSnapshot,
  event: SnapshotEventOwnedBy<'subagent'>,
): void {
  if (!event.agentId) return;

  if (event.type === 'subagent.operationChanged') {
    applySubagentOperationChange(snapshot, event.agentId, event.payload);
    return;
  }

  if (event.type === 'subagent.activityChanged') {
    applySubagentActivityChange(snapshot, event.agentId, event.payload);
    return;
  }

  if (event.type === 'subagent.identityChanged') {
    applySubagentIdentityChange(snapshot, event.agentId, event.payload);
    return;
  }

  if (event.type === 'subagent.statusChanged') {
    applySubagentStatusChange(snapshot, event.agentId, event.payload, event.occurredAt);
    return;
  }

  const exhaustiveEvent: never = event;
  void exhaustiveEvent;
}

function applySubagentOperationChange(snapshot: AppSnapshot, agentId: string, value: unknown): void {
  if (!isRecord(value) || typeof value.rootConversationId !== 'string' || !isRecord(value.operation)) return;
  const operation = value.operation;
  if (
    typeof operation.id !== 'string' ||
    !isSubagentOperationKind(operation.kind) ||
    !isSubagentOperationLifecycle(operation.lifecycle) ||
    !isSubagentOperationStatus(operation.status) ||
    typeof operation.senderConversationId !== 'string' ||
    !Array.isArray(operation.receiverConversationIds) ||
    operation.receiverConversationIds.some((id) => typeof id !== 'string') ||
    typeof operation.occurredAt !== 'string'
  ) return;

  const tree = ensureSubagentTree(snapshot, agentId, value.rootConversationId);
  const receiverConversationIds = [...operation.receiverConversationIds] as string[];
  tree.operations[operation.id] = {
    id: operation.id,
    ...(typeof operation.turnId === 'string' ? { turnId: operation.turnId } : {}),
    lifecycle: operation.lifecycle,
    kind: operation.kind,
    status: operation.status,
    senderConversationId: operation.senderConversationId,
    receiverConversationIds,
    ...(typeof operation.prompt === 'string' ? { prompt: operation.prompt } : {}),
    ...(typeof operation.model === 'string' ? { model: operation.model } : {}),
    ...(typeof operation.reasoningEffort === 'string' ? { reasoningEffort: operation.reasoningEffort } : {}),
    occurredAt: operation.occurredAt,
  };

  const agentStates = isRecord(value.agentStates) ? value.agentStates : {};
  const conversationIds = new Set([...receiverConversationIds, ...Object.keys(agentStates)]);
  for (const conversationId of conversationIds) {
    if (conversationId === value.rootConversationId) continue;
    const state = isRecord(agentStates[conversationId]) ? agentStates[conversationId] : null;
    const status = state && isSubagentStatus(state.status) ? state.status : null;
    const existing = tree.nodes[conversationId];
    tree.nodes[conversationId] = {
      conversationId,
      parentConversationId: existing?.parentConversationId ?? operation.senderConversationId,
      createdAt: existing?.createdAt ?? operation.occurredAt,
      status: status ?? existing?.status ?? 'pendingInit',
      ...(typeof state?.message === 'string'
        ? { statusMessage: state.message }
        : existing?.statusMessage ? { statusMessage: existing.statusMessage } : {}),
      ...(existing?.agentPath ? { agentPath: existing.agentPath } : {}),
      ...(existing?.agentNickname ? { agentNickname: existing.agentNickname } : {}),
      ...(existing?.agentRole ? { agentRole: existing.agentRole } : {}),
      ...(typeof operation.prompt === 'string'
        ? { prompt: operation.prompt }
        : existing?.prompt ? { prompt: existing.prompt } : {}),
      ...(typeof operation.model === 'string'
        ? { model: operation.model }
        : existing?.model ? { model: existing.model } : {}),
      ...(typeof operation.reasoningEffort === 'string'
        ? { reasoningEffort: operation.reasoningEffort }
        : existing?.reasoningEffort ? { reasoningEffort: existing.reasoningEffort } : {}),
      updatedAt: operation.occurredAt,
    };
  }
}

function applySubagentActivityChange(snapshot: AppSnapshot, agentId: string, value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.rootConversationId !== 'string' ||
    typeof value.parentConversationId !== 'string' ||
    !isRecord(value.activity)
  ) return;
  const activity = value.activity;
  if (
    typeof activity.id !== 'string' ||
    !isSubagentOperationLifecycle(activity.lifecycle) ||
    !isSubagentActivityKind(activity.kind) ||
    typeof activity.conversationId !== 'string' ||
    typeof activity.agentPath !== 'string' ||
    typeof activity.occurredAt !== 'string'
  ) return;
  if (activity.conversationId === value.rootConversationId) return;

  const tree = ensureSubagentTree(snapshot, agentId, value.rootConversationId);
  tree.activities[activity.id] = {
    id: activity.id,
    ...(typeof activity.turnId === 'string' ? { turnId: activity.turnId } : {}),
    lifecycle: activity.lifecycle,
    kind: activity.kind,
    conversationId: activity.conversationId,
    agentPath: activity.agentPath,
    occurredAt: activity.occurredAt,
  };
  const existing = tree.nodes[activity.conversationId];
  tree.nodes[activity.conversationId] = {
    conversationId: activity.conversationId,
    parentConversationId: existing?.parentConversationId ?? value.parentConversationId,
    createdAt: existing?.createdAt ?? activity.occurredAt,
    status: activity.kind === 'interrupted' ? 'interrupted' : existing?.status ?? 'running',
    ...(existing?.statusMessage ? { statusMessage: existing.statusMessage } : {}),
    agentPath: activity.agentPath,
    ...(existing?.agentNickname ? { agentNickname: existing.agentNickname } : {}),
    ...(existing?.agentRole ? { agentRole: existing.agentRole } : {}),
    ...(existing?.prompt ? { prompt: existing.prompt } : {}),
    ...(existing?.model ? { model: existing.model } : {}),
    ...(existing?.reasoningEffort ? { reasoningEffort: existing.reasoningEffort } : {}),
    updatedAt: activity.occurredAt,
  };
}

function applySubagentIdentityChange(snapshot: AppSnapshot, agentId: string, value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.rootConversationId !== 'string' ||
    typeof value.conversationId !== 'string'
  ) return;
  const tree = snapshot.subagentTrees[agentId];
  if (!tree || tree.rootConversationId !== value.rootConversationId) return;
  const existing = tree.nodes[value.conversationId];
  if (!existing) return;
  const change: SubagentIdentityChange = {
    rootConversationId: value.rootConversationId,
    conversationId: value.conversationId,
    ...(typeof value.agentNickname === 'string' ? { agentNickname: value.agentNickname } : {}),
    ...(typeof value.agentRole === 'string' ? { agentRole: value.agentRole } : {}),
  };
  const updatedNode = { ...existing };
  if (change.agentNickname) updatedNode.agentNickname = change.agentNickname;
  else delete updatedNode.agentNickname;
  if (change.agentRole) updatedNode.agentRole = change.agentRole;
  else delete updatedNode.agentRole;
  tree.nodes[value.conversationId] = updatedNode;
}

function applySubagentStatusChange(
  snapshot: AppSnapshot,
  agentId: string,
  value: unknown,
  occurredAt: string,
): void {
  if (
    !isRecord(value) ||
    typeof value.rootConversationId !== 'string' ||
    typeof value.conversationId !== 'string' ||
    !isSubagentStatus(value.status)
  ) return;
  if (value.conversationId === value.rootConversationId) return;

  const tree = snapshot.subagentTrees[agentId];
  if (!tree || tree.rootConversationId !== value.rootConversationId) return;
  const existing = tree.nodes[value.conversationId];
  if (!existing) return;
  const change: SubagentStatusChange = {
    rootConversationId: value.rootConversationId,
    conversationId: value.conversationId,
    status: value.status,
    ...(typeof value.statusMessage === 'string' ? { statusMessage: value.statusMessage } : {}),
  };
  const updatedNode = {
    ...existing,
    status: change.status,
    updatedAt: occurredAt,
  };
  if (change.statusMessage) updatedNode.statusMessage = change.statusMessage;
  else delete updatedNode.statusMessage;
  tree.nodes[value.conversationId] = updatedNode;
}

function ensureSubagentTree(snapshot: AppSnapshot, agentId: string, rootConversationId: string): AgentSubagentTree {
  const existing = snapshot.subagentTrees[agentId];
  if (existing?.rootConversationId === rootConversationId) return existing;
  const created: AgentSubagentTree = {
    rootConversationId,
    nodes: {},
    operations: {},
    activities: {},
  };
  snapshot.subagentTrees[agentId] = created;
  return created;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
