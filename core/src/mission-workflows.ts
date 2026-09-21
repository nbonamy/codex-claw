import type { MissionArtifacts, MissionStage, MissionWorkflowType } from './mission-types';

export type MissionWorkflowDefinition = {
  type: MissionWorkflowType;
  version: 1;
  stages: readonly MissionStage[];
  createArtifacts: () => MissionArtifacts;
  stageReady: (stage: MissionStage, artifacts: MissionArtifacts) => boolean;
};

export const shapeAndShipFeatureWorkflow: MissionWorkflowDefinition = {
  type: 'shapeAndShipFeature',
  version: 1,
  stages: ['requirements', 'tickets', 'implementation', 'review', 'ship'],
  createArtifacts: () => ({
    requirements: { problem: '', acceptance: '' },
    tickets: [],
    implementation: { changes: '', tests: '' },
    review: { summary: '', pullRequestUrl: '' },
  }),
  stageReady(stage, artifacts) {
    switch (stage) {
      case 'requirements': return !!artifacts.requirements.problem.trim() && !!artifacts.requirements.acceptance.trim();
      case 'tickets': return artifacts.tickets.length > 0 && artifacts.tickets.every(ticket => !!ticket.title.trim() && !!ticket.repositoryPath?.trim());
      case 'implementation': return artifacts.tickets.length > 0 && artifacts.tickets.every(ticket => ticket.done) && !!artifacts.implementation.changes.trim() && !!artifacts.implementation.tests.trim();
      case 'review': return !!artifacts.review.summary.trim();
      case 'ship': return false;
    }
  },
};

const workflowDefinitions: Record<MissionWorkflowType, MissionWorkflowDefinition> = {
  shapeAndShipFeature: shapeAndShipFeatureWorkflow,
};

export const featureStages = shapeAndShipFeatureWorkflow.stages;

export function missionWorkflow(type: MissionWorkflowType): MissionWorkflowDefinition {
  return workflowDefinitions[type];
}

export function findMissionWorkflow(type: unknown): MissionWorkflowDefinition | undefined {
  return typeof type === 'string' ? workflowDefinitions[type as MissionWorkflowType] : undefined;
}
