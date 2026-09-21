import { createEntityId } from '@codex-claw/core/ids';
import type { AppSnapshot } from '@codex-claw/core/contracts';
import { featureStages, isMissionArtifacts, type Mission, type MissionStage, type MissionTicket } from '@codex-claw/core/missions';
import { missionDeveloperInstructions, type MissionArtifactReadResult, type MissionArtifactWriteInput, type MissionExecutionInput, type MissionExecutionPolicyResult, type MissionReviewPolicy, type MissionTicketDraftInput, type MissionTicketDraftResult, type MissionToolContext } from '@codex-claw/core/mission-execution';
import type { MissionService } from './mission-service';
import { missionTeamRepositories } from './mission-execution-policy';

export type MissionAgentToolsPorts = {
  snapshot: AppSnapshot;
  missions: MissionService;
  publish(): Promise<unknown>;
  readArtifact(missionId: string, stage: MissionStage): Promise<string>;
  writeArtifact(missionId: string, stage: MissionStage, content: string): Promise<{ size: number }>;
  validateRepository(path: string): Promise<void>;
};

export class MissionAgentTools {
  constructor(
    private readonly ports: MissionAgentToolsPorts,
    private readonly executeMission: (input: MissionExecutionInput) => Promise<void>,
  ) {}

  contextForAgent(agentId: string): MissionToolContext | undefined {
    for (const mission of this.ports.snapshot.missions ?? []) {
      const run = mission.execution?.runs.find(run => (
        run.workerId === agentId && ['running', 'awaitingReview'].includes(run.status) && run.stage === mission.stage
      ));
      if (run) return { missionId: mission.id, runId: run.id, stage: run.stage };
    }
    return undefined;
  }

  developerInstructionsForAgent(agentId: string): string | undefined {
    const context = this.contextForAgent(agentId);
    if (!context) return undefined;
    const mission = this.requireMission(context.missionId);
    const run = mission.execution!.runs.find(candidate => candidate.id === context.runId)!;
    return missionDeveloperInstructions(mission, run, missionTeamRepositories(this.ports.snapshot, mission));
  }

  listArtifacts(agentId: string) {
    const context = this.requireContext(agentId);
    const mission = this.requireMission(context.missionId);
    return featureStages.flatMap(stage => {
      const file = mission.artifactFiles?.[stage];
      return file ? [{ stage, ...file }] : [];
    });
  }

  async readArtifact(agentId: string, stage: MissionStage): Promise<MissionArtifactReadResult> {
    const context = this.requireContext(agentId);
    return this.readArtifactForMission(context.missionId, stage);
  }

  async readArtifactForMission(missionId: string, stage: MissionStage): Promise<MissionArtifactReadResult> {
    if (!featureStages.includes(stage)) throw new Error('Invalid mission artifact stage.');
    const mission = this.requireMission(missionId);
    const file = mission.artifactFiles?.[stage];
    if (!file) throw new Error('Mission artifact not found.');
    return { stage, content: await this.ports.readArtifact(mission.id, stage), revision: file.revision, updatedAt: file.updatedAt };
  }

  async writeArtifact(agentId: string, input: MissionArtifactWriteInput): Promise<MissionArtifactReadResult> {
    const context = this.requireContext(agentId);
    if (!input || !featureStages.includes(input.stage) || typeof input.content !== 'string') throw new Error('Invalid mission artifact.');
    if (input.stage !== context.stage) throw new Error('This agent can write only its assigned stage artifact.');
    if (input.stage === 'implementation') throw new Error('Submit implementation evidence with the assigned ticket result.');
    const result = await this.ports.missions.changeAsync(context.missionId, async current => {
      const run = current.execution?.runs.find(run => run.id === context.runId);
      if (!run || run.workerId !== agentId || !['running', 'awaitingReview'].includes(run.status) || run.stage !== input.stage) {
        throw new Error('This agent is not working on the active mission stage.');
      }
      const currentRevision = current.artifactFiles?.[input.stage]?.revision ?? 0;
      if (input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) {
        throw new Error('This mission artifact changed. Read it again before writing.');
      }
      const stored = await this.ports.writeArtifact(current.id, input.stage, input.content);
      const updatedAt = new Date().toISOString();
      (current.artifactFiles ??= {})[input.stage] = { revision: currentRevision + 1, size: stored.size, updatedAt };
      return { stage: input.stage, content: input.content, revision: currentRevision + 1, updatedAt };
    });
    await this.ports.publish();
    return result;
  }

