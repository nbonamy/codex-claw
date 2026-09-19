import { pendingMissionRun, type MissionExecution } from './mission-execution';
import type { AppSnapshot } from './contracts';
import { createEntityId } from './ids';

export const featureStages = ['requirements', 'tickets', 'implementation', 'review'] as const;
export type MissionStage = typeof featureStages[number];
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
export type Mission = {
  id: string;
  teamId: string;
  outcome: string;
  workflow: { type: 'shapeAndShipFeature'; version: 1 };
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
  workflowType: Mission['workflow']['type'];
  teamId: string;
  orchestratorMemberId: string;
};
export type DeleteMissionInput = { id: string; revision: number };
export type UpdateMissionInput = {
  id: string;
  revision: number;
  artifacts: MissionArtifacts;
  stageAgentIds: Mission['stageAgentIds'];
  action: 'save' | 'advance';
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 100_000;
export function isMissionArtifacts(v: unknown): v is MissionArtifacts {
  return record(v) && record(v.requirements) && text(v.requirements.problem) && text(v.requirements.acceptance)
    && Array.isArray(v.tickets) && v.tickets.length <= 200 && v.tickets.every(t => record(t) && (t.id === undefined || (text(t.id) && /^mission-ticket-[a-zA-Z0-9-]+$/.test(t.id))) && text(t.title) && (t.body === undefined || text(t.body)) && (t.repositoryPath === undefined || (text(t.repositoryPath) && !!t.repositoryPath.trim())) && typeof t.done === 'boolean' && (t.reference === undefined || (text(t.reference) && !!t.reference.trim())) && (t.dependsOn === undefined || (Array.isArray(t.dependsOn) && t.dependsOn.every(n => Number.isInteger(n) && n >= 0)))) && validTicketDependencies(v.tickets as MissionTicket[])
    && record(v.implementation) && text(v.implementation.changes) && text(v.implementation.tests)
    && record(v.review) && text(v.review.summary) && text(v.review.pullRequestUrl)
    && (!v.review.pullRequestUrl || /^https?:\/\//.test(v.review.pullRequestUrl));
}
function validTicketDependencies(tickets: MissionTicket[]): boolean {
  const visited = new Set<number>();
  const visiting = new Set<number>();
  const visit = (index: number): boolean => {
    if (visiting.has(index) || !tickets[index]) return false;
    if (visited.has(index)) return true;
    visiting.add(index);
    if (!(tickets[index]!.dependsOn ?? []).every(visit)) return false;
    visiting.delete(index); visited.add(index); return true;
  };
  return tickets.every((_, index) => visit(index));
}
export function missionTicketReady(tickets: MissionTicket[], index: number): boolean {
  const ticket = tickets[index];
  return !!ticket && !ticket.done && (ticket.dependsOn ?? []).every(blocker => tickets[blocker]?.done);
}
function isStageAgents(v: unknown): v is Mission['stageAgentIds'] {
  return record(v) && Object.entries(v).every(([k, id]) => featureStages.includes(k as MissionStage) && typeof id === 'string');
}
function isArtifactFiles(v: unknown): v is Mission['artifactFiles'] {
  return record(v) && Object.entries(v).every(([stage, file]) => featureStages.includes(stage as MissionStage)
    && record(file) && Number.isInteger(file.revision) && (file.revision as number) > 0
    && Number.isInteger(file.size) && (file.size as number) >= 0 && text(file.updatedAt));
}
export function isMission(v: unknown): v is Mission {
  return record(v) && text(v.id) && text(v.teamId) && text(v.outcome) && !!v.outcome.trim() && v.outcome.length <= 200
    && record(v.workflow) && v.workflow.type === 'shapeAndShipFeature' && v.workflow.version === 1
    && featureStages.includes(v.stage as MissionStage) && ['active', 'completed'].includes(v.status as string)
    && (v.status !== 'completed' || v.stage === 'review') && isMissionArtifacts(v.artifacts)
    && (v.artifactFiles === undefined || isArtifactFiles(v.artifactFiles)) && isStageAgents(v.stageAgentIds)
    && (v.execution === undefined || isMissionExecution(v.execution))
    && Number.isInteger(v.revision) && (v.revision as number) >= 0 && text(v.createdAt) && text(v.updatedAt);
}
export function missionStageReady(stage: MissionStage, a: MissionArtifacts): boolean {
  switch (stage) {
    case 'requirements': return !!a.requirements.problem.trim() && !!a.requirements.acceptance.trim();
    case 'tickets': return a.tickets.length > 0 && a.tickets.every(t => !!t.title.trim() && !!t.repositoryPath?.trim());
    case 'implementation': return a.tickets.length > 0 && a.tickets.every(t => t.done) && !!a.implementation.changes.trim() && !!a.implementation.tests.trim();
    case 'review': return !!a.review.summary.trim();
  }
}
export function createMission(snapshot: AppSnapshot, input: unknown): Mission {
  if (!record(input) || typeof input.outcome !== 'string' || !input.outcome.trim() || input.outcome.trim().length > 200 || input.workflowType !== 'shapeAndShipFeature'
    || typeof input.teamId !== 'string' || typeof input.orchestratorMemberId !== 'string') throw new Error('Invalid mission outcome or workflow.');
  const team = snapshot.teams.find(team => team.id === input.teamId && !team.remoteConnectionId);
  const orchestrator = snapshot.agents.find(agent => agent.id === input.orchestratorMemberId && agent.teamId === team?.id);
  if (!team || !orchestrator) throw new Error('Choose a local team and one of its agents to orchestrate the mission.');
  const now = new Date().toISOString();
  const mission: Mission = {
    id: createEntityId('mission'), teamId: team.id, outcome: input.outcome.trim(), workflow: { type: 'shapeAndShipFeature', version: 1 },
    stage: 'requirements', status: 'active', revision: 0, createdAt: now, updatedAt: now,
    artifacts: { requirements: { problem: '', acceptance: '' }, tickets: [], implementation: { changes: '', tests: '' }, review: { summary: '', pullRequestUrl: '' } },
    artifactFiles: {},
    stageAgentIds: {},
    execution: { teamId: team.id, memberIds: [...team.agentIds], reviewPolicy: 'reviewEachTicket', workspaces: [], runs: [] },
  };
  (snapshot.missions ??= []).push(mission);
  return mission;
}
export function deleteMission(snapshot: AppSnapshot, input: unknown): Mission {
  if (!record(input) || typeof input.id !== 'string' || !Number.isInteger(input.revision)) throw new Error('Invalid mission deletion.');
  const mission = snapshot.missions?.find(mission => mission.id === input.id);
  if (!mission) throw new Error('Mission not found.');
  if (mission.revision !== input.revision) throw new Error('This mission changed. Reload before deleting it.');
  snapshot.missions = snapshot.missions!.filter(candidate => candidate.id !== mission.id);
  return mission;
}
export function updateMission(snapshot: AppSnapshot, input: unknown): Mission {
  if (!record(input) || !isMissionArtifacts(input.artifacts) || !isStageAgents(input.stageAgentIds) || !['save', 'advance'].includes(input.action as string)) throw new Error('Invalid mission update.');
  const mission = snapshot.missions?.find(m => m.id === input.id);
  if (!mission) throw new Error('Mission not found.');
  if (mission.revision !== input.revision) throw new Error('This mission changed. Reopen it before saving.');
  if (mission.status === 'completed') throw new Error('This mission is completed.');
  if (pendingMissionRun(mission)) throw new Error('Review or stop the current mission run before editing artifacts or advancing.');
  if (Object.values(input.stageAgentIds).some(id => !snapshot.agents.some(a => a.id === id))) throw new Error('Supporting agent not found.');
  // Earlier gates remain true even when revising their artifacts in later stages.
  const stageIndex = featureStages.indexOf(mission.stage);
  const requiredStages = featureStages.slice(0, stageIndex + (input.action === 'advance' ? 1 : 0));
  if (requiredStages.some(stage => !missionStageReady(stage, input.artifacts as MissionArtifacts))) throw new Error('Complete the required stage artifacts before continuing.');
  const updated = { ...mission, artifacts: structuredClone(input.artifacts), stageAgentIds: { ...input.stageAgentIds }, revision: mission.revision + 1, updatedAt: new Date().toISOString() };
  if (input.action === 'advance') {
    if (mission.stage === 'review') updated.status = 'completed';
    else updated.stage = featureStages[stageIndex + 1]!;
  }
  Object.assign(mission, updated);
  return mission;
}

function isMissionExecution(v: unknown): v is MissionExecution {
  return record(v) && text(v.teamId) && (v.repoPath === undefined || text(v.repoPath)) && Array.isArray(v.memberIds) && v.memberIds.every(text)
    && (v.reviewPolicy === undefined || ['reviewEachTicket', 'reviewAfterImplementation'].includes(v.reviewPolicy as string))
    && (v.workspaceName === undefined || (text(v.workspaceName) && !!v.workspaceName.trim()))
    && (v.workspaces === undefined || (Array.isArray(v.workspaces) && v.workspaces.every(workspace => record(workspace)
      && text(workspace.repositoryPath) && !!workspace.repositoryPath.trim()
      && text(workspace.path) && !!workspace.path.trim() && text(workspace.branch) && !!workspace.branch.trim()
      && (workspace.baseSha === undefined || (typeof workspace.baseSha === 'string' && /^[a-f0-9]{40,64}$/.test(workspace.baseSha))))))
    && (v.workspace === undefined || (record(v.workspace) && text(v.workspace.path) && text(v.workspace.branch) && (v.workspace.baseSha === undefined || (typeof v.workspace.baseSha === 'string' && /^[a-f0-9]{40,64}$/.test(v.workspace.baseSha)))))
    && Array.isArray(v.runs) && v.runs.every(run => record(run) && text(run.id) && text(run.memberId)
      && featureStages.includes(run.stage as MissionStage)
      && ['preparing', 'running', 'awaitingReview', 'accepted', 'cancelled', 'failed'].includes(run.status as string)
      && (run.workerId === undefined || text(run.workerId))
      && (run.ticketIndex === undefined || (Number.isInteger(run.ticketIndex) && (run.ticketIndex as number) >= 0))
      && (run.repositoryPath === undefined || (text(run.repositoryPath) && !!run.repositoryPath.trim()))
      && (run.implementationResult === undefined || (record(run.implementationResult) && text(run.implementationResult.changes) && text(run.implementationResult.tests)))
      && Array.isArray(run.skills) && run.skills.every(skill => record(skill) && text(skill.name) && text(skill.path))
      && text(run.feedback) && text(run.startedAt)
      && (run.finishedAt === undefined || text(run.finishedAt))
      && (run.summary === undefined || text(run.summary)) && (run.error === undefined || text(run.error))
      && (run.proposal === undefined || isMissionArtifacts(run.proposal))
      && (run.draftTickets === undefined || isMissionArtifacts({ requirements: { problem: '', acceptance: '' }, tickets: run.draftTickets, implementation: { changes: '', tests: '' }, review: { summary: '', pullRequestUrl: '' } })));
}
