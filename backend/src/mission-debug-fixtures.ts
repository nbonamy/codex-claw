import type { Agent, AppSnapshot } from '@codex-claw/core/contracts';
import { featureStages, type Mission, type MissionArtifacts, type MissionStage, type MissionTicket } from '@codex-claw/core/missions';
import type { MissionRun } from '@codex-claw/core/mission-execution';

export function applyMissionDebugFixture(snapshot: AppSnapshot, missionId: string, stage: MissionStage, now = new Date().toISOString()): Mission {
  const mission = snapshot.missions?.find(candidate => candidate.id === missionId);
  if (!mission) throw new Error('Mission not found.');
  if (!featureStages.includes(stage)) throw new Error('Invalid Mission debug stage.');
  const team = snapshot.teams.find(candidate => candidate.id === mission.teamId);
  const missionWorkerIds = [
    ...(mission.execution?.runs.flatMap(run => run.workerId ? [run.workerId] : []) ?? []),
    ...Object.values(mission.stageAgentIds),
  ];
  const memberIds = [...new Set(mission.execution?.memberIds?.length ? mission.execution.memberIds : (team?.agentIds ?? []))];
  const members = uniqueAgents(snapshot, memberIds);
  const workers = uniqueAgents(snapshot, missionWorkerIds.length ? missionWorkerIds : memberIds);
  if (!members.length || !workers.length) throw new Error('Add an agent to the Mission team before loading a debug fixture.');
  const repositories = [...new Set(members.flatMap(repositoryPath))].slice(0, 2);
  if (!repositories.length) repositories.push(`/debug/${mission.id}/repository`);
  const branch = `mission/debug-${slug(mission.outcome)}`;
  const tickets = debugTickets(repositories);
  const artifacts = debugArtifacts(tickets);
  const stageIndex = featureStages.indexOf(stage);
  if (stageIndex >= featureStages.indexOf('review')) artifacts.tickets = artifacts.tickets.map(ticket => ({ ...ticket, done: true }));
  const runs: MissionRun[] = [];
  const member = (index: number) => members[index % members.length]!;
  const worker = (index: number) => workers[index % workers.length]!;
  const addRun = (run: Omit<MissionRun, 'skills' | 'feedback' | 'startedAt'>): MissionRun => {
    const complete = { ...run, skills: [], feedback: '', startedAt: now };
    runs.push(complete);
    return complete;
  };

  if (stageIndex > 0) addRun({ id: `${mission.id}-debug-requirements`, stage: 'requirements', memberId: member(0).id, workerId: worker(0).id, status: 'accepted', finishedAt: now });
  if (stageIndex > 1) addRun({ id: `${mission.id}-debug-tickets`, stage: 'tickets', memberId: member(0).id, workerId: worker(0).id, status: 'accepted', finishedAt: now });

  if (stage === 'requirements') {
    const proposal = structuredClone(artifacts);
    proposal.tickets = [];
    proposal.implementation = { changes: '', tests: '' };
    proposal.review = { summary: '', pullRequestUrl: '' };
    addRun({ id: `${mission.id}-debug-requirements`, stage, memberId: member(0).id, workerId: worker(0).id, status: 'awaitingReview', proposal, summary: 'Requirements are ready for review.' });
  } else if (stage === 'tickets') {
    const proposal = structuredClone(artifacts);
    proposal.implementation = { changes: '', tests: '' };
    proposal.review = { summary: '', pullRequestUrl: '' };
    addRun({ id: `${mission.id}-debug-tickets`, stage, memberId: member(0).id, workerId: worker(0).id, status: 'awaitingReview', proposal, draftTickets: structuredClone(tickets), summary: 'The implementation backlog is ready for review.' });
  } else {
    const implementationStatuses: MissionRun['status'][] = stage === 'implementation'
      ? ['accepted', 'running', 'failed']
      : tickets.map(() => 'accepted');
    implementationStatuses.forEach((status, index) => {
      const assigned = worker(index);
      addRun({
        id: `${mission.id}-debug-implementation-${index + 1}`,
        stage: 'implementation',
        memberId: member(index).id,
        workerId: assigned.id,
        ticketIndex: index,
        repositoryPath: tickets[index]!.repositoryPath,
        status,
        ...(status === 'accepted' ? {
          implementationResult: {
            changes: `Implemented ${tickets[index]!.title.toLowerCase()} with repository-scoped changes.`,
            tests: `Focused verification for ticket ${index + 1} passes.`,
          },
          finishedAt: now,
        } : status === 'failed' ? {
          error: 'Focused verification failed in the debug fixture.',
          finishedAt: now,
        } : {}),
      });
    });
    if (stage === 'review') {
      const proposal = structuredClone(artifacts);
      addRun({ id: `${mission.id}-debug-review`, stage, memberId: member(0).id, workerId: worker(0).id, status: 'awaitingReview', proposal, summary: 'The implementation satisfies the approved Mission scope.' });
    } else if (stage === 'ship') {
      addRun({ id: `${mission.id}-debug-review`, stage: 'review', memberId: member(0).id, workerId: worker(0).id, status: 'accepted', finishedAt: now });
    }
  }

  const currentArtifacts = structuredClone(artifacts);
  if (stage === 'requirements') {
    currentArtifacts.requirements = { problem: '', acceptance: '' };
    currentArtifacts.tickets = [];
    currentArtifacts.implementation = { changes: '', tests: '' };
    currentArtifacts.review = { summary: '', pullRequestUrl: '', findings: [] };
  } else if (stage === 'tickets') {
    currentArtifacts.tickets = [];
    currentArtifacts.implementation = { changes: '', tests: '' };
    currentArtifacts.review = { summary: '', pullRequestUrl: '', findings: [] };
  } else if (stage === 'implementation') {
    currentArtifacts.tickets = currentArtifacts.tickets.map((ticket, index) => ({ ...ticket, done: index === 0 }));
    currentArtifacts.implementation = { changes: 'The first repository slice is implemented.', tests: 'Its focused tests pass.' };
    currentArtifacts.review = { summary: '', pullRequestUrl: '', findings: [] };
  } else if (stage === 'review') {
    currentArtifacts.tickets = currentArtifacts.tickets.map(ticket => ({ ...ticket, done: true }));
    currentArtifacts.review = {
      summary: '',
      pullRequestUrl: '',
      findings: [
        {
          id: 'mission-finding-debug-1', priority: 'p1', title: 'Restore the persisted review selection',
          body: 'Reloading the Mission currently loses which findings the user selected for remediation.', repositoryPath: repositories[0]!,
          location: { file: 'backend/src/mission-execution-service.ts', line: 112 }, selected: true,
          remediation: { state: 'open' }, createdAt: now, updatedAt: now,
        },
        {
          id: 'mission-finding-debug-2', priority: 'p2', title: 'Show verification evidence after remediation',
          body: 'Fixed findings should retain concise evidence so delivery approval is auditable.', repositoryPath: repositories[1] ?? repositories[0]!, selected: false,
          remediation: { state: 'fixed', completedAt: now, evidence: 'Focused Mission workflow tests passed.' }, createdAt: now, updatedAt: now,
        },
      ],
    };
  } else if (stage === 'ship') {
    currentArtifacts.tickets = currentArtifacts.tickets.map(ticket => ({ ...ticket, done: true }));
  }

  const workspaces = stageIndex >= featureStages.indexOf('implementation')
    ? repositories.map(repositoryPath => ({ repositoryPath, path: repositoryPath, branch }))
    : [];
  mission.stage = stage;
  mission.status = 'active';
  mission.artifacts = currentArtifacts;
  mission.artifactFiles = {};
  mission.stageAgentIds = Object.fromEntries(runs.filter(run => run.workerId).map(run => [run.stage, run.workerId!])) as Mission['stageAgentIds'];
  mission.execution = {
    teamId: mission.teamId,
    debugFixture: true,
    memberIds,
    workspaceName: `debug-${slug(mission.outcome)}`,
    workspaces,
    runs,
    ...(stage === 'ship' ? {
      deliveries: repositories.map((repositoryPath, index) => index < repositories.length - 1
        ? { repositoryPath, agentId: worker(index).id, status: 'pullRequestCreated' as const, pullRequest: { number: 42 + index, url: `https://example.com/debug/pull/${42 + index}` } }
        : { repositoryPath, agentId: worker(index).id, status: 'pending' as const }),
    } : {}),
  };
  mission.revision += 1;
  mission.updatedAt = now;
  return mission;
}

