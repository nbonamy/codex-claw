import type { MainToRendererEvent } from '../../shared/contracts';
import type { CodexRawResponseItem, CodexThreadItem } from './protocol';

type AdaptedRawResponseItemEvent = Pick<MainToRendererEvent, 'type' | 'payload'>;

export function rawResponseItemToEvent(item: CodexRawResponseItem): AdaptedRawResponseItemEvent | null {
  if (!isRecord(item) || typeof item.type !== 'string') {
    return null;
  }

  if (item.type === 'local_shell_call') {
    return {
      type: rawStatusIsCompleted(item.status) ? 'item.completed' : 'item.started',
      payload: {
        item: localShellCallToCommandExecution(item),
      },
    };
  }

  if (item.type === 'function_call') {
    return {
      type: 'item.started',
      payload: {
        item: functionCallToThreadItem(item),
      },
    };
  }

  if (item.type === 'function_call_output') {
    return rawOutputUpdate(item.call_id, item.output);
  }

  if (item.type === 'custom_tool_call') {
    return {
      type: 'item.started',
      payload: {
        item: {
          type: 'dynamicToolCall',
          id: stringValue(item.call_id) ?? fallbackRawItemId(item),
          namespace: null,
          tool: stringValue(item.name) ?? 'custom_tool',
          status: item.status ?? 'inProgress',
          arguments: stringValue(item.input) ?? '',
          contentItems: null,
          success: null,
          durationMs: null,
        } satisfies CodexThreadItem,
      },
    };
  }

  if (item.type === 'custom_tool_call_output') {
    return rawOutputUpdate(item.call_id, item.output, stringValue(item.name) ?? undefined);
  }

  if (item.type === 'tool_search_call') {
    return {
      type: 'item.started',
      payload: {
        item: {
          type: 'dynamicToolCall',
          id: stringValue(item.call_id) ?? fallbackRawItemId(item),
          namespace: 'codex',
          tool: 'tool_search',
          status: item.status ?? 'inProgress',
          arguments: item.arguments,
          contentItems: null,
          success: null,
          durationMs: null,
          execution: item.execution,
        } satisfies CodexThreadItem,
      },
    };
  }

  if (item.type === 'tool_search_output') {
    return {
      type: 'item.updated',
      payload: {
        itemId: stringValue(item.call_id) ?? fallbackRawItemId(item),
        kind: 'rawResponseItem.output',
        output: item.tools,
        status: item.status,
        title: 'tool_search',
      },
    };
  }

  if (item.type === 'web_search_call') {
    return {
      type: 'item.completed',
      payload: {
        item: {
          type: 'webSearch',
          id: fallbackRawItemId(item),
          query: webSearchQuery(item.action),
          action: item.action,
        } satisfies CodexThreadItem,
      },
    };
  }

  if (item.type === 'image_generation_call') {
    return {
      type: 'item.completed',
      payload: {
        item: {
          type: 'dynamicToolCall',
          id: stringValue(item.id) ?? fallbackRawItemId(item),
          namespace: null,
          tool: 'image_generation',
          status: item.status,
          arguments: {
            revisedPrompt: item.revised_prompt,
          },
          contentItems: item.result ? [{ type: 'inputText', text: String(item.result) }] : null,
          success: item.status === 'completed',
          durationMs: null,
        } satisfies CodexThreadItem,
      },
    };
  }

  return null;
}

function localShellCallToCommandExecution(item: Record<string, unknown>): CodexThreadItem {
  const action = isRecord(item.action) ? item.action : {};
  const command = Array.isArray(action.command)
    ? joinCommand(action.command)
    : stringValue(action.command) ?? 'local shell';

  return {
    type: 'commandExecution',
    id: stringValue(item.call_id) ?? fallbackRawItemId(item),
    command,
    cwd: stringValue(action.working_directory) ?? '',
    processId: null,
    source: 'agent',
    status: rawStatusToThreadStatus(item.status),
    commandActions: [],
    aggregatedOutput: null,
    exitCode: null,
    durationMs: null,
  };
}

function functionCallToThreadItem(item: Record<string, unknown>): CodexThreadItem {
  const name = stringValue(item.name) ?? 'function_call';
  const args = parseArguments(item.arguments);
  const id = stringValue(item.call_id) ?? fallbackRawItemId(item);

  if (name === 'shell_command' && isRecord(args)) {
    return {
      type: 'commandExecution',
      id,
      command: stringValue(args.command) ?? name,
      cwd: stringValue(args.workdir) ?? stringValue(args.cwd) ?? '',
      processId: null,
      source: 'agent',
      status: 'inProgress',
      commandActions: [],
      aggregatedOutput: null,
      exitCode: null,
      durationMs: null,
    };
  }

  return {
    type: 'dynamicToolCall',
    id,
    namespace: stringValue(item.namespace),
    tool: name,
    status: 'inProgress',
    arguments: args,
    contentItems: null,
    success: null,
    durationMs: null,
  };
}

function rawOutputUpdate(callId: unknown, output: unknown, title?: string): AdaptedRawResponseItemEvent {
  return {
    type: 'item.updated',
    payload: {
      itemId: stringValue(callId) ?? 'raw-response-output',
      kind: 'rawResponseItem.output',
      output,
      status: 'completed',
      title,
    },
  };
}

function rawStatusToThreadStatus(status: unknown): string {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'incomplete' || status === 'failed' || status === 'error') {
    return 'failed';
  }

  return 'inProgress';
}

function rawStatusIsCompleted(status: unknown): boolean {
  return status === 'completed' || status === 'failed' || status === 'error' || status === 'incomplete';
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function webSearchQuery(action: unknown): string {
  if (!isRecord(action)) {
    return 'web search';
  }

  return stringValue(action.query) ?? stringValue(action.searchTerm) ?? 'web search';
}

function joinCommand(parts: unknown[]): string {
  return parts.map((part) => {
    const value = String(part);
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }).join(' ');
}

function fallbackRawItemId(item: Record<string, unknown>): string {
  const callId = stringValue(item.call_id) ?? stringValue(item.id);
  if (callId) {
    return callId;
  }

  return `raw-${item.type}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
