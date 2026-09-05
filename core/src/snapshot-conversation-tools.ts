import type {
  AppSnapshot,
  RendererMessagePart,
  TurnGitDiff,
} from './contracts';
import {
  finiteNonNegativeInteger,
  isRecord,
  parseJsonPreview,
  stringValue,
  toolStatusDescriptor,
  type ToolPart,
} from './snapshot-conversation-payloads';
import type { SnapshotEventOwnedBy } from './snapshot-event-ownership';
import {
  assistantMessageId,
  ensureAssistantMessage,
  findAssistantMessage,
  findAssistantMessages,
  findAssistantMessageWithToolPart,
  pruneSupersededEmptyAssistantPlaceholders,
} from './snapshot-conversation-transcript';
import { toolOutputText } from './tool-output';

export function updateAssistantToolPart(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  payload: ConversationEventPayload<'item.updated'>,
  createdAt: string,
): void {
  const update = payload;

  let message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, update.itemId) ?? findAssistantMessage(snapshot, agentId, turnId);
  let toolPart = message?.parts.find((part): part is ToolPart => {
    return part.type === 'tool' && part.id === update.itemId;
  });

  if (!toolPart && update.fallbackToolPart) {
    message = message ?? ensureAssistantMessage(snapshot, agentId, turnId, assistantMessageId(turnId), createdAt);
    message.parts.push(update.fallbackToolPart);
    toolPart = update.fallbackToolPart;
  }

  if (!toolPart) {
    return;
  }

  if (update.title) {
    toolPart.title = update.title;
  }

  if (update.status) {
    toolPart.status = update.status;
  }

  if (update.statusText === null) {
    delete toolPart.statusText;
  } else if (update.statusText !== undefined) {
    toolPart.statusText = update.statusText;
  }

  if (update.body !== undefined) {
    toolPart.body = update.body;
  }

  if (update.bodyDelta !== undefined) {
    toolPart.body = `${toolPart.body ?? ''}${update.bodyDelta}`;
  }

  if (update.bodyAppend !== undefined) {
    toolPart.body = [toolPart.body, update.bodyAppend].filter(Boolean).join('\n');
  }

  if ('output' in update) {
    toolPart.output = update.output;
    toolPart.body = update.body ?? toolOutputText(update.output) ?? toolPart.body;
  }

  if ('input' in update) {
    toolPart.input = update.input;
  }

  if (update.metadata) {
    toolPart.metadata = {
      ...(toolPart.metadata ?? {}),
      ...update.metadata,
    };
  }
}
export function updateAssistantTurnDiff(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  payload: ConversationEventPayload<'diff.updated'>,
): void {
  const { addedLines, removedLines } = payload;
  if (!addedLines && !removedLines) {
    return;
  }

  const message = findAssistantMessage(snapshot, agentId, turnId);
  const toolPart = lastRunningFileChangeToolPart(message?.parts);
  if (!toolPart) {
    return;
  }

  const existingDescriptor = toolStatusDescriptor(toolPart.statusText);
  const existingParams = isRecord(existingDescriptor?.params) ? existingDescriptor.params : {};
  toolPart.statusText = JSON.stringify({
    action: typeof existingDescriptor?.action === 'string' ? existingDescriptor.action : 'edit',
    phase: toolPart.status,
    params: {
      ...existingParams,
      addedLines,
      removedLines,
      target: typeof existingParams.target === 'string' ? existingParams.target : toolPart.title,
    },
    source: 'codex',
  });
}

export function updateTurnGitDiff(
  snapshot: AppSnapshot,
  turnId: string,
  payload: ConversationEventPayload<'diff.updated'>,
  updatedAt: string,
): void {
  const addedLines = finiteNonNegativeInteger(payload.addedLines);
  const removedLines = finiteNonNegativeInteger(payload.removedLines);
  if (!addedLines && !removedLines) {
    return;
  }

  const diff = payload.diff;
  const nextDiff: TurnGitDiff = {
    turnId,
    addedLines,
    removedLines,
    updatedAt,
    ...(diff ? { diff } : {}),
  };
  snapshot.turnGitDiffs = {
    ...snapshot.turnGitDiffs,
    [turnId]: nextDiff,
  };
}

export function lastRunningFileChangeToolPart(parts: RendererMessagePart[] | undefined): ToolPart | undefined {
  if (!parts) {
    return undefined;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part?.type === 'tool' && part.kind === 'fileChange' && part.status === 'running') {
      return part;
    }
  }

  return undefined;
}

