import type { Agent, AgentBackend, AppSnapshot, ClientRequest, MainToRendererEvent } from '@codex-claw/core/contracts';

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
    if (
      event.type !== 'approval.requested' &&
      event.type !== 'backendApproval.requested' &&
      event.type !== 'toolInput.requested'
    ) {
      return;
    }

    const requestId = event.type === 'backendApproval.requested'
      ? backendApprovalRequestId(event.payload)
      : clientRequest(event.payload)?.id ?? null;
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

function clientRequest(value: unknown): ClientRequest | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('id' in value) ||
    !('kind' in value) ||
    typeof value.id !== 'string' ||
    (value.kind !== 'confirm_tool' && value.kind !== 'ask_user')
  ) {
    return null;
  }
  return value as ClientRequest;
}

function backendApprovalRequestId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const approval = (value as Record<string, unknown>).approval;
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return null;
  const id = (approval as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}
