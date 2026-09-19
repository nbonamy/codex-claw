import type { Agent, AppSnapshot, BackendSkillSummary, CreateSourceWorktreeInput, SourceWorktree } from '@codex-claw/core/contracts';
import { createAgentInSnapshot } from '@codex-claw/core/agent-manager';
import { createEntityId } from '@codex-claw/core/ids';
import { featureStages, isMissionArtifacts, missionTicketReady, missionStageReady, type Mission, type MissionArtifacts, type MissionStage, type MissionTicket } from '@codex-claw/core/missions';
import { missionDeveloperInstructions, missionSkills, pendingMissionRun, type MissionArtifactReadResult, type MissionArtifactWriteInput, type MissionExecutionInput, type MissionExecutionPolicyResult, type MissionResultInput, type MissionReviewPolicy, type MissionRun, type MissionTicketDraftInput, type MissionTicketDraftResult, type MissionToolContext } from '@codex-claw/core/mission-execution';
import type { MissionService } from './mission-service';

export type MissionExecutionPorts = {
  snapshot: AppSnapshot;
  missions: MissionService;
  publish(): Promise<unknown>;
  ensureMissionHome(missionId: string): Promise<string>;
  readArtifact(missionId: string, stage: MissionStage): Promise<string>;
  writeArtifact(missionId: string, stage: MissionStage, content: string): Promise<{ size: number }>;
  validateRepository(path: string): Promise<void>;
  createWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree>;
  getHead(path: string): Promise<string>;
  refreshWorkspace(agentId: string): Promise<void>;
  refreshConversationContext(agent: Agent): Promise<void>;
  continueStage(agentId: string, prompt: string): Promise<void>;
  listSkills(agent: Agent): Promise<BackendSkillSummary[]>;
  interrupt(agent: Agent): Promise<unknown>;
};

/** Mission policy owns durable runs; provider hosts still own conversations and turns. */
export class MissionExecutionService {
  private readonly launches = new Map<string, Promise<void>>();
  constructor(private readonly ports: MissionExecutionPorts) {}

