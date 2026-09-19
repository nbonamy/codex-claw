import type { Agent, AppSnapshot, BackendSkillSummary, CreateSourceWorktreeInput, SourceWorktree } from '@codex-claw/core/contracts';
import { createAgentInSnapshot } from '@codex-claw/core/agent-manager';
import { createEntityId } from '@codex-claw/core/ids';
import { featureStages, isMissionArtifacts, missionTicketReady, missionStageReady, type Mission, type MissionArtifacts, type MissionStage } from '@codex-claw/core/missions';
import { missionRunPrompt, missionSkills, pendingMissionRun, type MissionArtifactReadResult, type MissionArtifactWriteInput, type MissionExecutionInput, type MissionResultInput, type MissionRun, type MissionToolContext } from '@codex-claw/core/mission-execution';
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
  listSkills(agent: Agent): Promise<BackendSkillSummary[]>;
  send(agent: Agent, prompt: string): Promise<void>;
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
        current.execution = { teamId: team.id, memberIds: [...new Set(input.memberIds)], runs: [] };
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
      await this.change(input, current => {
        const run = current.execution?.runs.find(run => run.id === input.runId);
        if (!run || run.status !== 'awaitingReview' || !run.proposal || run.stage !== current.stage) throw new Error('No current proposal to accept.');
        current.artifacts = structuredClone(run.proposal);
        run.status = 'accepted';
      });
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
    let runId = '';
    await this.change(input, current => {
      this.requireNoActiveRun(current);
      const execution = current.execution;
      if (!execution) throw new Error('Configure the mission repository and team first.');
      if ((current.stage === 'implementation' || current.stage === 'review') && !execution.repoPath) {
        throw new Error('Attach a team repository before starting code work.');
      }
      const ticketIndex = current.stage === 'implementation'
        ? input.ticketIndex ?? current.artifacts.tickets.findIndex((_, index) => missionTicketReady(current.artifacts.tickets, index)) : undefined;
      if (current.stage === 'implementation' && (ticketIndex === undefined || !Number.isInteger(ticketIndex) || ticketIndex < 0 || !missionTicketReady(current.artifacts.tickets, ticketIndex))) throw new Error('Choose an implementation ticket.');
      const memberId = input.memberId ?? execution.memberIds[(ticketIndex ?? 0) % execution.memberIds.length]!;
      const member = this.agent(memberId);
      if (!execution.memberIds.includes(memberId) || !member || member.teamId !== execution.teamId) throw new Error('The selected team member is unavailable.');
      if (input.feedback !== undefined && (typeof input.feedback !== 'string' || input.feedback.length > 20_000)) throw new Error('Invalid revision feedback.');
      runId = createEntityId('mission-run');
      execution.runs.push({ id: runId, stage: current.stage, memberId, ...(ticketIndex === undefined ? {} : { ticketIndex }), status: 'preparing', skills: [], feedback: input.feedback?.trim() ?? '', startedAt: new Date().toISOString() });
    });
    void this.startLaunch(input.id, runId);
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

  async submit(agentId: string, input: MissionResultInput): Promise<{ success: true; status: 'awaitingReview' }> {
    if (!input || typeof input.missionId !== 'string' || !isMissionArtifacts(input.artifacts) || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 20_000) throw new Error('Invalid mission result.');
    await this.ports.missions.change(input.missionId, mission => {
      const run = mission.execution?.runs.find(run => run.id === input.runId);
      if (!run || run.workerId !== agentId || !['running', 'awaitingReview'].includes(run.status) || run.stage !== mission.stage) throw new Error('This agent does not own an active run for this mission stage.');
      if (!mission.artifactFiles?.[run.stage]) throw new Error('Write the stage artifact before submitting it for review.');
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
      } else {
        if (run.stage === 'requirements') proposal.requirements = structuredClone(input.artifacts.requirements);
        if (run.stage === 'tickets') proposal.tickets = input.artifacts.tickets.map(ticket => ({ ...structuredClone(ticket), done: false }));
        if (run.stage === 'review') proposal.review = structuredClone(input.artifacts.review);
        if (!missionStageReady(run.stage, proposal)) throw new Error('The stage result is incomplete.');
      }
      if (!isMissionArtifacts(proposal)) throw new Error('Mission evidence is too large. Submit a concise report with references.');
      run.proposal = proposal; run.summary = input.summary.trim(); run.status = 'awaitingReview'; run.finishedAt = new Date().toISOString();
    });
    await this.ports.publish();
    return { success: true, status: 'awaitingReview' };
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
    let mission = this.requireMission(id);
    const execution = mission.execution!;
    const runBeforeWorkspace = execution.runs.find(run => run.id === runId)!;
    if (!execution.workspace && (runBeforeWorkspace.stage === 'implementation' || runBeforeWorkspace.stage === 'review')) {
      const branch = `mission/${mission.id.replace(/^mission-/, '')}`;
      const worktree = await this.ports.createWorktree({ repoPath: execution.repoPath!, branchName: branch, reuseExisting: true });
      const baseSha = await this.ports.getHead(worktree.path);
      await this.ports.missions.change(id, current => { current.execution!.workspace = { path: worktree.path, branch, baseSha }; });
      await this.ports.publish();
    }
    mission = this.requireMission(id);
    const run = mission.execution!.runs.find(run => run.id === runId)!;
    if (run.status === 'cancelled') return;
    const member = this.agent(run.memberId);
    if (!member) throw new Error('Assigned team member was removed.');
    const missionHome = await this.ports.ensureMissionHome(mission.id);
    const workingFolder = mission.execution!.workspace?.path ?? missionHome;
    let worker = this.agent(run.workerId);
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
    const skills = missionSkills(run.stage, await this.ports.listSkills(worker));
    await this.ports.missions.change(id, current => {
      const currentRun = current.execution!.runs.find(run => run.id === runId)!;
      currentRun.workerId = worker.id; currentRun.skills = skills;
      if (currentRun.status !== 'cancelled') currentRun.status = 'running';
      current.stageAgentIds[currentRun.stage] = worker.id;
    });
    await this.ports.publish();
    mission = this.requireMission(id);
    const active = mission.execution!.runs.find(run => run.id === runId)!;
    if (active.status === 'cancelled') return;
    if (!worker.backendSession) await this.ports.send(worker, missionRunPrompt(mission, active, this.teamRepositories(mission)));
  }

  private requireMission(id: string): Mission {
    const mission = this.ports.snapshot.missions?.find(mission => mission.id === id);
    if (!mission) throw new Error('Mission not found.');
    return mission;
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
}
