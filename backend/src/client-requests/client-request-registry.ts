import type { Agent, AgentBackend, AppSnapshot, MainToRendererEvent } from '@codex-claw/core/contracts';

export type ClientRequestOwner =
  | { kind: 'driver'; backend: AgentBackend; remoteConnectionId?: string }
  | { kind: 'workRouting'; remoteConnectionId?: string };

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
    if (event.type === 'workRouting.requested') {
      const request = event.payload;
      this.owners.set(request.id, {
        kind: 'workRouting',
        ...(remoteConnectionIdOverride ? { remoteConnectionId: remoteConnectionIdOverride } : {}),
      });
      return;
    }

    if (
      event.type !== 'approval.requested' &&
      event.type !== 'backendApproval.requested' &&
      event.type !== 'toolInput.requested'
    ) {
      return;
    }

    const requestId = event.type === 'backendApproval.requested'
      ? nonBlankRequestId(event.payload.approval?.id)
      : event.payload.id;
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

  recordProjectedWorkRouting(connectionId: string, remoteSnapshot: AppSnapshot, remoteTeamId: string): void {
    const agentIds = new Set(remoteSnapshot.teams.find((team) => team.id === remoteTeamId)?.agentIds ?? []);
    for (const request of remoteSnapshot.workRoutingRequests ?? []) {
      if (agentIds.has(request.payload.request.agentId)) {
        this.owners.set(request.id, { kind: 'workRouting', remoteConnectionId: connectionId });
      }
    }
  }
}

function nonBlankRequestId(value: string | undefined): string | null {
  return value?.trim() ? value : null;
}
