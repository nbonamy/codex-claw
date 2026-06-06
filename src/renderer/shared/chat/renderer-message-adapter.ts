import type { RendererMessage, RendererMessagePart } from '../../../shared/contracts';
import type { Message, MessagePart, MessageToolCall, ToolExecutionState } from './types';

export function rendererMessagesToChatMessages(messages: RendererMessage[]): Message[] {
  return messages.map(rendererMessageToChatMessage);
}

export function rendererMessageToChatMessage(message: RendererMessage): Message {
  const contentParts: string[] = [];
  const parts: MessagePart[] = [];
  const toolCalls: MessageToolCall[] = [];

  for (const part of message.parts) {
    if (part.type === 'tool') {
      const toolCall = rendererToolPartToToolCall(message, part, toolCalls.length);
      toolCalls.push(toolCall);
      parts.push({ type: 'tool', toolCall });
    } else {
      contentParts.push(part.text);
      parts.push({ type: 'text', content: part.text });
    }
  }

  return {
    content: contentParts.join('\n\n'),
    createdAt: message.createdAt,
    id: message.id,
    parts,
    role: message.role === 'user' ? 'user' : 'assistant',
    streaming: message.status === 'streaming',
    toolCalls,
    ...(message.kind === 'compaction' ? { compactionStatus: message.status === 'streaming' ? 'running' : 'completed' } : {}),
    type: message.kind === 'compaction' ? 'compaction' : message.kind === 'steer' ? 'steer' : 'text',
  };
}

function rendererToolPartToToolCall(message: RendererMessage, part: Extract<RendererMessagePart, { type: 'tool' }>, index: number): MessageToolCall {
  return {
    args: part.input ?? (part.body ? { output: part.body } : undefined),
    done: part.status !== 'running',
    function: part.title,
    id: part.id || `${message.id}-tool-${index}`,
    result: rendererToolPartResult(part),
    state: rendererToolStatusToState(part.status),
    status: part.statusText ?? part.status,
  };
}

function rendererToolPartResult(part: Extract<RendererMessagePart, { type: 'tool' }>): unknown {
  if (isRecord(part.output) && 'structuredContent' in part.output) {
    return part.output.structuredContent;
  }

  return part.body ?? part.output;
}

function rendererToolStatusToState(status: Extract<RendererMessagePart, { type: 'tool' }>['status']): ToolExecutionState {
  if (status === 'running') {
    return 'running';
  }

  return status === 'failed' ? 'error' : 'completed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
