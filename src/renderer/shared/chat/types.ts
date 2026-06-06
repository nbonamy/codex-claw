export type ToolExecutionState = 'running' | 'completed' | 'error' | 'canceled';

export type ToolStatusDescriptor = {
  action: string;
  phase: string;
  params?: Record<string, unknown>;
  source: string;
};

export type MessageToolCall = {
  args: unknown;
  done?: boolean;
  function: string;
  id: string;
  state: ToolExecutionState;
  status?: string;
  result: unknown;
};

export function getMessageToolCallName(toolCall: MessageToolCall) {
  return toolCall.function;
}

export function getMessageToolCallArgs(toolCall: MessageToolCall) {
  return toolCall.args;
}

export type MessageMedia = {
  alt?: string;
  mimeType?: string;
  prompt?: string;
  title?: string;
  url: string;
};

export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool'; toolCall: MessageToolCall };

export type MessageSuggestedPrompt = {
  kind: 'chat' | 'idea';
  text: string;
};

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  engine?: string;
  id?: string;
  model?: string;
  parts?: MessagePart[];
  streaming?: boolean;
  suggestedPrompts?: MessageSuggestedPrompt[];
  toolCalls?: MessageToolCall[];
  type?: 'compaction' | 'display' | 'steer' | 'text';
};

export type ChatModelOption = {
  engine: string;
  internalId: string;
  label: string;
};