  async upsertTicket(agentId: string, input: MissionTicketDraftInput): Promise<MissionTicketDraftResult> {
    const context = this.requireContext(agentId);
    if (context.stage !== 'tickets' || !input || typeof input.title !== 'string' || typeof input.body !== 'string'
      || typeof input.repositoryPath !== 'string'
      || (input.ticketId !== undefined && typeof input.ticketId !== 'string')
      || (input.reference !== undefined && typeof input.reference !== 'string')
      || (input.blockedByTicketIds !== undefined && (!Array.isArray(input.blockedByTicketIds) || input.blockedByTicketIds.some(id => typeof id !== 'string')))) {
      throw new Error('Invalid Mission ticket draft.');
    }
    const title = input.title.trim();
    const body = input.body.trim();
    const repositoryPath = input.repositoryPath.trim();
    const reference = input.reference?.trim();
    const mission = this.requireMission(context.missionId);
    if (!title || title.length > 500 || /[\r\n]/.test(title) || !body || body.length > 100_000 || !repositoryPath || (reference !== undefined && (!reference || reference.length > 100_000))) {
      throw new Error('Mission ticket title, body, repository, or reference is invalid.');
    }
    if (!missionTeamRepositories(this.ports.snapshot, mission).includes(repositoryPath)) throw new Error('Choose a repository represented in this Mission team.');
    await this.ports.validateRepository(repositoryPath);
    const result = await this.ports.missions.changeAsync(context.missionId, async mission => {
      const run = mission.execution?.runs.find(candidate => candidate.id === context.runId);
      if (!run || run.workerId !== agentId || !['running', 'awaitingReview'].includes(run.status) || run.stage !== 'tickets' || mission.stage !== 'tickets') {
        throw new Error('This agent is not working on the active Tickets stage.');
      }
      const drafts = structuredClone(run.draftTickets ?? []);
      const index = input.ticketId === undefined ? drafts.length : drafts.findIndex(ticket => ticket.id === input.ticketId);
      if (input.ticketId !== undefined && index < 0) throw new Error('Mission ticket draft not found.');
      const ticketId = input.ticketId ?? createEntityId('mission-ticket');
      const blockerIds = [...new Set(input.blockedByTicketIds ?? [])];
      if (blockerIds.includes(ticketId)) throw new Error('A Mission ticket cannot block itself.');
      const dependsOn = blockerIds.map(blockerId => {
        const blockerIndex = drafts.findIndex(ticket => ticket.id === blockerId);
        if (blockerIndex < 0) throw new Error(`Blocking Mission ticket '${blockerId}' was not found.`);
        return blockerIndex;
      });
      const ticket: MissionTicket = {
        id: ticketId,
        title,
        body,
        repositoryPath,
        done: false,
        ...(reference ? { reference } : {}),
        ...(dependsOn.length ? { dependsOn } : {}),
      };
      if (index === drafts.length) drafts.push(ticket);
      else drafts[index] = ticket;
      if (!isMissionArtifacts({ ...mission.artifacts, tickets: drafts })) throw new Error('Mission ticket dependencies must be acyclic and reference existing tickets.');
      const content = missionTicketsMarkdown(drafts);
      const stored = await this.ports.writeArtifact(mission.id, 'tickets', content);
      const updatedAt = new Date().toISOString();
      const artifactRevision = (mission.artifactFiles?.tickets?.revision ?? 0) + 1;
      (mission.artifactFiles ??= {}).tickets = { revision: artifactRevision, size: stored.size, updatedAt };
      run.draftTickets = drafts;
      return { success: true as const, ticketId, index, artifactRevision };
    });
    await this.ports.publish();
    return result;
  }

  async setExecutionPolicy(agentId: string, reviewPolicy: MissionReviewPolicy): Promise<MissionExecutionPolicyResult> {
    const context = this.requireContext(agentId);
    if (!['reviewEachTicket', 'reviewAfterImplementation'].includes(reviewPolicy)) throw new Error('Invalid Mission execution policy.');
    await this.ports.missions.change(context.missionId, mission => {
      const run = mission.execution?.runs.find(candidate => candidate.id === context.runId);
      if (!run || run.workerId !== agentId || !['running', 'awaitingReview'].includes(run.status) || mission.stage !== 'tickets') {
        throw new Error('Execution policy can be changed only by the active Tickets orchestrator.');
      }
      mission.execution!.reviewPolicy = reviewPolicy;
    });
    await this.ports.publish();
    return { success: true, reviewPolicy };
  }

  async setTitle(agentId: string, title: string): Promise<{ success: true; title: string }> {
    const normalized = title.trim();
    if (!normalized || normalized.length > 200) throw new Error('Mission title must be between 1 and 200 characters.');
    const context = this.contextForAgent(agentId);
    if (!context) throw new Error('This agent is not working on an active mission run.');
    await this.ports.missions.change(context.missionId, mission => {
      const run = mission.execution?.runs.find(run => run.id === context.runId);
      if (!run || run.workerId !== agentId || !['running', 'awaitingReview'].includes(run.status) || run.stage !== mission.stage) {
        throw new Error('This agent is not working on an active mission run.');
      }
      mission.outcome = normalized;
    });
    await this.ports.publish();
    return { success: true, title: normalized };
  }

  async attachRepository(agentId: string, repoPath: string): Promise<{ success: true; repoPath: string }> {
    const context = this.requireContext(agentId);
    const normalized = repoPath.trim();
    const mission = this.requireMission(context.missionId);
    await this.executeMission({ id: mission.id, revision: mission.revision, action: 'attachRepository', repoPath: normalized });
    return { success: true, repoPath: normalized };
  }


  private requireContext(agentId: string): MissionToolContext {
    const context = this.contextForAgent(agentId);
    if (!context) throw new Error('This agent is not working on an active mission run.');
    return context;
  }

  private requireMission(id: string): Mission {
    const mission = this.ports.snapshot.missions?.find(mission => mission.id === id);
    if (!mission) throw new Error('Mission not found.');
    return mission;
  }
}

function missionTicketsMarkdown(tickets: MissionTicket[]): string {
  return tickets.map((ticket, index) => [
    `# ${String(index + 1).padStart(2, '0')}: ${ticket.title}`,
    ticket.body,
    `**Repository:** ${ticket.repositoryPath ?? 'Not assigned'}`,
    `**Blocked by:** ${ticket.dependsOn?.length ? ticket.dependsOn.map(blocker => `${String(blocker + 1).padStart(2, '0')}: ${tickets[blocker]?.title ?? 'Unknown ticket'}`).join(', ') : 'None (can start immediately)'}`,
    '**Status:** ready-for-agent',
    ticket.reference ? `**External reference:** ${ticket.reference}` : '',
  ].filter(Boolean).join('\n\n')).join('\n\n---\n\n');
}

