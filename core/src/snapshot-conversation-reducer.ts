import type { AppSnapshot, SendPromptOptions } from './contracts';
import {
  findAgentInSnapshot as findAgent,
  setAgentStatusInSnapshot as setAgentStatus,
} from './agent-manager';
import {
  askUserRequest,
  backendApprovalRequest,
  confirmToolRequest,
  isRecord,
  promptAttachments,
  rendererMessages,
  rendererToolPart,
} from './snapshot-conversation-payloads';
import {
  appendCompactionMarker,
  appendSteerPrompt,
  appendSystemMessage,
  assistantMessageId,
  completeAssistantMessage,
  ensureAssistantMessage,
  findCompactionMessages,
  hydrateAgentMessages,
  pruneSupersededEmptyAssistantPlaceholders,
} from './snapshot-conversation-transcript';
import {
  applyApprovalRequest,
  applyToolInputRequest,
  updateAssistantToolPart,
  updateAssistantTurnDiff,
  updateTurnGitDiff,
  upsertAssistantToolPart,
} from './snapshot-conversation-tools';
import {
  appendAgentPlanMarkdownDelta,
  appendAssistantDeltaWithPlanFilter,
  finalizedThreadPlanStatus,
  planProgressOperation,
  threadPlan,
  updateAgentPlanMarkdown,
  upsertPlanProgressToolPart,
} from './snapshot-conversation-plans';
import type { SnapshotEventOwnedBy } from './snapshot-event-ownership';

