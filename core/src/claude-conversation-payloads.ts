import type { RendererToolPart } from './contracts';

export type ToolPart = RendererToolPart;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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
