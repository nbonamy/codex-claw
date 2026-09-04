import type {
  BackendApprovalRequest,
  ClientRequest,
  PromptAttachment,
  RendererMessage,
  RendererMessagePart,
  RendererToolPart,
  RendererToolPartUpdate,
} from './contracts';

export type ToolPart = RendererToolPart;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function rendererMessages(value: unknown, agentId: string): RendererMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((message): message is RendererMessage => {
    if (
      !isRecord(message) ||
      typeof message.id !== 'string' ||
      message.agentId !== agentId ||
      !isRendererMessageRole(message.role) ||
      !isRendererMessageStatus(message.status) ||
      !Array.isArray(message.parts) ||
      typeof message.createdAt !== 'string' ||
      ('turnId' in message && message.turnId !== undefined && typeof message.turnId !== 'string')
    ) {
      return false;
    }

    return (
      (!('kind' in message) || message.kind === undefined || message.kind === 'compaction' || message.kind === 'steer') &&
      message.parts.every(isRendererMessagePart)
    );
  });
}

export function isRendererMessagePart(value: unknown): value is RendererMessagePart {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'text') {
    return typeof value.text === 'string'
      && optionalString(value.itemId)
      && (
        value.phase === undefined
        || value.phase === 'commentary'
        || value.phase === 'final_answer'
      );
  }

  if (value.type === 'reasoning') {
    return typeof value.summary === 'string'
      && typeof value.itemId === 'string'
      && typeof value.summaryIndex === 'number';
  }

  if (value.type === 'status') {
    return typeof value.text === 'string';
  }

  if (value.type === 'attachment') {
    return isRendererMessageAttachment(value.attachment);
  }

  if (value.type === 'media') {
    return isRendererMessageMedia(value.media) && optionalString(value.itemId);
  }

  return rendererToolPart(value) !== null;
}

export function isRendererMessageAttachment(value: unknown): boolean {
  if (
    !isRecord(value) ||
    (value.kind !== 'file' && value.kind !== 'image') ||
    typeof value.name !== 'string'
  ) {
    return false;
  }

  return optionalString(value.path) && optionalString(value.url) && optionalString(value.mimeType);
}

export function isRendererMessageMedia(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.url === 'string' &&
    optionalString(value.alt) &&
    optionalString(value.mimeType) &&
    optionalString(value.prompt) &&
    optionalString(value.title);
}

export function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function isRendererMessageRole(value: unknown): value is RendererMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'system';
}

export function isRendererMessageStatus(value: unknown): value is RendererMessage['status'] {
  return value === 'complete' || value === 'streaming' || value === 'error';
}

export function rendererToolPart(value: unknown): ToolPart | null {
  if (
    !isRecord(value) ||
    value.type !== 'tool' ||
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.title !== 'string' ||
    !isToolStatus(value.status)
  ) {
    return null;
  }

  return value as ToolPart;
}

export function rendererToolPartUpdate(value: unknown): RendererToolPartUpdate | null {
  if (!isRecord(value) || typeof value.itemId !== 'string') {
    return null;
  }

  if ('status' in value && value.status !== undefined && !isToolStatus(value.status)) {
    return null;
  }

  const fallbackToolPart = rendererToolPart(value.fallbackToolPart);
  if ('fallbackToolPart' in value && value.fallbackToolPart !== undefined && !fallbackToolPart) {
    return null;
  }

  const update: RendererToolPartUpdate = {
    itemId: value.itemId,
    title: typeof value.title === 'string' ? value.title : undefined,
    status: isToolStatus(value.status) ? value.status : undefined,
    statusText: value.statusText === null || typeof value.statusText === 'string' ? value.statusText : undefined,
    body: typeof value.body === 'string' ? value.body : undefined,
    bodyDelta: typeof value.bodyDelta === 'string' ? value.bodyDelta : undefined,
    bodyAppend: typeof value.bodyAppend === 'string' ? value.bodyAppend : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    fallbackToolPart: fallbackToolPart ?? undefined,
  };

  if ('input' in value) {
    update.input = value.input;
  }

  if ('output' in value) {
    update.output = value.output;
  }

  return update;
}

export function isToolStatus(value: unknown): value is ToolPart['status'] {
  return value === 'running' || value === 'completed' || value === 'failed';
}

export function backendApprovalRequest(value: unknown): BackendApprovalRequest | null {
  const candidate = isRecord(value) && isRecord(value.approval) ? value.approval : value;
  if (
    !isRecord(candidate) ||
    typeof candidate.id !== 'string' ||
    (candidate.kind !== 'command' && candidate.kind !== 'file-change' && candidate.kind !== 'permissions') ||
    typeof candidate.conversationId !== 'string' ||
    typeof candidate.itemId !== 'string' ||
    typeof candidate.title !== 'string'
  ) {
    return null;
  }
  return candidate as BackendApprovalRequest;
}

export function confirmToolRequest(payload: unknown): Extract<ClientRequest, { kind: 'confirm_tool' }> | null {
  if (
    !isRecord(payload) ||
    payload.kind !== 'confirm_tool' ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.confirmation)
  ) {
    return null;
  }

  const confirmation = payload.payload.confirmation;
  if (
    typeof confirmation.argumentsPreview !== 'string' ||
    typeof confirmation.integrationId !== 'string' ||
    typeof confirmation.integrationName !== 'string' ||
    typeof confirmation.summary !== 'string' ||
    typeof confirmation.toolName !== 'string'
  ) {
    return null;
  }

  return payload as Extract<ClientRequest, { kind: 'confirm_tool' }>;
}

export function askUserRequest(payload: unknown): Extract<ClientRequest, { kind: 'ask_user' }> | null {
  if (
    !isRecord(payload) ||
    payload.kind !== 'ask_user' ||
    typeof payload.id !== 'string' ||
    !isRecord(payload.payload) ||
    !isRecord(payload.payload.request) ||
    typeof payload.payload.request.itemId !== 'string' ||
    !Array.isArray(payload.payload.request.questions)
  ) {
    return null;
  }

  return payload as Extract<ClientRequest, { kind: 'ask_user' }>;
}

export function promptAttachments(value: unknown): PromptAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || (candidate.type !== 'image' && candidate.type !== 'file') || typeof candidate.path !== 'string') {
      return [];
    }
    return [{
      type: candidate.type,
      path: candidate.path,
      ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
      ...(typeof candidate.mimeType === 'string' ? { mimeType: candidate.mimeType } : {}),
      ...(candidate.type === 'image' && typeof candidate.detail === 'string' && (
        candidate.detail === 'auto' || candidate.detail === 'low' || candidate.detail === 'high' || candidate.detail === 'original'
      ) ? { detail: candidate.detail } : {}),
      ...(candidate.type === 'image' && typeof candidate.previewUrl === 'string' ? { previewUrl: candidate.previewUrl } : {}),
    } satisfies PromptAttachment];
  });
}

export function parseJsonPreview(preview: string): unknown {
  if (!preview.trim().startsWith('{') && !preview.trim().startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(preview);
  } catch {
    return undefined;
  }
}

export function finiteNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function toolStatusDescriptor(statusText: unknown): { action?: unknown; params?: unknown } | undefined {
  if (typeof statusText !== 'string' || !statusText.trim().startsWith('{')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(statusText) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
