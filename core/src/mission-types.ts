export type MissionWorkflowType = 'shapeAndShipFeature';
export type MissionStage = 'requirements' | 'tickets' | 'implementation' | 'review' | 'ship';

export type MissionTicket = {
  id?: string;
  title: string;
  body?: string;
  repositoryPath?: string;
  done: boolean;
  reference?: string;
  dependsOn?: number[];
};
export type MissionArtifacts = {
  requirements: { problem: string; acceptance: string };
  tickets: MissionTicket[];
  implementation: { changes: string; tests: string };
  review: { summary: string; pullRequestUrl: string };
};
export type MissionArtifactFile = {
  revision: number;
  size: number;
  updatedAt: string;
};
export type MissionRun = {
  id: string;
  stage: MissionStage;
  memberId: string;
  workerId?: string;
  ticketIndex?: number;
  repositoryPath?: string;
  status: 'preparing' | 'running' | 'awaitingReview' | 'accepted' | 'cancelled' | 'failed';
  skills: { name: string; path: string }[];
  feedback: string;
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
  proposal?: MissionArtifacts;
  draftTickets?: MissionTicket[];
  implementationResult?: { changes: string; tests: string };
};
export type MissionReviewPolicy = 'reviewEachTicket' | 'reviewAfterImplementation';
export type MissionWorkspace = { repositoryPath: string; path: string; branch: string; baseSha?: string };
export type MissionDelivery = {
  repositoryPath: string;
  agentId: string;
  status: 'pending' | 'pullRequestCreated' | 'merged';
  pullRequest?: { number: number; url: string };
};
export type MissionExecution = {
  teamId: string;
  debugFixture?: true;
  repoPath?: string;
  memberIds: string[];
  workspace?: { path: string; branch: string; baseSha?: string };
  workspaceName?: string;
  workspaces?: MissionWorkspace[];
  deliveries?: MissionDelivery[];
  reviewPolicy?: MissionReviewPolicy;
  runs: MissionRun[];
};
export type Mission = {
  id: string;
  teamId: string;
  outcome: string;
  workflow: { type: MissionWorkflowType; version: 1 };
  stage: MissionStage;
  status: 'active' | 'completed';
  artifacts: MissionArtifacts;
  artifactFiles?: Partial<Record<MissionStage, MissionArtifactFile>>;
  stageAgentIds: Partial<Record<MissionStage, string>>;
  execution?: MissionExecution;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type CreateMissionInput = {
  outcome: string;
  workflowType: MissionWorkflowType;
  teamId: string;
  orchestratorMemberId: string;
};
export type DeleteMissionInput = { id: string; revision: number; deleteWorktrees: boolean; confirmed: true };
export type UpdateMissionInput = {
  id: string;
  revision: number;
  artifacts: MissionArtifacts;
  stageAgentIds: Mission['stageAgentIds'];
  action: 'save' | 'advance';
};
export type MissionExecutionInput = { id: string; revision: number } & (
  | { action: 'configure'; teamId: string; memberIds: string[] }
  | { action: 'attachRepository'; repoPath: string }
  | { action: 'run'; memberId?: string; ticketIndex?: number; feedback?: string }
  | { action: 'accept'; runId: string }
  | { action: 'cancel'; runId: string }
  | { action: 'recordDelivery'; repositoryPath: string; result: { kind: 'pullRequest'; number: number; url: string } | { kind: 'merge' } }
  | { action: 'reopen'; stage: MissionStage }
);
export type MissionResultInput = { missionId: string; runId: string; artifacts: MissionArtifacts; summary: string };
export type MissionToolContext = { missionId: string; runId: string; stage: MissionStage };
export type MissionArtifactWriteInput = { stage: MissionStage; content: string; expectedRevision?: number };
export type MissionArtifactReadResult = { stage: MissionStage; content: string; revision: number; updatedAt: string };
export type MissionTicketDraftInput = { ticketId?: string; title: string; body: string; repositoryPath: string; reference?: string; blockedByTicketIds?: string[] };
export type MissionTicketDraftResult = { success: true; ticketId: string; index: number; artifactRevision: number };
export type MissionExecutionPolicyResult = { success: true; reviewPolicy: MissionReviewPolicy };