  async execute(input: MissionExecutionInput): Promise<void> {
    if (!input || typeof input.id !== 'string' || !Number.isInteger(input.revision)) throw new Error('Invalid mission command.');
    const mission = this.requireMission(input.id);
    if (mission.revision !== input.revision) throw new Error('This mission changed. Reload before continuing.');
    if (input.action === 'configure') {
      const team = this.ports.snapshot.teams.find(team => team.id === input.teamId && !team.remoteConnectionId);
      if (!team || !Array.isArray(input.memberIds) || !input.memberIds.length || input.memberIds.length > 20
        || input.memberIds.some(id => !this.ports.snapshot.agents.some(agent => agent.id === id && agent.teamId === team.id))) throw new Error('Choose a local team and at least one of its agents.');
      await this.change(input, current => {
        if (current.execution?.workspace || current.execution?.runs.length) throw new Error('Mission workspace configuration is locked after the first run.');
        current.execution = { teamId: team.id, memberIds: [...new Set(input.memberIds)], reviewPolicy: 'reviewEachTicket', workspaces: [], runs: [] };
      });
      return;
    }
    if (input.action === 'attachRepository') {
      if (typeof input.repoPath !== 'string' || !input.repoPath.trim()) throw new Error('Choose a repository.');
      const repoPath = input.repoPath.trim();
      if (!this.teamRepositories(mission).includes(repoPath)) throw new Error('Choose a repository represented in this mission team.');
      await this.ports.validateRepository(repoPath);
      await this.change(input, current => {
        if (current.execution?.workspace) throw new Error('The mission repository is locked after its worktree is created.');
        current.execution!.repoPath = repoPath;
      });
      return;
    }
    if (input.action === 'cancel') {
      const run = mission.execution?.runs.find(run => run.id === input.runId);
      if (!run || !['preparing', 'running', 'awaitingReview'].includes(run.status)) throw new Error('No cancellable mission run.');
      const worker = this.agent(run.workerId);
      if (worker && worker.status.type !== 'idle' && worker.status.type !== 'error') await this.ports.interrupt(worker);
      await this.change(input, current => {
        const run = current.execution!.runs.find(run => run.id === input.runId)!;
        run.status = 'cancelled'; run.finishedAt = new Date().toISOString();
      });
      return;
    }
    if (input.action === 'accept') {
      let nextRunIds: string[] = [];
      await this.changeAsync(input, async current => {
        const run = current.execution?.runs.find(run => run.id === input.runId);
        if (!run || run.status !== 'awaitingReview' || !run.proposal || run.stage !== current.stage) throw new Error('No current proposal to accept.');
        if (run.stage === 'implementation') {
          this.acceptImplementationResult(current, run);
          await this.persistImplementationArtifact(current);
        } else {
          if (run.stage === 'tickets' && !missionStageReady('tickets', run.proposal)) {
            throw new Error('Assign one represented repository to every ticket before starting implementation.');
          }
          current.artifacts = structuredClone(run.proposal);
          run.status = 'accepted';
        }
        if (missionStageReady(current.stage, current.artifacts)) {
          if (current.stage === 'review') {
            current.status = 'completed';
            return;
          }
          current.stage = featureStages[featureStages.indexOf(current.stage) + 1]!;
          if (current.stage === 'implementation') await this.provisionImplementationWorkspaces(current);
        }
        nextRunIds = this.enqueueRuns(current, {});
      });
      for (const runId of nextRunIds) void this.startLaunch(input.id, runId);
      return;
    }
    if (input.action === 'reopen') {
      await this.change(input, current => {
        this.requireNoActiveRun(current);
        if (!featureStages.includes(input.stage) || featureStages.indexOf(input.stage) > featureStages.indexOf(current.stage)) throw new Error('Only reached stages can be reopened.');
        current.stage = input.stage;
        current.status = 'active';
        // Changes to upstream decisions invalidate downstream completion claims.
        if (input.stage === 'requirements' || input.stage === 'tickets') {
          current.artifacts.tickets = current.artifacts.tickets.map(ticket => ({ ...ticket, done: false }));
          current.artifacts.implementation = { changes: '', tests: '' };
        }
        if (input.stage !== 'review') current.artifacts.review = { summary: '', pullRequestUrl: '' };
      }, true);
      return;
    }
    if (input.action !== 'run') throw new Error('Unknown mission command.');
    let runIds: string[] = [];
    await this.change(input, current => {
      if (current.stage !== 'implementation') this.requireNoActiveRun(current);
      runIds = this.enqueueRuns(current, input);
      if (!runIds.length) throw new Error('No implementation ticket is ready to start.');
    });
    for (const runId of runIds) void this.startLaunch(input.id, runId);
  }

  async recoverInterruptedRuns(): Promise<void> {
    const interrupted = (this.ports.snapshot.missions ?? []).flatMap(mission => (
      mission.execution?.runs
        .filter(run => run.status === 'preparing' || (run.status === 'running' && !this.agent(run.workerId)?.backendSession))
        .map(run => ({ missionId: mission.id, runId: run.id })) ?? []
    ));
    await Promise.all(interrupted.map(({ missionId, runId }) => this.startLaunch(missionId, runId)));
  }

  private startLaunch(missionId: string, runId: string): Promise<void> {
    const existing = this.launches.get(runId);
    if (existing) return existing;
    const launch = this.launch(missionId, runId).catch(async error => {
      await this.ports.missions.change(missionId, current => {
        const run = current.execution!.runs.find(run => run.id === runId)!;
        if (!['preparing', 'running'].includes(run.status)) return;
        run.status = 'failed'; run.error = error instanceof Error ? error.message : String(error); run.finishedAt = new Date().toISOString();
      });
      await this.ports.publish();
    }).finally(() => this.launches.delete(runId));
    this.launches.set(runId, launch);
    // Launch runs independently of request deadlines; snapshot shows its actual phase.
    void launch.catch(() => undefined);
    return launch;
  }