export function applyConversationEventToSnapshot(
  snapshot: AppSnapshot,
  event: SnapshotEventOwnedBy<'conversation'>,
): void {
  if (!event.agentId) return;

  if (event.type === 'thread.historyLoaded') {
    const payload = event.payload as { messages?: unknown };
    const messages = rendererMessages(payload.messages, event.agentId);
    const replace = isRecord(event.payload) && event.payload.replace === true;
    const preserveKnownTurns = isRecord(event.payload) && event.payload.preserveKnownTurns === true;
    const preserveKnownMessages = isRecord(event.payload) && event.payload.preserveKnownMessages === true;
    hydrateAgentMessages(snapshot, event.agentId, messages, {
      preserveKnownMessages,
      preserveKnownTurns,
      replace,
    });
    return;
  }

  if (event.type === 'turn.started') {
    if (event.turnId) {
      ensureAssistantMessage(snapshot, event.agentId, event.turnId, assistantMessageId(event.turnId), event.occurredAt);
      pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    }
    setAgentStatus(snapshot, event.agentId, { type: 'working' });
    return;
  }

  if (event.type === 'turn.planUpdated') {
    if (!event.threadId || !event.turnId) return;
    const agent = findAgent(snapshot, event.agentId);
    const plan = threadPlan(event.payload, event.threadId, event.turnId, event.occurredAt);
    if (agent && plan) {
      const operation = planProgressOperation(agent, event.turnId);
      agent.plan = plan;
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, plan.markdown, 'completed', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanDelta') {
    if (!event.threadId || !event.turnId) return;
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    appendAgentPlanMarkdownDelta(agent, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'running', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanCompleted') {
    if (!event.threadId || !event.turnId) return;
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    updateAgentPlanMarkdown(agent, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'completed', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'message.delta') {
    if (!event.turnId) return;
    const payload = event.payload as { delta?: unknown; itemId?: unknown; phase?: unknown };
    const agent = findAgent(snapshot, event.agentId);
    appendAssistantDeltaWithPlanFilter(
      snapshot,
      event.agentId,
      agent,
      typeof event.threadId === 'string' ? event.threadId : undefined,
      event.turnId,
      typeof payload.delta === 'string' ? payload.delta : '',
      typeof payload.itemId === 'string' ? payload.itemId : undefined,
      event.occurredAt,
      payload.phase === 'commentary' || payload.phase === 'final_answer' ? payload.phase : undefined,
    );
    return;
  }

  if (event.type === 'message.updated') {
    const payload: Record<string, unknown> = isRecord(event.payload) ? event.payload : {};
    const [message] = rendererMessages([payload['message']], event.agentId);
    if (!message) return;
    const messageIndex = snapshot.messages.findIndex((candidate) => (
      candidate.agentId === event.agentId && candidate.id === message.id
    ));
    if (messageIndex === -1) snapshot.messages.push(message);
    else snapshot.messages.splice(messageIndex, 1, message);
    pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    return;
  }

  if (event.type === 'message.userSubmitted') {
    const payload: Record<string, unknown> = isRecord(event.payload) ? event.payload : {};
    const [message] = rendererMessages([payload['message']], event.agentId);
    if (message && !snapshot.messages.some((candidate) => candidate.id === message.id)) {
      snapshot.messages.push(message);
      pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    }
    return;
  }

  if (event.type === 'message.steer') {
    if (!event.turnId) return;
    const payload = event.payload as { prompt?: unknown; attachments?: unknown };
    if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
      appendSteerPrompt(
        snapshot,
        event.agentId,
        event.turnId,
        payload.prompt,
        event.occurredAt,
        promptAttachments(payload.attachments),
      );
    }
    return;
  }

  if (event.type === 'agent.promptQueued') {
    const payload = event.payload as { id?: unknown; text?: unknown; options?: unknown; submitted?: unknown };
    if (typeof payload.id === 'string' && typeof payload.text === 'string') {
      const queuedPrompts = snapshot.queuedPrompts ?? [];
      if (!queuedPrompts.some((prompt) => prompt.agentId === event.agentId && prompt.id === payload.id)) {
        snapshot.queuedPrompts = [...queuedPrompts, {
          id: payload.id,
          agentId: event.agentId,
          text: payload.text,
          createdAt: event.occurredAt,
          ...(payload.options ? { options: payload.options as SendPromptOptions } : {}),
          ...(payload.submitted === true ? { submitted: true } : {}),
        }];
      }
    }
    return;
  }

  if (event.type === 'agent.promptRetryScheduled') {
    const payload = event.payload as { id?: unknown; attempts?: unknown; lastError?: unknown; retryAt?: unknown };
    const queuedPrompt = (snapshot.queuedPrompts ?? []).find((prompt) => (
      prompt.agentId === event.agentId && prompt.id === payload.id
    ));
    if (
      queuedPrompt &&
      typeof payload.attempts === 'number' &&
      typeof payload.lastError === 'string'
    ) {
      queuedPrompt.attempts = payload.attempts;
      queuedPrompt.lastError = payload.lastError;
      queuedPrompt.submitted = true;
      if (typeof payload.retryAt === 'string') queuedPrompt.retryAt = payload.retryAt;
      else delete queuedPrompt.retryAt;
    }
    return;
  }

  if (event.type === 'agent.promptDequeued') {
    const payload = event.payload as { ids?: unknown };
    if (Array.isArray(payload.ids)) {
      const ids = new Set(payload.ids.filter((id): id is string => typeof id === 'string'));
      snapshot.queuedPrompts = (snapshot.queuedPrompts ?? []).filter((prompt) => (
        prompt.agentId !== event.agentId || !ids.has(prompt.id)
      ));
    }
    return;
  }

  if (event.type === 'backendApproval.requested') {
    const approval = backendApprovalRequest(event.payload);
    if (approval) {
      const approvals = snapshot.backendApprovals[event.agentId] ?? [];
      snapshot.backendApprovals[event.agentId] = [
        ...approvals.filter((candidate) => candidate.id !== approval.id),
        approval,
      ];
      setAgentStatus(snapshot, event.agentId, { type: 'awaitingInput', detail: approval.title });
    }
    return;
  }

  if (event.type === 'backendApproval.resolved') {
    const approval = backendApprovalRequest(event.payload);
    if (approval) {
      snapshot.backendApprovals[event.agentId] = (snapshot.backendApprovals[event.agentId] ?? [])
        .filter((candidate) => candidate.id !== approval.id);
    }
    return;
  }

  if (event.type === 'context.compactionStarted') {
    if (!event.turnId) return;
    appendCompactionMarker(snapshot, event.agentId, event.turnId, event.occurredAt);
    return;
  }

  if (event.type === 'context.compactionCompleted') {
    if (!event.turnId) return;
    for (const message of findCompactionMessages(snapshot, event.agentId, event.turnId)) {
      message.status = 'complete';
    }
    return;
  }

  if (event.type === 'item.started' || event.type === 'item.completed') {
    if (!event.turnId) return;
    const toolPart = rendererToolPart(event.payload.toolPart);
    if (toolPart) {
      upsertAssistantToolPart(snapshot, event.agentId, event.turnId, toolPart, event.occurredAt);
    }
    return;
  }

  if (event.type === 'item.updated') {
    if (!event.turnId) return;
    updateAssistantToolPart(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    return;
  }

  if (event.type === 'diff.updated') {
    if (!event.turnId) return;
    updateTurnGitDiff(snapshot, event.turnId, event.payload, event.occurredAt);
    updateAssistantTurnDiff(snapshot, event.agentId, event.turnId, event.payload);
    return;
  }

  if (event.type === 'approval.requested') {
    if (!event.turnId) return;
    applyApprovalRequest(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    const confirmation = confirmToolRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: confirmation?.payload.confirmation.summary,
    });
    return;
  }

  if (event.type === 'toolInput.requested') {
    if (!event.turnId) return;
    applyToolInputRequest(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    const request = askUserRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: request?.payload.request.questions[0]?.question ?? 'Waiting for user input',
    });
    return;
  }

  if (event.type === 'turn.completed') {
    if (!event.turnId) return;
    const agent = findAgent(snapshot, event.agentId);
    if (agent?.plan?.kind === 'execution' && agent.plan.turnId === event.turnId) {
      agent.plan.status = finalizedThreadPlanStatus(agent.plan, event.payload);
      agent.plan.updatedAt = event.occurredAt;
    }
    completeAssistantMessage(snapshot, event.agentId, event.turnId);
    setAgentStatus(snapshot, event.agentId, { type: 'idle' });
    return;
  }

  if (event.type === 'error') {
    const message = typeof event.payload.message === 'string' ? event.payload.message : 'Backend error';
    if (event.payload.willRetry === true) {
      setAgentStatus(snapshot, event.agentId, { type: 'working', detail: message });
      return;
    }
    appendSystemMessage(snapshot, event.agentId, message, event.occurredAt);
    setAgentStatus(snapshot, event.agentId, { type: 'error', message });
    return;
  }

  const exhaustiveEvent: never = event;
  void exhaustiveEvent;
}
