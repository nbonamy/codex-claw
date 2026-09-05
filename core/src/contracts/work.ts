import type { BackendConversationRef } from './conversation';
import type { AppText } from './shared';

export type WorkProviderKind = 'github';

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
  completionInstructionsDeliveredAt?: string;
};

export type GitHubWorkBacklogConfiguration = {
  repositoryId?: string;
  assigneeLogin?: string;
  tagName?: string;
};

export type GitHubWorkBacklogConfigurationInput = {
  repositoryId?: string | null;
  assigneeLogin?: string | null;
  tagName?: string | null;
};

export type WorkBacklogProviderConfigurations = {
  github?: GitHubWorkBacklogConfiguration;
};

export type WorkBacklogConfigurationInput = {
  provider: 'github';
  configuration: GitHubWorkBacklogConfigurationInput;
};

export type WorkBacklogState = {
  connections: WorkIntegrationConnection[];
  providerConfigurations: WorkBacklogProviderConfigurations;
  providerSettings: Partial<Record<WorkProviderKind, WorkProviderSettings>>;
  assignments: Record<string, WorkBacklogAssignment>;
};

export type WorkProviderAuthorization = {
  provider: WorkProviderKind;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
};

export type WorkRepository = {
  provider: WorkProviderKind;
  id: string;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  isPrivate: boolean;
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
  page?: number;
  pageSize?: number;
};

export type WorkItemPage = {
  items: WorkItem[];
  page: number;
  pageSize: number;
  totalItems: number;
};

export type WorkItem = {
  provider: WorkProviderKind;
  id: string;
  kind?: WorkItemKind;
  branchName?: string;
  repositoryId: string;
  repositoryFullName: string;
  number: number;
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

export type CreateWorkItemInput = {
  agentId: string;
  provider: WorkProviderKind;
  repositoryId: string;
  description: string;
};

export type AutomationRepositoryTarget = {
  provider: 'github';
  repositoryId: string;
  sourceRepositoryPath: string;
};

export type AutomationSchedule = {
  intervalMinutes: number;
};

export type AutomationExecutionStatus = 'working' | 'completed' | 'failed';

export type AutomationExecutionCreatedAgent = {
  agentId: string;
  agentName: string;
  workItemId: string;
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
  id: string;
  name: string;
  enabled: boolean;
  repositories: AutomationRepositoryTarget[];
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
  name?: string;
  enabled?: boolean;
  repositories: AutomationRepositoryTarget[];
  teamId: string;
  selectionPrompt?: string;
  assignmentPrompt?: string;
  schedule: AutomationSchedule;
};

export type UpdateAutomationInput = CreateAutomationInput & {
  id: string;
};

export type WorkRoutingMode = 'current' | 'branch' | 'delegate';

export type WorkRoutingResult =
  | { mode: 'cancelled' }
  | { mode: 'current'; folder: string }
  | { mode: 'branch'; branchName: string; folder: string }
  | { mode: 'delegated'; agentId: string; agentName: string; branchName: string; folder: string };

export type WorkRoutingRequest = {
  id: string;
  kind: 'work_routing';
  payload: {
    request: {
      agentId: string;
      task: string;
      suggestedBranchName: string;
      sharedFolderAgentNames: string[];
    };
  };
};
