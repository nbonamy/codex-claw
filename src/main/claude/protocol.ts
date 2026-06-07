export type ClaudeSdkContentBlock =
  | {
    type: 'text';
    text: string;
  }
  | {
    type: 'tool_use';
    id: string;
    name: string;
    input?: unknown;
  }
  | {
    type: 'tool_result';
    tool_use_id: string;
    content?: unknown;
    is_error?: boolean;
  }
  | {
    type: string;
    [key: string]: unknown;
  };

export type ClaudeSdkMessage =
  | {
    type: 'system';
    subtype?: string;
    session_id?: string;
    [key: string]: unknown;
  }
  | {
    type: 'assistant';
    session_id?: string;
    error?: string;
    message?: {
      id?: string;
      role?: string;
      content?: ClaudeSdkContentBlock[] | string;
      usage?: unknown;
    };
  }
  | {
    type: 'user';
    session_id?: string;
    message?: {
      role?: string;
      content?: ClaudeSdkContentBlock[] | string;
    };
  }
  | {
    type: 'result';
    subtype?: string;
    session_id?: string;
    is_error?: boolean;
    result?: string;
    error?: unknown;
    total_cost_usd?: number;
    duration_ms?: number;
    duration_api_ms?: number;
    num_turns?: number;
  }
  | {
    type: 'stream_event';
    session_id?: string;
    event?: {
      type?: string;
      index?: number;
      content_block?: ClaudeSdkContentBlock;
      delta?: {
        type?: string;
        text?: string;
        thinking?: string;
        partial_json?: string;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }
  | {
    type: string;
    session_id?: string;
    [key: string]: unknown;
  };

export function parseClaudeSdkMessage(line: string): ClaudeSdkMessage | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      return null;
    }

    return parsed as ClaudeSdkMessage;
  } catch {
    return null;
  }
}

export function claudeMessageSessionId(message: ClaudeSdkMessage): string | null {
  return typeof message.session_id === 'string' && message.session_id.trim()
    ? message.session_id
    : null;
}

export function claudeMessageContentBlocks(message: ClaudeSdkMessage): ClaudeSdkContentBlock[] {
  if ((message.type !== 'assistant' && message.type !== 'user') || !isRecord(message.message)) {
    return [];
  }

  const content = message.message.content;
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter((block): block is ClaudeSdkContentBlock => {
    return isRecord(block) && typeof block.type === 'string';
  });
}

export function claudeResultErrorMessage(message: ClaudeSdkMessage): string | null {
  if (message.type !== 'result' || (message.subtype === 'success' && !message.is_error)) {
    return null;
  }

  if (typeof message.result === 'string' && message.result.trim()) {
    return message.result;
  }

  if (typeof message.error === 'string' && message.error.trim()) {
    return message.error;
  }

  return `Claude turn finished with status '${message.subtype ?? 'error'}'.`;
}

export function claudeStreamTextDelta(message: ClaudeSdkMessage): string {
  if (message.type !== 'stream_event' || !isRecord(message.event) || message.event.type !== 'content_block_delta') {
    return '';
  }

  const delta = message.event.delta;
  if (!isRecord(delta) || delta.type !== 'text_delta' || typeof delta.text !== 'string') {
    return '';
  }

  return delta.text;
}

export type ClaudeStreamToolUseStart = {
  index: number;
  id: string;
  name: string;
  input?: unknown;
};

export function claudeStreamToolUseStart(message: ClaudeSdkMessage): ClaudeStreamToolUseStart | null {
  if (message.type !== 'stream_event' || !isRecord(message.event) || message.event.type !== 'content_block_start') {
    return null;
  }

  const index = typeof message.event.index === 'number' ? message.event.index : null;
  const block = message.event.content_block;
  if (
    index === null ||
    !isRecord(block) ||
    block.type !== 'tool_use' ||
    typeof block.id !== 'string' ||
    typeof block.name !== 'string'
  ) {
    return null;
  }

  return {
    index,
    id: block.id,
    name: block.name,
    input: block.input,
  };
}

export function claudeStreamToolInputDelta(message: ClaudeSdkMessage): { index: number; partialJson: string } | null {
  if (message.type !== 'stream_event' || !isRecord(message.event) || message.event.type !== 'content_block_delta') {
    return null;
  }

  const index = typeof message.event.index === 'number' ? message.event.index : null;
  const delta = message.event.delta;
  if (index === null || !isRecord(delta) || delta.type !== 'input_json_delta' || typeof delta.partial_json !== 'string') {
    return null;
  }

  return {
    index,
    partialJson: delta.partial_json,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