export function upsertAssistantToolPart(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  toolPart: ToolPart,
  createdAt: string,
): void {
  const message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, toolPart.id) ??
    ensureAssistantMessage(snapshot, agentId, turnId, assistantMessageId(turnId), createdAt);
  const existingIndex = message.parts.findIndex((part) => part.type === 'tool' && part.id === toolPart.id);

  if (existingIndex >= 0) {
    const existing = message.parts[existingIndex] as ToolPart;
    message.parts[existingIndex] = {
      ...existing,
      ...toolPart,
      body: toolPart.body ?? existing.body,
      input: toolPart.input ?? existing.input,
      output: toolPart.output ?? existing.output,
      statusText: toolPart.statusText ?? (toolPart.status === 'running' ? existing.statusText : undefined),
      metadata: {
        ...(existing.metadata ?? {}),
        ...(toolPart.metadata ?? {}),
      },
    };
    pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
    return;
  }

  message.parts.push(toolPart);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

export function applyApprovalRequest(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  payload: ConversationEventPayload<'approval.requested'>,
  createdAt: string,
): void {
  const request = payload;

  const confirmation = request.payload.confirmation;
  const toolPart = findPendingMcpToolPart(snapshot, agentId, turnId, confirmation.integrationId, confirmation.toolName);
  const statusText = JSON.stringify({
    source: 'mcp',
    action: 'run',
    phase: 'running',
    params: {
      requestId: request.id,
      tool: `${confirmation.integrationId}.${confirmation.toolName}`,
      confirmationSummary: confirmation.summary,
      argumentsPreview: confirmation.argumentsPreview,
      allowConversation: confirmation.allowConversation === true,
      allowAlways: confirmation.allowAlways === true,
    },
  });
  const input = parseJsonPreview(confirmation.argumentsPreview) ?? (confirmation.argumentsPreview || undefined);

  if (toolPart) {
    toolPart.title = `${confirmation.integrationId}.${confirmation.toolName}`;
    toolPart.status = 'running';
    toolPart.statusText = statusText;
    toolPart.input = toolPart.input ?? input;
    toolPart.metadata = {
      ...(toolPart.metadata ?? {}),
      confirmationRequestId: request.id,
      server: confirmation.integrationId,
      tool: confirmation.toolName,
    };
    return;
  }

  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: `approval-${request.id}`,
    kind: 'mcp',
    title: `${confirmation.integrationId}.${confirmation.toolName}`,
    status: 'running',
    statusText,
    input,
    metadata: {
      confirmationRequestId: request.id,
      server: confirmation.integrationId,
      tool: confirmation.toolName,
    },
  }, createdAt);
}

export function applyToolInputRequest(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  payload: ConversationEventPayload<'toolInput.requested'>,
  createdAt: string,
): void {
  const request = payload;

  const question = request.payload.request.questions[0];
  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: request.payload.request.itemId,
    kind: 'generic',
    title: 'ask_user_question',
    status: 'running',
    statusText: JSON.stringify({
      source: 'codex',
      action: 'ask_user_question',
      phase: 'running',
      params: {
        requestId: request.id,
        questions: request.payload.request.questions,
      },
    }),
    input: request.payload.request.questions,
    metadata: {
      requestId: request.id,
      question: question?.question,
    },
  }, createdAt);
}

export function findPendingMcpToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, server: string, tool: string): ToolPart | undefined {
  const runningMcpTools = findAssistantMessages(snapshot, agentId, turnId).flatMap((message) => (
    message.parts.filter((part): part is ToolPart => {
      if (part.type !== 'tool' || part.kind !== 'mcp' || part.status !== 'running') {
        return false;
      }

      return true;
    })
  ));
  const exactMatch = runningMcpTools.find((part) => {
    const metadataServer = isRecord(part.metadata) ? stringValue(part.metadata.server) : undefined;
    const metadataTool = isRecord(part.metadata) ? stringValue(part.metadata.tool) : undefined;
    return (
      (metadataServer === server && metadataTool === tool) ||
      part.title === `${server}.${tool}` ||
      part.title.endsWith(`.${tool}`)
    );
  });

  return exactMatch ?? (runningMcpTools.length === 1 ? runningMcpTools[0] : undefined);
}

type ConversationEventPayload<Type extends SnapshotEventOwnedBy<'conversation'>['type']> =
  Extract<SnapshotEventOwnedBy<'conversation'>, { type: Type }>['payload'];
