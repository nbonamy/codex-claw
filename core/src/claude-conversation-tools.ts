import type { ClaudeConversationEvent, ClaudeConversationSnapshot } from './contracts';
import {
  isRecord,
  parseJsonPreview,
  stringValue,
  type ToolPart,
} from './claude-conversation-payloads';
import {
  assistantMessageId,
  ensureAssistantMessage,
  findAssistantMessage,
  findAssistantMessages,
  findAssistantMessageWithToolPart,
  pruneSupersededEmptyAssistantPlaceholders,
} from './claude-conversation-transcript';
import { toolOutputText } from './tool-output';

export function updateAssistantToolPart(
  snapshot: ClaudeConversationSnapshot,
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
export function upsertAssistantToolPart(
  snapshot: ClaudeConversationSnapshot,
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
  snapshot: ClaudeConversationSnapshot,
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
  snapshot: ClaudeConversationSnapshot,
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

function findPendingMcpToolPart(snapshot: ClaudeConversationSnapshot, agentId: string, turnId: string, server: string, tool: string): ToolPart | undefined {
  const runningMcpTools = findAssistantMessages(snapshot, agentId, turnId).flatMap((message) => (
    message.parts.filter((part): part is ToolPart => part.type === 'tool' && part.kind === 'mcp' && part.status === 'running')
  ));
  const exactMatch = runningMcpTools.find((part) => {
    const metadataServer = isRecord(part.metadata) ? stringValue(part.metadata.server) : undefined;
    const metadataTool = isRecord(part.metadata) ? stringValue(part.metadata.tool) : undefined;
    return (
      (metadataServer === server && metadataTool === tool)
      || part.title === `${server}.${tool}`
      || part.title.endsWith(`.${tool}`)
    );
  });

  return exactMatch ?? (runningMcpTools.length === 1 ? runningMcpTools[0] : undefined);
}

type ConversationEventPayload<Type extends ClaudeConversationEvent['type']> =
  Extract<ClaudeConversationEvent, { type: Type }>['payload'];