function uniqueAgents(snapshot: AppSnapshot, ids: string[]): Agent[] {
  const seen = new Set<string>();
  return ids.flatMap(id => {
    if (seen.has(id)) return [];
    const agent = snapshot.agents.find(candidate => candidate.id === id);
    if (!agent) return [];
    seen.add(id);
    return [agent];
  });
}

function repositoryPath(agent: Agent): string[] {
  if (agent.workspace?.kind === 'git') return [agent.workspace.primaryWorktreeRoot];
  return agent.folder ? [agent.folder] : [];
}

function debugTickets(repositories: string[]): MissionTicket[] {
  const repo = (index: number) => repositories[index % repositories.length]!;
  return [
    { id: 'mission-ticket-debug-foundation', title: 'Persist the workflow state', body: 'Add the app-owned contracts and durable state transitions for the workflow.', repositoryPath: repo(0), done: false },
    { id: 'mission-ticket-debug-execution', title: 'Build the execution board', body: 'Render repository lanes, ticket progress, and agent ownership in the Mission workspace.', repositoryPath: repo(1), done: false },
    { id: 'mission-ticket-debug-review', title: 'Connect review evidence', body: 'Present implementation evidence and repository diffs for user review.', repositoryPath: repo(0), done: false, dependsOn: [0] },
    { id: 'mission-ticket-debug-ship', title: 'Deliver each repository', body: 'Track pull request or merge completion independently for every affected repository.', repositoryPath: repo(1), done: false, dependsOn: [1, 2] },
  ];
}

function debugArtifacts(tickets: MissionTicket[]): MissionArtifacts {
  return {
    requirements: {
      problem: 'Teams need a guided path from an initial feature idea to reviewed, repository-scoped delivery without losing decisions between stages.',
      acceptance: '- The workflow keeps visible progress across every stage.\n- Artifacts remain reviewable after the workflow advances.\n- Each affected repository has an explicit delivery result.',
    },
    tickets: structuredClone(tickets),
    implementation: {
      changes: 'Implemented the Mission state model, execution board, review surface, and repository delivery controls.',
      tests: 'Core transitions, backend persistence, protocol routing, and rendered Mission behavior pass focused tests.',
    },
    review: {
      summary: 'The implementation matches the approved requirements. Repository delivery remains explicit and independently retryable.',
      pullRequestUrl: '',
      findings: [],
    },
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 32) || 'mission';
}