  async submit(agentId: string, input: MissionResultInput): Promise<{ success: true; status: 'awaitingReview' | 'accepted' }> {
    if (!input || typeof input.missionId !== 'string' || !isMissionArtifacts(input.artifacts) || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 20_000) throw new Error('Invalid mission result.');
    let status: 'awaitingReview' | 'accepted' = 'awaitingReview';
    let nextRunIds: string[] = [];
    await this.ports.missions.changeAsync(input.missionId, async mission => {
      const run = mission.execution?.runs.find(run => run.id === input.runId);
      if (!run || run.workerId !== agentId || !['running', 'awaitingReview'].includes(run.status) || run.stage !== mission.stage) throw new Error('This agent does not own an active run for this mission stage.');
      if (run.stage !== 'implementation' && !mission.artifactFiles?.[run.stage]) throw new Error('Write the stage artifact before submitting it for review.');
      const proposal = structuredClone(mission.artifacts);
      if (run.stage === 'implementation') {
        const index = run.ticketIndex!;
        if (input.artifacts.tickets[index]?.title !== proposal.tickets[index]?.title || !input.artifacts.tickets[index]?.done) throw new Error('The assigned ticket must be completed without changing its identity.');
        proposal.tickets[index]!.done = true;
        proposal.implementation = {
          changes: [proposal.implementation.changes, input.artifacts.implementation.changes].filter(Boolean).join('\n\n'),
          tests: [proposal.implementation.tests, input.artifacts.implementation.tests].filter(Boolean).join('\n\n'),
        };
        if (!input.artifacts.implementation.changes.trim() || !input.artifacts.implementation.tests.trim()) throw new Error('Report code changes and actual test evidence.');
        run.implementationResult = structuredClone(input.artifacts.implementation);
      } else {
        if (run.stage === 'requirements') proposal.requirements = structuredClone(input.artifacts.requirements);
        if (run.stage === 'tickets') {
          if (!run.draftTickets?.length) throw new Error('Create Mission ticket drafts before submitting the Tickets stage.');
          proposal.tickets = run.draftTickets.map(ticket => ({ ...structuredClone(ticket), done: false }));
        }
        if (run.stage === 'review') proposal.review = structuredClone(input.artifacts.review);
        if (!missionStageReady(run.stage, proposal)) throw new Error('The stage result is incomplete.');
      }
      if (!isMissionArtifacts(proposal)) throw new Error('Mission evidence is too large. Submit a concise report with references.');
      run.proposal = proposal; run.summary = input.summary.trim(); run.status = 'awaitingReview'; run.finishedAt = new Date().toISOString();
      if (run.stage === 'implementation' && mission.execution?.reviewPolicy === 'reviewAfterImplementation') {
        this.acceptImplementationResult(mission, run);
        await this.persistImplementationArtifact(mission);
        status = 'accepted';
        if (missionStageReady('implementation', mission.artifacts)) mission.stage = 'review';
        nextRunIds = this.enqueueRuns(mission, {});
      }
    });
    await this.ports.publish();
    for (const runId of nextRunIds) void this.startLaunch(input.missionId, runId);
    return { success: true, status };
  }

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
    return missionDeveloperInstructions(mission, run, this.teamRepositories(mission));
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
    if (!this.teamRepositories(mission).includes(repositoryPath)) throw new Error('Choose a repository represented in this Mission team.');
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
    await this.execute({ id: mission.id, revision: mission.revision, action: 'attachRepository', repoPath: normalized });
    return { success: true, repoPath: normalized };
  }

  private requireContext(agentId: string): MissionToolContext {
    const context = this.contextForAgent(agentId);
    if (!context) throw new Error('This agent is not working on an active mission run.');
    return context;
  }

  async agentFinished(agentId: string): Promise<void> {
    const mission = this.ports.snapshot.missions?.find(mission => mission.execution?.runs.some(run => run.workerId === agentId && run.status === 'running' && ['implementation', 'review'].includes(run.stage)));
    if (!mission) return;
    await this.ports.missions.change(mission.id, current => {
      const run = current.execution!.runs.find(run => run.workerId === agentId && run.status === 'running');
      if (!run) return;
      run.status = 'failed'; run.error = 'Agent finished without submitting a mission result. Inspect the conversation and rerun with feedback.'; run.finishedAt = new Date().toISOString();
    });
    await this.ports.publish();
  }

  async waitForLaunches(): Promise<void> { await Promise.all(this.launches.values()); }

  private async launch(id: string, runId: string): Promise<void> {
    const mission = this.requireMission(id);
    const run = mission.execution!.runs.find(run => run.id === runId)!;
    if (run.status === 'cancelled') return;
    const member = this.agent(run.memberId);
    if (!member) throw new Error('Assigned team member was removed.');
    const missionHome = await this.ports.ensureMissionHome(mission.id);
    const repositoryPath = run.repositoryPath ?? mission.artifacts.tickets[run.ticketIndex ?? -1]?.repositoryPath;
    const workspace = repositoryPath
      ? mission.execution!.workspaces?.find(candidate => candidate.repositoryPath === repositoryPath)
      : mission.execution!.workspaces?.[0] ?? mission.execution!.workspace;
    const workingFolder = workspace?.path ?? missionHome;
    let worker = this.agent(run.workerId);
    const reusedWorker = !!worker;
    if (!worker) {
      const workerId = createEntityId('agent');
      createAgentInSnapshot(this.ports.snapshot, {
        name: `${member.name || 'Agent'} · ${mission.outcome} · ${run.stage}`,
        teamId: mission.execution!.teamId, folder: workingFolder,
        backend: member.backend, backendDefaults: structuredClone(member.backendDefaults), avatar: member.avatar,
      }, undefined, workerId, { select: false });
      worker = this.agent(workerId)!;
      await this.ports.missions.change(id, current => {
        current.execution!.runs.find(run => run.id === runId)!.workerId = worker!.id;
      });
    }
    await this.ports.refreshWorkspace(worker.id);
    await this.ports.missions.change(id, current => {
      const currentRun = current.execution!.runs.find(run => run.id === runId)!;
      currentRun.workerId = worker.id;
      if (currentRun.status !== 'cancelled') currentRun.status = 'running';
      current.stageAgentIds[currentRun.stage] = worker.id;
    });
    await this.ports.publish();
    const skills = missionSkills(run.stage, await this.ports.listSkills(worker).catch(() => []));
    await this.ports.missions.change(id, current => {
      const currentRun = current.execution!.runs.find(candidate => candidate.id === runId)!;
      if (currentRun.status !== 'cancelled') currentRun.skills = skills;
    });
    await this.ports.publish();
    if (reusedWorker && worker.backendSession) await this.ports.refreshConversationContext(worker);
    if (run.stage !== 'requirements') await this.ports.continueStage(worker.id, stageKickoffPrompt(run));
  }

  private requireMission(id: string): Mission {
    const mission = this.ports.snapshot.missions?.find(mission => mission.id === id);
    if (!mission) throw new Error('Mission not found.');
    return mission;
  }
  private enqueueRuns(mission: Mission, input: { memberId?: string; ticketIndex?: number; feedback?: string }): string[] {
    if (mission.stage !== 'implementation') return [this.enqueueRun(mission, input)];
    const execution = mission.execution;
    if (!execution) throw new Error('Configure the Mission team first.');
    const activeStatuses: MissionRun['status'][] = ['preparing', 'running', 'awaitingReview'];
    const busyRepositories = new Set(execution.runs
      .filter(run => run.stage === 'implementation' && activeStatuses.includes(run.status) && run.repositoryPath)
      .map(run => run.repositoryPath!));
    const activeTickets = new Set(execution.runs
      .filter(run => run.stage === 'implementation' && activeStatuses.includes(run.status) && run.ticketIndex !== undefined)
      .map(run => run.ticketIndex!));
    const candidates = input.ticketIndex === undefined
      ? mission.artifacts.tickets.map((_, index) => index)
      : [input.ticketIndex];
    const runIds: string[] = [];
    for (const ticketIndex of candidates) {
      const ticket = mission.artifacts.tickets[ticketIndex];
      const repositoryPath = ticket?.repositoryPath;
      if (!ticket || !repositoryPath || !missionTicketReady(mission.artifacts.tickets, ticketIndex)
        || activeTickets.has(ticketIndex) || busyRepositories.has(repositoryPath)) continue;
      const runId = this.enqueueImplementationRun(mission, ticketIndex, repositoryPath, input);
      runIds.push(runId);
      busyRepositories.add(repositoryPath);
    }
    return runIds;
  }

  private enqueueRun(mission: Mission, input: { memberId?: string; ticketIndex?: number; feedback?: string }): string {
    const execution = mission.execution;
    if (!execution) throw new Error('Configure the Mission team first.');
    const previousOrchestratorRun = mission.stage === 'tickets'
      ? execution.runs.slice().reverse().find(run => (run.stage === 'requirements' || run.stage === 'tickets') && run.workerId)
      : undefined;
    const memberId = input.memberId ?? previousOrchestratorRun?.memberId ?? execution.memberIds[0]!;
    const member = this.agent(memberId);
    if (!execution.memberIds.includes(memberId) || !member || member.teamId !== execution.teamId) throw new Error('The selected team member is unavailable.');
    if (input.feedback !== undefined && (typeof input.feedback !== 'string' || input.feedback.length > 20_000)) throw new Error('Invalid revision feedback.');
    const runId = createEntityId('mission-run');
    execution.runs.push({ id: runId, stage: mission.stage, memberId, ...(previousOrchestratorRun?.workerId ? { workerId: previousOrchestratorRun.workerId } : {}), status: 'preparing', skills: [], feedback: input.feedback?.trim() ?? '', startedAt: new Date().toISOString() });
    return runId;
  }

  private enqueueImplementationRun(
    mission: Mission,
    ticketIndex: number,
    repositoryPath: string,
    input: { memberId?: string; feedback?: string },
  ): string {
    const execution = mission.execution!;
    const memberId = input.memberId ?? execution.memberIds[ticketIndex % execution.memberIds.length]!;
    const member = this.agent(memberId);
    if (!execution.memberIds.includes(memberId) || !member || member.teamId !== execution.teamId) throw new Error('The selected team member is unavailable.');
    if (input.feedback !== undefined && (typeof input.feedback !== 'string' || input.feedback.length > 20_000)) throw new Error('Invalid revision feedback.');
    const runId = createEntityId('mission-run');
    execution.runs.push({
      id: runId,
      stage: 'implementation',
      memberId,
      ticketIndex,
      repositoryPath,
      status: 'preparing',
      skills: [],
      feedback: input.feedback?.trim() ?? '',
      startedAt: new Date().toISOString(),
    });
    return runId;
  }

  private async provisionImplementationWorkspaces(mission: Mission): Promise<void> {
    const execution = mission.execution!;
    execution.reviewPolicy ??= 'reviewEachTicket';
    execution.workspaceName ??= missionWorkspaceName(mission);
    execution.workspaces ??= [];
    const branch = `mission/${execution.workspaceName}`;
    const repositoryPaths = [...new Set(mission.artifacts.tickets.map(ticket => ticket.repositoryPath))];
    const representedRepositories = this.teamRepositories(mission);
    for (const repositoryPath of repositoryPaths) {
      if (!repositoryPath || !representedRepositories.includes(repositoryPath)) {
        throw new Error('Every ticket must target a repository represented in this Mission team.');
      }
      if (execution.workspaces.some(workspace => workspace.repositoryPath === repositoryPath)) continue;
      await this.ports.validateRepository(repositoryPath);
      const worktree = await this.ports.createWorktree({ repoPath: repositoryPath, branchName: branch, reuseExisting: true });
      const baseSha = await this.ports.getHead(worktree.path);
      execution.workspaces.push({ repositoryPath, path: worktree.path, branch, baseSha });
    }
  }

  private acceptImplementationResult(mission: Mission, run: MissionRun): void {
    const index = run.ticketIndex;
    const result = run.implementationResult;
    if (index === undefined || !mission.artifacts.tickets[index] || !result) throw new Error('Implementation evidence is incomplete.');
    mission.artifacts.tickets[index]!.done = true;
    mission.artifacts.implementation = {
      changes: [mission.artifacts.implementation.changes, result.changes].filter(Boolean).join('\n\n'),
      tests: [mission.artifacts.implementation.tests, result.tests].filter(Boolean).join('\n\n'),
    };
    run.status = 'accepted';
  }

  private async persistImplementationArtifact(mission: Mission): Promise<void> {
    const content = [
      '# Implementation evidence',
      '',
      '## Changes',
      '',
      mission.artifacts.implementation.changes,
      '',
      '## Verification',
      '',
      mission.artifacts.implementation.tests,
    ].join('\n');
    const stored = await this.ports.writeArtifact(mission.id, 'implementation', content);
    const currentRevision = mission.artifactFiles?.implementation?.revision ?? 0;
    (mission.artifactFiles ??= {}).implementation = {
      revision: currentRevision + 1,
      size: stored.size,
      updatedAt: new Date().toISOString(),
    };
  }

  private agent(id: string | undefined): Agent | undefined { return this.ports.snapshot.agents.find(agent => agent.id === id); }
  private teamRepositories(mission: Mission): string[] {
    return [...new Set((mission.execution?.memberIds ?? []).flatMap(id => {
      const agent = this.agent(id);
      if (!agent) return [];
      if (agent.workspace?.kind === 'git') return [agent.workspace.primaryWorktreeRoot];
      return agent.folder ? [agent.folder] : [];
    }))];
  }
  private requireNoActiveRun(mission: Mission): void {
    if (pendingMissionRun(mission)) throw new Error('Review or stop the existing run first.');
    if (mission.execution?.runs.some(run => { const worker = this.agent(run.workerId); return worker && ['working', 'awaitingInput'].includes(worker.status.type); })) throw new Error('A mission worker is still active. Stop it before starting another run.');
  }
  private async change(input: { id: string; revision: number }, mutate: (mission: Mission) => void, allowCompleted = false): Promise<void> {
    await this.ports.missions.change(input.id, mission => {
      if (mission.revision !== input.revision) throw new Error('This mission changed. Reload before continuing.');
      if (!allowCompleted && mission.status === 'completed') throw new Error('Reopen the completed mission before starting work.');
      mutate(mission);
    });
    await this.ports.publish();
  }

  private async changeAsync(input: { id: string; revision: number }, mutate: (mission: Mission) => Promise<void>, allowCompleted = false): Promise<void> {
    await this.ports.missions.changeAsync(input.id, async mission => {
      if (mission.revision !== input.revision) throw new Error('This mission changed. Reload before continuing.');
      if (!allowCompleted && mission.status === 'completed') throw new Error('Reopen the completed mission before starting work.');
      await mutate(mission);
    });
    await this.ports.publish();
  }
}

function missionWorkspaceName(mission: Mission): string {
  const outcome = mission.outcome
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'mission';
  const suffix = mission.id.replace(/^mission-/, '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase();
  return `${outcome}-${suffix || 'work'}`;
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

function stageKickoffPrompt(run: MissionRun): string {
  if (run.stage === 'tickets') return 'The requirements are approved. Continue this Mission in the Tickets stage now: read and use the to-tickets skill, then work with the user to shape and publish the backlog.';
  if (run.stage === 'implementation') return `The tickets are approved. Begin implementation of assigned ticket ${(run.ticketIndex ?? 0) + 1} now and report progress in this Mission conversation.`;
  return 'The implementation is approved. Begin the Mission review now and prepare the delivery decision for the user.';
}
