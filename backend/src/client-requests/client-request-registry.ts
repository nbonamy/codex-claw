import type { Agent, AgentBackend, AppSnapshot, MainToRendererEvent } from '@codex-claw/core/contracts';
import { providerConversationEventView } from '@codex-claw/core/provider-conversation-event';

export type ClientRequestOwner = { kind: 'driver'; backend: AgentBackend; remoteConnectionId?: string };

export type ClientRequestRegistryOptions = {
  getSnapshot: () => AppSnapshot;
  remoteConnectionIdForAgent: (agent: Pick<Agent, 'teamId'>) => string | null;
};

/** Tracks the backend or remote clawd responsible for each pending client request. */
export class ClientRequestRegistry {
  private readonly owners = new Map<string, ClientRequestOwner>();

  constructor(private readonly options: ClientRequestRegistryOptions) {}

  owner(requestId: string): ClientRequestOwner | undefined {
    return this.owners.get(requestId);
  }

  delete(requestId: string): void {
    this.owners.delete(requestId);
  }

  record(event: MainToRendererEvent, remoteConnectionIdOverride?: string): void {
    const conversationEvent = providerConversationEventView(event);
    if (
      conversationEvent.type !== 'approval.requested' &&
      event.type !== 'backendApproval.requested' &&
      conversationEvent.type !== 'toolInput.requested' &&
      conversationEvent.type !== 'clientRequest.requested'
    ) {
      return;
    }

    const requestId = event.type === 'backendApproval.requested'
      ? nonBlankRequestId(event.payload.approval?.id)
      : requestIdFromPayload(conversationEvent.payload);
    if (!requestId) return;

    const snapshot = this.options.getSnapshot();
    const ownerAgent = event.agentId
      ? snapshot.agents.find((agent) => agent.id === event.agentId)
      : undefined;
    const backend = event.backend ?? ownerAgent?.backend;
    if (!backend) return;

    const remoteConnectionId = remoteConnectionIdOverride
      ?? (ownerAgent ? this.options.remoteConnectionIdForAgent(ownerAgent) : null);
    this.owners.set(requestId, {
      kind: 'driver',
      backend,
      ...(remoteConnectionId ? { remoteConnectionId } : {}),
    });
  }

}

function requestIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const directId = nonBlankRequestId('id' in payload && typeof payload.id === 'string' ? payload.id : undefined);
  if (directId) return directId;
  if (!('request' in payload)) return null;
  return requestIdFromPayload(payload.request);
}

function nonBlankRequestId(value: string | undefined): string | null {
  return value?.trim() ? value : null;
}
