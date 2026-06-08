import { getMessageToolCallArgs, getMessageToolCallName, type MessageToolCall, type ToolStatusDescriptor } from './types';

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
  const codexClawTitle = getCodexClawMcpTitle(toolCall, descriptor, t);
  if (codexClawTitle) {
    return codexClawTitle;
  }

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

function getCodexClawMcpTitle(
  toolCall: MessageToolCall,
  descriptor: ToolStatusDescriptor | undefined,
  t: Translate,
): string | undefined {
  const toolName = codexClawToolName(toolCall);
  if (!toolName) {
    return undefined;
  }

  const phase = toolPhase(toolCall, descriptor);
  const args = getRecord(getMessageToolCallArgs(toolCall));
  if (toolName === 'set-status' && phase === 'completed' && hasStringParam(args, 'status') && !stringParam(args, 'status')) {
    return t('chat.tool.mcp.codexClaw.setStatus.cleared');
  }

  const params = codexClawToolParams(toolName, args);
  return t(`chat.tool.mcp.codexClaw.${codexClawToolKey(toolName)}.${phase}`, params);
}

function codexClawToolName(toolCall: MessageToolCall): CodexClawToolName | undefined {
  const name = getMessageToolCallName(toolCall);
  const toolName = codexClawToolNameFromBackendName(name);
  return isCodexClawTool(toolName) ? toolName : undefined;
}

function codexClawToolNameFromBackendName(name: string): string {
  const prefixes = [
    'codex_claw.',
    'mcp__codex_claw__',
    'mcp_codex_claw_',
  ];
  const prefix = prefixes.find((candidate) => name.startsWith(candidate));
  return prefix ? name.slice(prefix.length) : '';
}

function codexClawToolParams(toolName: CodexClawToolName, args: Record<string, unknown> | undefined) {
  if (toolName === 'send-message') {
    const target = stringParam(args, 'to');
    return target ? { target } : undefined;
  }

  if (toolName === 'display-markdown') {
    return { target: displayMarkdownTarget(args) };
  }

  return undefined;
}

function codexClawToolKey(toolName: CodexClawToolName) {
  const keys: Record<CodexClawToolName, string> = {
    'broadcast-message': 'broadcastMessage',
    'check-messages': 'checkMessages',
    'display-markdown': 'displayMarkdown',
    'list-agents': 'listAgents',
    'register-agent': 'registerAgent',
    'send-message': 'sendMessage',
    'set-status': 'setStatus',
  };
  return keys[toolName];
}

function toolPhase(toolCall: MessageToolCall, descriptor: ToolStatusDescriptor | undefined): 'completed' | 'failed' | 'running' {
  if (descriptor?.phase === 'completed' || descriptor?.phase === 'failed' || descriptor?.phase === 'running') {
    return descriptor.phase;
  }

  if (toolCall.state === 'error' || toolCall.status === 'failed') {
    return 'failed';
  }

  if (!toolCall.done && toolCall.state !== 'completed') {
    return 'running';
  }

  return 'completed';
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringParam(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const param = value?.[key];
  return typeof param === 'string' && param.trim() ? param.trim() : undefined;
}

function displayMarkdownTarget(args: Record<string, unknown> | undefined): string {
  const title = stringParam(args, 'title');
  if (title) {
    return title;
  }

  const path = stringParam(args, 'path');
  if (!path) {
    return 'Markdown';
  }

  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function hasStringParam(value: Record<string, unknown> | undefined, key: string): boolean {
  return typeof value?.[key] === 'string';
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

function isCodexToolAction(action: string): action is 'create' | 'delete' | 'edit' | 'explore' | 'list' | 'read' | 'run' | 'search' {
  return action === 'create' || action === 'delete' || action === 'edit' || action === 'explore' || action === 'list' || action === 'read' || action === 'run' || action === 'search';
}

const codexClawTools = new Set([
  'broadcast-message',
  'check-messages',
  'display-markdown',
  'list-agents',
  'register-agent',
  'send-message',
  'set-status',
]);

type CodexClawToolName =
  | 'broadcast-message'
  | 'check-messages'
  | 'display-markdown'
  | 'list-agents'
  | 'register-agent'
  | 'send-message'
  | 'set-status';

function isCodexClawTool(value: string): value is CodexClawToolName {
  return codexClawTools.has(value);
}

function defaultTranslate(key: string, params?: Record<string, unknown>) {
  const values = params ?? {};
  const templates: Record<string, string> = {
    'chat.tool.command.edit.completed': 'Edited {target}',
    'chat.tool.command.edit.failed': 'Failed editing {target}',
    'chat.tool.command.edit.running': 'Editing {target}',
    'chat.tool.command.create.completed': 'Created {target}',
    'chat.tool.command.create.failed': 'Failed creating {target}',
    'chat.tool.command.create.running': 'Creating {target}',
    'chat.tool.command.delete.completed': 'Deleted {target}',
    'chat.tool.command.delete.failed': 'Failed deleting {target}',
    'chat.tool.command.delete.running': 'Deleting {target}',
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
    'chat.tool.mcp.codexClaw.broadcastMessage.completed': 'Broadcast message',
    'chat.tool.mcp.codexClaw.broadcastMessage.failed': 'Failed broadcasting message',
    'chat.tool.mcp.codexClaw.broadcastMessage.running': 'Broadcasting message',
    'chat.tool.mcp.codexClaw.checkMessages.completed': 'Checked messages',
    'chat.tool.mcp.codexClaw.checkMessages.failed': 'Failed checking messages',
    'chat.tool.mcp.codexClaw.checkMessages.running': 'Checking messages',
    'chat.tool.mcp.codexClaw.displayMarkdown.completed': 'Displayed {target}',
    'chat.tool.mcp.codexClaw.displayMarkdown.failed': 'Failed displaying {target}',
    'chat.tool.mcp.codexClaw.displayMarkdown.running': 'Displaying {target}',
    'chat.tool.mcp.codexClaw.listAgents.completed': 'Listed agents',
    'chat.tool.mcp.codexClaw.listAgents.failed': 'Failed listing agents',
    'chat.tool.mcp.codexClaw.listAgents.running': 'Listing agents',
    'chat.tool.mcp.codexClaw.registerAgent.completed': 'Registered agent',
    'chat.tool.mcp.codexClaw.registerAgent.failed': 'Failed registering agent',
    'chat.tool.mcp.codexClaw.registerAgent.running': 'Registering agent',
    'chat.tool.mcp.codexClaw.sendMessage.completed': 'Sent message to {target}',
    'chat.tool.mcp.codexClaw.sendMessage.failed': 'Failed sending message to {target}',
    'chat.tool.mcp.codexClaw.sendMessage.running': 'Sending message to {target}',
    'chat.tool.mcp.codexClaw.setStatus.cleared': 'Cleared status',
    'chat.tool.mcp.codexClaw.setStatus.completed': 'Updated status',
    'chat.tool.mcp.codexClaw.setStatus.failed': 'Failed updating status',
    'chat.tool.mcp.codexClaw.setStatus.running': 'Updating status',
  };

  return (templates[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}
