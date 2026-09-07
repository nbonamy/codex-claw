import type { MainToRendererEvent } from './contracts';

export type ProviderConversationEventView = {
  type: string;
  agentId?: string;
  turnId?: string;
  payload: unknown;
};

/** Unwraps provider-owned conversation frames without exposing provider details to callers. */
export function providerConversationEventView(
  event: MainToRendererEvent,
): ProviderConversationEventView {
  if (
    event.type === 'codex.conversationEventReceived' ||
    event.type === 'claude.conversationEventReceived'
  ) {
    return {
      type: event.payload.event.type,
      agentId: event.agentId,
      ...('turnId' in event.payload.event && typeof event.payload.event.turnId === 'string'
        ? { turnId: event.payload.event.turnId }
        : {}),
      payload: event.payload.event.payload,
    };
  }
  return {
    type: event.type,
    ...(event.agentId ? { agentId: event.agentId } : {}),
    ...(event.turnId ? { turnId: event.turnId } : {}),
    payload: event.payload,
  };
}
