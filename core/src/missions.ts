import type { AppSnapshot } from './contracts';
import { createEntityId } from './ids';

export const featureStages = ['requirements', 'tickets', 'implementation', 'review'] as const;
export type MissionStage = typeof featureStages[number];
export type MissionArtifacts = {
  requirements: { problem: string; acceptance: string };
  tickets: { title: string; done: boolean }[];
  implementation: { changes: string; tests: string };
  review: { summary: string; pullRequestUrl: string };
};
export type Mission = {
  id: string;
  outcome: string;
  workflow: { type: 'shapeAndShipFeature'; version: 1 };
  stage: MissionStage;
  status: 'active' | 'completed';
  artifacts: MissionArtifacts;
  stageAgentIds: Partial<Record<MissionStage, string>>;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type CreateMissionInput = { outcome: string; workflowType: Mission['workflow']['type'] };
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
    && Array.isArray(v.tickets) && v.tickets.length <= 200 && v.tickets.every(t => record(t) && text(t.title) && typeof t.done === 'boolean')
    && record(v.implementation) && text(v.implementation.changes) && text(v.implementation.tests)
    && record(v.review) && text(v.review.summary) && text(v.review.pullRequestUrl)
    && (!v.review.pullRequestUrl || /^https?:\/\//.test(v.review.pullRequestUrl));
}
function isStageAgents(v: unknown): v is Mission['stageAgentIds'] {
  return record(v) && Object.entries(v).every(([k, id]) => featureStages.includes(k as MissionStage) && typeof id === 'string');
}
export function isMission(v: unknown): v is Mission {
  return record(v) && text(v.id) && text(v.outcome) && !!v.outcome.trim() && v.outcome.length <= 200
    && record(v.workflow) && v.workflow.type === 'shapeAndShipFeature' && v.workflow.version === 1
    && featureStages.includes(v.stage as MissionStage) && ['active', 'completed'].includes(v.status as string)
    && (v.status !== 'completed' || v.stage === 'review') && isMissionArtifacts(v.artifacts) && isStageAgents(v.stageAgentIds)
    && Number.isInteger(v.revision) && (v.revision as number) >= 0 && text(v.createdAt) && text(v.updatedAt);
}
export function missionStageReady(stage: MissionStage, a: MissionArtifacts): boolean {
  switch (stage) {
    case 'requirements': return !!a.requirements.problem.trim() && !!a.requirements.acceptance.trim();
    case 'tickets': return a.tickets.length > 0 && a.tickets.every(t => !!t.title.trim());
    case 'implementation': return a.tickets.length > 0 && a.tickets.every(t => t.done) && !!a.implementation.changes.trim() && !!a.implementation.tests.trim();
    case 'review': return !!a.review.summary.trim();
  }
}
export function createMission(snapshot: AppSnapshot, input: unknown): Mission {
  if (!record(input) || typeof input.outcome !== 'string' || !input.outcome.trim() || input.outcome.trim().length > 200 || input.workflowType !== 'shapeAndShipFeature') throw new Error('Invalid mission outcome or workflow.');
  const now = new Date().toISOString();
  const mission: Mission = {
    id: createEntityId('mission'), outcome: input.outcome.trim(), workflow: { type: 'shapeAndShipFeature', version: 1 },
    stage: 'requirements', status: 'active', revision: 0, createdAt: now, updatedAt: now,
    artifacts: { requirements: { problem: '', acceptance: '' }, tickets: [], implementation: { changes: '', tests: '' }, review: { summary: '', pullRequestUrl: '' } },
    stageAgentIds: {},
  };
  (snapshot.missions ??= []).push(mission);
  return mission;
}
export function updateMission(snapshot: AppSnapshot, input: unknown): Mission {
  if (!record(input) || !isMissionArtifacts(input.artifacts) || !isStageAgents(input.stageAgentIds) || !['save', 'advance'].includes(input.action as string)) throw new Error('Invalid mission update.');
  const mission = snapshot.missions?.find(m => m.id === input.id);
  if (!mission) throw new Error('Mission not found.');
  if (mission.revision !== input.revision) throw new Error('This mission changed. Reopen it before saving.');
  if (mission.status === 'completed') throw new Error('This mission is completed.');
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
