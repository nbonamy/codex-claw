import type { RendererMessage, RendererMessagePart } from '../../shared/contracts';
import type { CodexThread, CodexThreadItem, CodexThreadTurn } from './protocol';
import { codexThreadItemToToolPart } from './tool-part-adapter';

export function codexThreadHistoryToRendererMessages(thread: CodexThread, agentId: string): RendererMessage[] {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  return turns.flatMap((turn) => codexTurnToRendererMessages(thread.id, turn, agentId));
}

function codexTurnToRendererMessages(threadId: string, turn: CodexThreadTurn, agentId: string): RendererMessage[] {
  const messages: RendererMessage[] = [];
  const assistantParts: RendererMessagePart[] = [];
  const createdAt = timestampToIso(turn.startedAt ?? turn.completedAt);
  let assistantSegmentIndex = 0;
  let sawAssistantActivity = false;

  const flushAssistantMessage = () => {
    if (assistantParts.length === 0) {
      return;
    }

    const segmentSuffix = assistantSegmentIndex === 0 ? '' : `-segment-${assistantSegmentIndex}`;
    messages.push({
      id: `assistant-${turn.id}${segmentSuffix}`,
      agentId,
      role: 'assistant',
      status: rendererMessageStatus(turn.status),
      turnId: turn.id,
      parts: [...assistantParts],
      createdAt,
    });
    assistantParts.length = 0;
    assistantSegmentIndex += 1;
  };

  for (const item of Array.isArray(turn.items) ? turn.items : []) {
    if (item.type === 'userMessage') {
      const text = userMessageText(item);
      if (text) {
        const isSteerMessage = sawAssistantActivity;
        flushAssistantMessage();
        messages.push({
          id: `user-${threadId}-${turn.id}-${item.id ?? messages.length}`,
          agentId,
          ...(isSteerMessage ? { kind: 'steer' as const } : {}),
          role: 'user',
          status: 'complete',
          turnId: turn.id,
          parts: [{ type: 'text', text }],
          createdAt,
        });
      }
      continue;
    }

    if (item.type === 'agentMessage') {
      const text = typeof item.text === 'string' ? item.text : '';
      if (text) {
        sawAssistantActivity = true;
        assistantParts.push({ type: 'text', text, itemId: item.id });
      }
      continue;
    }

    if (item.type === 'exitedReviewMode') {
      const text = typeof item.review === 'string' ? item.review : '';
      if (text) {
        sawAssistantActivity = true;
        assistantParts.push({ type: 'text', text, itemId: item.id });
      }
      continue;
    }

    const toolPart = codexThreadItemToToolPart(item);
    if (toolPart) {
      sawAssistantActivity = true;
      assistantParts.push(toolPart);
    }
  }

  flushAssistantMessage();

  return messages;
}

function userMessageText(item: CodexThreadItem): string {
  const content = Array.isArray(item.content) ? item.content : [];
  return content.map(userInputText).filter(Boolean).join('\n');
}

function userInputText(input: unknown): string {
  if (!isRecord(input) || typeof input.type !== 'string') {
    return '';
  }

  if (input.type === 'text' && typeof input.text === 'string') {
    return input.text;
  }

  if (input.type === 'skill' && typeof input.name === 'string') {
    return `$${input.name}`;
  }

  if (input.type === 'mention' && typeof input.name === 'string') {
    return `@${input.name}`;
  }

  if (input.type === 'image' && typeof input.url === 'string') {
    return `![image](${input.url})`;
  }

  if (input.type === 'localImage' && typeof input.path === 'string') {
    return `![image](${input.path})`;
  }

  return '';
}

function rendererMessageStatus(status: string): RendererMessage['status'] {
  if (status === 'completed') {
    return 'complete';
  }

  if (status === 'failed') {
    return 'error';
  }

  return 'streaming';
}

function timestampToIso(timestamp: number | null | undefined): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return new Date(0).toISOString();
  }

  return new Date(timestamp * 1000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
