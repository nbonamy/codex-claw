import type {
  BackendApprovalRequest,
  PromptAttachment,
  RendererToolPart,
} from './contracts';

export type ToolPart = RendererToolPart;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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

export function promptAttachments(value: readonly PromptAttachment[] | undefined): PromptAttachment[] {
  if (!value) return [];
  return value.map((attachment) => ({
    type: attachment.type,
    path: attachment.path,
    ...(attachment.name !== undefined ? { name: attachment.name } : {}),
    ...(attachment.mimeType !== undefined ? { mimeType: attachment.mimeType } : {}),
    ...(attachment.type === 'image' && attachment.detail !== undefined
      ? { detail: attachment.detail }
      : {}),
    ...(attachment.type === 'image' && attachment.previewUrl !== undefined
      ? { previewUrl: attachment.previewUrl }
      : {}),
  }));
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
