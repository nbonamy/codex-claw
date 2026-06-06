import { getMessageToolCallName, type MessageToolCall, type ToolStatusDescriptor } from './types';

type Translate = (key: string, params?: Record<string, unknown>) => string;

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

export function getToolDisplayTitle(
  toolCall: MessageToolCall,
  descriptor: ToolStatusDescriptor | undefined,
  t: Translate = defaultTranslate,
) {
  if (descriptor?.source === 'codex' && isCodexToolAction(descriptor.action)) {
    const phase = commandPhase(descriptor.phase);
    const target = descriptor.action === 'explore' ? undefined : commandTarget(descriptor, getMessageToolCallName(toolCall));
    return t(`chat.tool.command.${descriptor.action}.${phase}`, target ? { target } : undefined);
  }

  if (descriptor) {
    return `${descriptor.phase} ${getMessageToolCallName(toolCall)}`;
  }

  return getToolFallbackTitle(toolCall, t);
}

export function getToolDisplayTitleParts(
  toolCall: MessageToolCall,
  descriptor: ToolStatusDescriptor | undefined,
  t: Translate = defaultTranslate,
): { prefix?: string; target?: string; title: string } {
  const title = getToolDisplayTitle(toolCall, descriptor, t);
  if (descriptor?.source !== 'codex' || descriptor.action !== 'edit') {
    return { title };
  }

  const target = commandTarget(descriptor, getMessageToolCallName(toolCall));
  const prefix = title.endsWith(target) ? title.slice(0, -target.length).trimEnd() : undefined;
  return prefix ? { prefix, target, title } : { title };
}

export function getToolFallbackTitle(toolCall: MessageToolCall, t: Translate = defaultTranslate) {
  const isRunning = !toolCall.done && toolCall.state !== 'completed';
  return t(`chat.tool.fallback.${isRunning ? 'running' : 'completed'}`, {
    name: getMessageToolCallName(toolCall),
  });
}

function commandTarget(descriptor: ToolStatusDescriptor, fallback: string) {
  const target = descriptor.params?.target;
  return typeof target === 'string' && target.trim() ? target : fallback;
}

function commandPhase(phase: string) {
  if (phase === 'completed' || phase === 'failed' || phase === 'running') {
    return phase;
  }

  return 'running';
}

function isCodexToolAction(action: string): action is 'edit' | 'explore' | 'list' | 'read' | 'run' | 'search' {
  return action === 'edit' || action === 'explore' || action === 'list' || action === 'read' || action === 'run' || action === 'search';
}

function defaultTranslate(key: string, params?: Record<string, unknown>) {
  const values = params ?? {};
  const templates: Record<string, string> = {
    'chat.tool.command.edit.completed': 'Edited {target}',
    'chat.tool.command.edit.failed': 'Failed editing {target}',
    'chat.tool.command.edit.running': 'Editing {target}',
    'chat.tool.command.explore.completed': 'Explored',
    'chat.tool.command.explore.failed': 'Failed exploring',
    'chat.tool.command.explore.running': 'Exploring',
    'chat.tool.command.list.completed': 'Listed {target}',
    'chat.tool.command.list.failed': 'Failed listing {target}',
    'chat.tool.command.list.running': 'Listing {target}',
    'chat.tool.command.read.completed': 'Read {target}',
    'chat.tool.command.read.failed': 'Failed reading {target}',
    'chat.tool.command.read.running': 'Reading {target}',
    'chat.tool.command.run.completed': 'Ran {target}',
    'chat.tool.command.run.failed': 'Failed running {target}',
    'chat.tool.command.run.running': 'Running {target}',
    'chat.tool.command.search.completed': 'Searched {target}',
    'chat.tool.command.search.failed': 'Failed searching {target}',
    'chat.tool.command.search.running': 'Searching {target}',
    'chat.tool.fallback.completed': 'Ran {name}',
    'chat.tool.fallback.running': 'Running {name}',
  };

  return (templates[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}
