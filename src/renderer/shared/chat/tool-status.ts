import { getMessageToolCallName, type MessageToolCall, type ToolStatusDescriptor } from './types';

export type ToolLineDiff = {
  addedLines: number;
  removedLines: number;
};

export function parseToolStatusDescriptor(value: unknown): ToolStatusDescriptor | undefined {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<ToolStatusDescriptor>;
    if (
      typeof parsed.source !== 'string' ||
      typeof parsed.action !== 'string' ||
      typeof parsed.phase !== 'string'
    ) {
      return undefined;
    }
    return {
      action: parsed.action,
      phase: parsed.phase,
      params: parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params) ? parsed.params : undefined,
      source: parsed.source,
    };
  } catch {
    return undefined;
  }
}

export function getToolLineDiff(descriptor: ToolStatusDescriptor | undefined): ToolLineDiff | undefined {
  const params = descriptor?.params;
  const addedLines = typeof params?.addedLines === 'number' ? params.addedLines : 0;
  const removedLines = typeof params?.removedLines === 'number' ? params.removedLines : 0;
  return addedLines || removedLines ? { addedLines, removedLines } : undefined;
}

export function getToolFallbackTitle(toolCall: MessageToolCall) {
  const isRunning = !toolCall.done && toolCall.state !== 'completed';
  return `${isRunning ? 'Running' : 'Ran'} ${getMessageToolCallName(toolCall)}`;
}
