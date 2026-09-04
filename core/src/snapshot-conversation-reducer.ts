import type {
  AppSnapshot,
  MainToRendererEvent,
  SendPromptOptions,
} from './contracts';
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

export function applyConversationEventToSnapshot(snapshot: AppSnapshot, event: MainToRendererEvent): void {
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

  if (event.type === 'turn.planUpdated' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const plan = threadPlan(event.payload, event.threadId, event.turnId, event.occurredAt);
    if (agent && plan) {
      const operation = planProgressOperation(agent, event.turnId);
      agent.plan = plan;
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, plan.markdown, 'completed', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanDelta' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    appendAgentPlanMarkdownDelta(agent, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'running', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'turn.proposedPlanCompleted' && event.threadId && event.turnId) {
    const agent = findAgent(snapshot, event.agentId);
    const operation = agent ? planProgressOperation(agent, event.turnId) : 'write';
    updateAgentPlanMarkdown(agent, event.threadId, event.turnId, event.payload, event.occurredAt);
    const updatedAgent = findAgent(snapshot, event.agentId);
    if (updatedAgent?.plan?.turnId === event.turnId) {
      upsertPlanProgressToolPart(snapshot, event.agentId, event.turnId, updatedAgent.plan.markdown, 'completed', operation, event.occurredAt);
    }
    return;
  }

  if (event.type === 'message.delta' && event.turnId) {
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
    const payload = isRecord(event.payload) ? event.payload : {};
    const [message] = rendererMessages([payload.message], event.agentId);
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
    const payload = isRecord(event.payload) ? event.payload : {};
    const [message] = rendererMessages([payload.message], event.agentId);
    if (message && !snapshot.messages.some((candidate) => candidate.id === message.id)) {
      snapshot.messages.push(message);
      pruneSupersededEmptyAssistantPlaceholders(snapshot, event.agentId);
    }
    return;
  }

  if (event.type === 'message.steer' && event.turnId) {
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

  if (event.type === 'agent.promptQueued' && event.agentId) {
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

  if (event.type === 'agent.promptRetryScheduled' && event.agentId) {
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

  if (event.type === 'backendApproval.requested' && event.agentId) {
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
      const agentIds = event.agentId ? [event.agentId] : Object.keys(snapshot.backendApprovals);
      for (const agentId of agentIds) {
        snapshot.backendApprovals[agentId] = (snapshot.backendApprovals[agentId] ?? []).filter((candidate) => candidate.id !== approval.id);
      }
    }
    return;
  }

  if (event.type === 'context.compactionStarted' && event.turnId) {
    appendCompactionMarker(snapshot, event.agentId, event.turnId, event.occurredAt);
    return;
  }

  if (event.type === 'context.compactionCompleted' && event.turnId) {
    for (const message of findCompactionMessages(snapshot, event.agentId, event.turnId)) {
      message.status = 'complete';
    }
    return;
  }

  if ((event.type === 'item.started' || event.type === 'item.completed') && event.turnId) {
    const payload = event.payload as { toolPart?: unknown };
    const toolPart = rendererToolPart(payload.toolPart);
    if (toolPart) {
      upsertAssistantToolPart(snapshot, event.agentId, event.turnId, toolPart, event.occurredAt);
    }
    return;
  }

  if (event.type === 'item.updated' && event.turnId) {
    updateAssistantToolPart(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    return;
  }

  if (event.type === 'diff.updated' && event.turnId) {
    updateTurnGitDiff(snapshot, event.turnId, event.payload, event.occurredAt);
    updateAssistantTurnDiff(snapshot, event.agentId, event.turnId, event.payload);
    return;
  }

  if (event.type === 'approval.requested' && event.turnId) {
    applyApprovalRequest(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    const confirmation = confirmToolRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: confirmation?.payload.confirmation.summary,
    });
    return;
  }

  if (event.type === 'toolInput.requested' && event.turnId) {
    applyToolInputRequest(snapshot, event.agentId, event.turnId, event.payload, event.occurredAt);
    const request = askUserRequest(event.payload);
    setAgentStatus(snapshot, event.agentId, {
      type: 'awaitingInput',
      detail: request?.payload.request.questions[0]?.question ?? 'Waiting for user input',
    });
    return;
  }

  if (event.type === 'turn.completed' && event.turnId) {
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
    const payload = event.payload as { message?: unknown; willRetry?: unknown };
    const message = typeof payload.message === 'string' ? payload.message : 'Backend error';
    if (payload.willRetry === true) {
      setAgentStatus(snapshot, event.agentId, { type: 'working', detail: message });
      return;
    }
    appendSystemMessage(snapshot, event.agentId, message, event.occurredAt);
    setAgentStatus(snapshot, event.agentId, { type: 'error', message });
  }
}
