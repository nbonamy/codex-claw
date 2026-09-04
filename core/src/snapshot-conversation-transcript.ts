import type {
  AppSnapshot,
  PromptAttachment,
  RendererMessage,
  RendererMessagePart,
} from './contracts';

export function appendUserPrompt(
  snapshot: AppSnapshot,
  agentId: string,
  prompt: string,
  createdAt = new Date().toISOString(),
  attachments: readonly PromptAttachment[] = [],
): RendererMessage {
  const message = createUserMessage(agentId, prompt, createdAt, 'message', undefined, attachments);
  snapshot.messages.push(message);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}
export function appendSteerPrompt(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  prompt: string,
  createdAt = new Date().toISOString(),
  attachments: readonly PromptAttachment[] = [],
): RendererMessage {
  const message = createUserMessage(agentId, prompt, createdAt, `steer-${turnId}`, turnId, attachments);
  const existing = snapshot.messages.find((candidate) => (
    candidate.agentId === agentId && candidate.id === message.id
  ));
  if (existing) return existing;

  const activeAssistantMessage = findAssistantMessage(snapshot, agentId, turnId);
  if (activeAssistantMessage?.parts.length === 0 && activeAssistantMessage.id.startsWith(`${assistantMessageId(turnId)}-segment-`)) {
    snapshot.messages = snapshot.messages.filter((message) => message.id !== activeAssistantMessage.id);
  } else if (activeAssistantMessage) {
    activeAssistantMessage.status = 'complete';
  }

  snapshot.messages.push(message);
  ensureAssistantMessage(snapshot, agentId, turnId, assistantSegmentMessageId(turnId, createdAt), createdAt);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

export function appendSystemMessage(snapshot: AppSnapshot, agentId: string, text: string, createdAt = new Date().toISOString()): RendererMessage {
  const message: RendererMessage = {
    id: `system-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    role: 'system',
    status: 'error',
    createdAt,
    parts: [{ type: 'status', text }],
  };

  snapshot.messages.push(message);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

export function hydrateAgentMessages(
  snapshot: AppSnapshot,
  agentId: string,
  messages: RendererMessage[],
  options: { preserveKnownMessages?: boolean; preserveKnownTurns?: boolean; replace?: boolean } = {},
): void {
  if (options.preserveKnownMessages) {
    reconcilePrependedAgentMessages(snapshot, agentId, messages);
    return;
  }
  if (options.preserveKnownTurns) {
    reconcileHydratedAgentTurns(snapshot, agentId, messages);
    return;
  }

  if (options.replace) {
    snapshot.messages = snapshot.messages.filter((message) => message.agentId !== agentId);
  }

  if (messages.length === 0) {
    return;
  }

  const hydratedIds = new Set(messages.map((message) => message.id));
  snapshot.messages = snapshot.messages.filter((message) => {
    return message.agentId !== agentId || !hydratedIds.has(message.id);
  });

  const firstAgentMessageIndex = snapshot.messages.findIndex((message) => message.agentId === agentId);
  if (firstAgentMessageIndex === -1) {
    snapshot.messages.push(...messages);
    pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
    return;
  }

  snapshot.messages.splice(firstAgentMessageIndex, 0, ...messages);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

export function reconcilePrependedAgentMessages(
  snapshot: AppSnapshot,
  agentId: string,
  messages: RendererMessage[],
): void {
  if (messages.length === 0) return;

  const existingById = new Map(snapshot.messages
    .filter((message) => message.agentId === agentId)
    .map((message) => [message.id, message]));
  const pageMessageIds = new Set<string>();
  const canonicalPage = messages.flatMap((message) => {
    if (pageMessageIds.has(message.id)) return [];
    pageMessageIds.add(message.id);
    return [existingById.get(message.id) ?? message];
  });
  const firstAgentMessageIndex = snapshot.messages.findIndex((message) => message.agentId === agentId);

  // A lifecycle update can hydrate a historical message before the pagination
  // chunk containing it arrives. The chunk is authoritative for placement, so
  // move any overlap into its canonical page position while preserving the
  // richer message object already held by the live transcript.
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (message?.agentId === agentId && pageMessageIds.has(message.id)) {
      snapshot.messages.splice(index, 1);
    }
  }
  if (firstAgentMessageIndex === -1) snapshot.messages.push(...canonicalPage);
  else snapshot.messages.splice(firstAgentMessageIndex, 0, ...canonicalPage);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

export function reconcileHydratedAgentTurns(snapshot: AppSnapshot, agentId: string, messages: RendererMessage[]): void {
  const existing = snapshot.messages.filter((message) => message.agentId === agentId);
  const knownTurnIds = new Set(existing.flatMap((message) => message.turnId ? [message.turnId] : []));
  const knownMessageIds = new Set(existing.map((message) => message.id));
  // Lifecycle hydration is a refreshed window, not an older page: it can add turns
  // on either side of the richer live transcript while known live turns stay authoritative.
  const additions = messages.filter((message) => (
    message.turnId ? !knownTurnIds.has(message.turnId) : !knownMessageIds.has(message.id)
  ));
  replaceAgentMessagesInPlace(snapshot, agentId, orderAgentMessagesByTurn([...existing, ...additions]));
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

export function orderAgentMessagesByTurn(messages: RendererMessage[]): RendererMessage[] {
  const groups = new Map<string, { createdAt: string; index: number; messages: RendererMessage[] }>();
  for (const [index, message] of messages.entries()) {
    const key = message.turnId ? `turn:${message.turnId}` : `message:${message.id}`;
    const group = groups.get(key);
    if (group) {
      group.messages.push(message);
      if (message.createdAt < group.createdAt) group.createdAt = message.createdAt;
    } else {
      groups.set(key, { createdAt: message.createdAt, index, messages: [message] });
    }
  }

  return [...groups.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.index - right.index)
    .flatMap((group) => group.messages);
}

export function replaceAgentMessagesInPlace(snapshot: AppSnapshot, agentId: string, messages: RendererMessage[]): void {
  const firstAgentMessageIndex = snapshot.messages.findIndex((message) => message.agentId === agentId);
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    if (snapshot.messages[index]?.agentId === agentId) snapshot.messages.splice(index, 1);
  }
  if (firstAgentMessageIndex === -1) snapshot.messages.push(...messages);
  else snapshot.messages.splice(firstAgentMessageIndex, 0, ...messages);
}

export function appendAssistantDelta(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  delta: string,
  createdAt: string,
  itemId?: string,
  phase?: 'commentary' | 'final_answer',
): void {
  const message = ensureAssistantMessage(snapshot, agentId, turnId, assistantMessageId(turnId), createdAt);
  if (message.status !== 'complete') {
    message.status = 'streaming';
  }

  const textPart = message.parts.at(-1);
  if (textPart?.type === 'text' && textPart.itemId === itemId) {
    textPart.text += delta;
    if (phase) textPart.phase = phase;
  } else {
    message.parts.push({
      type: 'text',
      text: delta,
      ...(itemId ? { itemId } : {}),
      ...(phase ? { phase } : {}),
    });
  }
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

export function appendCompactionMarker(snapshot: AppSnapshot, agentId: string, turnId: string, createdAt: string): RendererMessage {
  const existing = snapshot.messages.find((message) => {
    return message.agentId === agentId && message.id === compactionMessageId(turnId);
  });
  if (existing) {
    return existing;
  }

  const activeAssistantMessage = findAssistantMessage(snapshot, agentId, turnId);
  if (activeAssistantMessage?.parts.length === 0 && activeAssistantMessage.id === assistantMessageId(turnId)) {
    snapshot.messages = snapshot.messages.filter((message) => message !== activeAssistantMessage);
  } else if (activeAssistantMessage) {
    activeAssistantMessage.status = 'complete';
  }

  const message: RendererMessage = {
    id: compactionMessageId(turnId),
    agentId,
    kind: 'compaction',
    role: 'assistant',
    status: 'streaming',
    turnId,
    createdAt,
    parts: [],
  };
  snapshot.messages.push(message);
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);

  return message;
}

export function ensureAssistantMessage(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  messageId: string,
  createdAt: string,
): RendererMessage {
  let effectiveMessageId = messageId;
  let effectiveCreatedAt = createdAt;
  const compactionMessage = messageId === assistantMessageId(turnId)
    ? findCompactionMessages(snapshot, agentId, turnId).at(-1)
    : undefined;
  const message = messageId === assistantMessageId(turnId)
    ? findAssistantMessageForAppend(snapshot, agentId, turnId)
    : snapshot.messages.find((candidate) => candidate.id === messageId && candidate.agentId === agentId);

  if (message) {
    return message;
  }
  if (compactionMessage) {
    effectiveMessageId = assistantSegmentMessageId(turnId, compactionMessage.createdAt);
    effectiveCreatedAt = compactionMessage.createdAt;
  }

  const nextMessage: RendererMessage = {
    id: effectiveMessageId,
    agentId,
    role: 'assistant',
    status: 'streaming',
    turnId,
    createdAt: effectiveCreatedAt,
    parts: [],
  };
  snapshot.messages.push(nextMessage);
  return nextMessage;
}

export function completeAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): void {
  for (const message of findAssistantMessages(snapshot, agentId, turnId)) {
    message.status = 'complete';
  }
  for (const message of findCompactionMessages(snapshot, agentId, turnId)) {
    message.status = 'complete';
  }

  snapshot.messages = snapshot.messages.filter((message) => (
    message.agentId !== agentId ||
    !isAssistantTurnMessage(message, agentId, turnId) ||
    message.parts.length > 0
  ));
  pruneSupersededEmptyAssistantPlaceholders(snapshot, agentId);
}

export function pruneSupersededEmptyAssistantPlaceholders(snapshot: AppSnapshot, agentId: string): void {
  let lastAgentMessageIndex = -1;
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    if (snapshot.messages[index]?.agentId === agentId) {
      lastAgentMessageIndex = index;
      break;
    }
  }

  if (lastAgentMessageIndex === -1) {
    return;
  }

  for (let index = lastAgentMessageIndex - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (message?.agentId === agentId && isPlainEmptyAssistantPlaceholder(message)) {
      snapshot.messages.splice(index, 1);
    }
  }
}

export function isPlainEmptyAssistantPlaceholder(message: RendererMessage): boolean {
  return message.role === 'assistant' && message.kind === undefined && message.parts.length === 0;
}

export function findAssistantMessageForAppend(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  const compactionMessage = findCompactionMessages(snapshot, agentId, turnId).at(-1);
  if (!compactionMessage) {
    return findAssistantMessage(snapshot, agentId, turnId);
  }

  const compactionIndex = snapshot.messages.indexOf(compactionMessage);
  return snapshot.messages
    .slice(compactionIndex + 1)
    .filter((message) => isAssistantTurnMessage(message, agentId, turnId))
    .at(-1);
}

export function findAssistantMessage(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage | undefined {
  return findAssistantMessages(snapshot, agentId, turnId).at(-1);
}

export function findAssistantMessages(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage[] {
  return snapshot.messages.filter((message) => isAssistantTurnMessage(message, agentId, turnId));
}

export function isAssistantTurnMessage(message: RendererMessage, agentId: string, turnId: string): boolean {
  const baseId = assistantMessageId(turnId);
  return (
    message.agentId === agentId &&
    message.role === 'assistant' &&
    (message.id === baseId || message.id.startsWith(`${baseId}-segment-`))
  );
}

export function findCompactionMessages(snapshot: AppSnapshot, agentId: string, turnId: string): RendererMessage[] {
  return snapshot.messages.filter((message) => (
    message.agentId === agentId &&
    message.kind === 'compaction' &&
    message.turnId === turnId
  ));
}

export function findAssistantMessageWithToolPart(snapshot: AppSnapshot, agentId: string, turnId: string, itemId: string): RendererMessage | undefined {
  return findAssistantMessages(snapshot, agentId, turnId).find((message) => (
    message.parts.some((part) => part.type === 'tool' && part.id === itemId)
  ));
}

export function assistantMessageId(turnId: string): string {
  return `assistant-${turnId}`;
}

export function assistantSegmentMessageId(turnId: string, createdAt: string): string {
  return `${assistantMessageId(turnId)}-segment-${createdAt.replace(/\W/g, '').toLowerCase()}`;
}

export function compactionMessageId(turnId: string): string {
  return `compaction-${turnId}`;
}

export function createUserMessage(
  agentId: string,
  prompt: string,
  createdAt: string,
  idPrefix = 'message',
  turnId?: string,
  attachments: readonly PromptAttachment[] = [],
): RendererMessage {
  const isSteer = idPrefix.startsWith('steer-');
  return {
    id: `${idPrefix}-${createdAt.replace(/\W/g, '').toLowerCase()}`,
    agentId,
    ...(isSteer ? { kind: 'steer' as const } : {}),
    role: 'user',
    status: 'complete',
    ...(turnId ? { turnId } : {}),
    createdAt,
    parts: [
      { type: 'text', text: prompt },
      ...attachments.map(promptAttachmentPart),
    ],
  };
}

export function promptAttachmentPart(attachment: PromptAttachment): RendererMessagePart {
  const name = attachment.name?.trim() || attachmentFileName(attachment.path) || (
    attachment.type === 'image' ? 'Image' : 'File'
  );
  return {
    type: 'attachment',
    attachment: {
      kind: attachment.type,
      name,
      path: attachment.path,
      ...('mimeType' in attachment && attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
      ...(attachment.type === 'image' && attachment.previewUrl ? { url: attachment.previewUrl } : {}),
    },
  };
}

export function attachmentFileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1)?.trim() ?? '';
}
