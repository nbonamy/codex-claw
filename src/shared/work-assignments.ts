import type { Agent, WorkBacklogAssignment, WorkItem, WorkProviderKind } from './contracts';

type WorkItemIdentity = Pick<WorkItem, 'provider' | 'id'> | Pick<WorkBacklogAssignment, 'provider' | 'itemId'>;
export type WorkItemAssignmentSource = Pick<WorkItem, 'provider' | 'id' | 'repositoryId' | 'repositoryFullName' | 'number' | 'title' | 'url'>;

export type WorkBacklogAssignmentMetadata = Pick<WorkBacklogAssignment, 'loopExecutionId' | 'loopId'>;

export function workBacklogAssignmentFromWorkItem(
  item: WorkItemAssignmentSource,
  agentId: string,
  assignedAt: string,
  metadata: WorkBacklogAssignmentMetadata = {},
): WorkBacklogAssignment {
  return {
    provider: item.provider,
    itemId: item.id,
    agentId,
    assignedAt,
    status: 'working',
    ...(metadata.loopId ? { loopId: metadata.loopId } : {}),
    ...(metadata.loopExecutionId ? { loopExecutionId: metadata.loopExecutionId } : {}),
  };
}

export function sanitizeWorkItemAssignmentSource(value: unknown): WorkItemAssignmentSource | null {
  const number = isRecord(value) ? value.number : null;
  if (
    !isRecord(value) ||
    !isWorkProvider(value.provider) ||
    typeof value.id !== 'string' ||
    typeof value.repositoryId !== 'string' ||
    typeof value.repositoryFullName !== 'string' ||
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    typeof value.title !== 'string' ||
    typeof value.url !== 'string'
  ) {
    return null;
  }

  return {
    provider: value.provider,
    id: value.id,
    repositoryId: value.repositoryId,
    repositoryFullName: value.repositoryFullName,
    number,
    title: value.title,
    url: value.url,
  };
}

export function workItemAssignmentKey(item: WorkItemIdentity): string {
  return `${item.provider}:${workItemIdentityId(item)}`;
}

export function isSameWorkItem(left: WorkItemIdentity, right: WorkItemIdentity): boolean {
  return workItemAssignmentKey(left) === workItemAssignmentKey(right);
}

export function findAssignedAgentForWorkItem(
  agents: Agent[],
  assignments: Record<string, WorkBacklogAssignment>,
  item: WorkItemIdentity,
): Agent | null {
  const assignment = assignments[workItemAssignmentKey(item)];
  return assignment ? agents.find((agent) => agent.id === assignment.agentId) ?? null : null;
}

export function assignedAgentsByWorkItemKey(agents: Agent[], assignments: Record<string, WorkBacklogAssignment>): Record<string, Agent> {
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const assignedAgents: Record<string, Agent> = {};
  for (const [key, assignment] of Object.entries(assignments)) {
    const agent = agentsById.get(assignment.agentId);
    if (agent) {
      assignedAgents[key] = agent;
    }
  }
  return assignedAgents;
}

function workItemIdentityId(item: WorkItemIdentity): string {
  return 'id' in item ? item.id : item.itemId;
}

function isWorkProvider(value: unknown): value is WorkProviderKind {
  return value === 'github';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
