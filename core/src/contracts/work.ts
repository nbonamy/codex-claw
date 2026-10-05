import type { BackendConversationRef } from './conversation';
import type { AppText } from './shared';

import type { WorkProviderKind } from '../work-providers';
export type { WorkProviderKind } from '../work-providers';

export type WorkIntegrationStatus = 'notConfigured' | 'disconnected' | 'connecting' | 'connected' | 'error';

export type WorkIntegrationConnection = {
  provider: WorkProviderKind;
  status: WorkIntegrationStatus;
  accountLabel?: string;
  detail?: AppText;
  connectedAt?: string;
};

export type WorkProviderSettings = {
  oauthClientId?: string;
};

export type WorkBacklogAssignmentPolicy = 'complete' | 'review';

export type WorkBacklogAssignmentStatus = 'blocked' | 'completed' | 'inProgress' | 'readyForReview';

export type WorkBacklogAssignment = {
  item?: WorkItemReference;
  provider: WorkProviderKind;
  itemId: string;
  agentId: string;
  assignedAt: string;
  policy: WorkBacklogAssignmentPolicy;
  status: WorkBacklogAssignmentStatus;
  completedAt?: string;
  note?: string;
  updatedAt?: string;
  automationId?: string;
  automationExecutionId?: string;
};

export type WorkItemReference = Pick<WorkItem, 'provider' | 'id' | 'sourceId' | 'sourceName' | 'number' | 'title' | 'url' | 'identifier' | 'body'>;

export type WorkSourceConfiguration = {
  sourceId?: string;
  assigneeLogin?: string;
  tagName?: string;
};

export type WorkSourceConfigurationInput = {
  sourceId?: string | null;
  assigneeLogin?: string | null;
  tagName?: string | null;
};

export type WorkBacklogProviderConfigurations = Partial<Record<WorkProviderKind, WorkSourceConfiguration>>;

export type WorkBacklogConfigurationInput = {
  provider: WorkProviderKind;
  configuration: WorkSourceConfigurationInput;
};

export type WorkBacklogState = {
  connections: WorkIntegrationConnection[];
  providerConfigurations: WorkBacklogProviderConfigurations;
  providerSettings: Partial<Record<WorkProviderKind, WorkProviderSettings>>;
  assignments: Record<string, WorkBacklogAssignment>;
};

export type WorkProviderAuthorization = {
  provider: WorkProviderKind;
  flow?: 'browser';
  userCode?: string;
  verificationUri: string;
  expiresAt: string;
};

/** An opaque provider-owned backlog scope, independent of an execution repository. */
export type WorkSource = {
  provider: WorkProviderKind;
  id: string;
  owner?: string;
  name: string;
  fullName: string;
  url: string;
  isPrivate?: boolean;
  updatedAt?: string;
  workItemsUpdatedAt?: string;
};

export type WorkItemLabel = {
  name: string;
  color?: string;
};

export type WorkItemState = 'open' | 'closed';

export type WorkItemKind = 'issue' | 'pullRequest';

export type WorkItemQuery = {
  kind?: WorkItemKind | 'all';
  state?: WorkItemState | 'all';
};

export type GlobalWorkItemQuery = WorkItemQuery & {
  assignment?: 'all' | 'viewer';
  cursor?: string;
  pageSize?: number;
};

export type WorkItemPage = {
  items: WorkItem[];
  /** Absent when the provider has no further results. Opaque to callers. */
  nextCursor?: string;
  /** Only supplied when the provider can report a reliable total cheaply. */
  totalItems?: number;
};

export type WorkItem = {
  provider: WorkProviderKind;
  id: string;
  kind?: WorkItemKind;
  branchName?: string;
  sourceId: string;
  sourceName: string;
  /** Optional native numeric reference, used only by code-host operations. */
  number?: number;
  identifier?: string;
  nativeState?: string;
  assignedToViewer?: boolean;
  title: string;
  url: string;
  state: WorkItemState;
  authorName?: string;
  assignees?: string[];
  body?: string;
  labels: WorkItemLabel[];
  createdAt: string;
  updatedAt: string;
};

export type AutomationWorkSourceTarget = {
  provider: WorkProviderKind;
  sourceId: string;
  executionRepositoryPath: string;
};

export type AutomationSchedule = {
  intervalMinutes: number;
};

export type AutomationExecutionStatus = 'working' | 'completed' | 'failed';

export type AutomationExecutionCreatedAgent = {
  agentId: string;
  agentName: string;
  workItemId: string;
  workItemIdentifier?: string;
  workItemTitle: string;
  workItemUrl: string;
  conversationRef?: BackendConversationRef;
};

export type AutomationExecutionLogEntry = {
  id: string;
  automationId: string;
  startedAt: string;
  completedAt?: string;
  status: AutomationExecutionStatus;
  createdCount: number;
  createdAgents: AutomationExecutionCreatedAgent[];
  error?: string;
};

export type Automation = {
  /** Absent only in legacy snapshots, whose engine was Codex. */
  backend?: import('../contracts').AgentBackend;
  id: string;
  name: string;
  enabled: boolean;
  repositories: AutomationWorkSourceTarget[];
  teamId: string;
  selectionPrompt?: string;
  assignmentPrompt?: string;
  schedule: AutomationSchedule;
  executionLog: AutomationExecutionLogEntry[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastError?: string;
  lastCreatedCount?: number;
};

export type AutomationLocation =
  | {
    kind: 'local';
  }
  | {
    kind: 'remote';
    remoteConnectionId: string;
  };

export type CreateAutomationInput = {
  backend?: import('../contracts').AgentBackend;
  name?: string;
  enabled?: boolean;
  repositories: AutomationWorkSourceTarget[];
  teamId: string;
  selectionPrompt?: string;
  assignmentPrompt?: string;
  schedule: AutomationSchedule;
};

export type UpdateAutomationInput = CreateAutomationInput & {
  id: string;
};
