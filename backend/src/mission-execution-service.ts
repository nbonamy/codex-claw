import type { Agent, AppSnapshot, BackendSkillSummary, CreateSourceWorktreeInput, SourceWorktree } from '@codex-claw/core/contracts';
import { createAgentInSnapshot } from '@codex-claw/core/agent-manager';
import { createEntityId } from '@codex-claw/core/ids';
import { featureStages, isMissionArtifacts, missionTicketReady, missionStageReady, type Mission, type MissionArtifacts } from '@codex-claw/core/missions';
import { missionRunPrompt, missionSkills, pendingMissionRun, type MissionExecutionInput, type MissionResultInput, type MissionRun } from '@codex-claw/core/mission-execution';
import type { MissionService } from './mission-service';

export type MissionExecutionPorts = {
  snapshot: AppSnapshot;
  missions: MissionService;
  publish(): Promise<unknown>;
  validateRepository(path: string): Promise<void>;
  createWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree>;
  getHead(path: string): Promise<string>;
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
      if (typeof input.repoPath !== 'string' || !input.repoPath.trim()) throw new Error('Choose a repository.');
      await this.ports.validateRepository(input.repoPath);
      await this.change(input, current => {
        if (current.execution?.workspace || current.execution?.runs.length) throw new Error('Mission workspace configuration is locked after the first run.');
        current.execution = { teamId: team.id, repoPath: input.repoPath.trim(), memberIds: [...new Set(input.memberIds)], runs: [] };
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
    const launch = this.launch(input.id, runId).catch(async error => {
      await this.ports.missions.change(input.id, current => {
        const run = current.execution!.runs.find(run => run.id === runId)!;
        if (!['preparing', 'running'].includes(run.status)) return;
        run.status = 'failed'; run.error = error instanceof Error ? error.message : String(error); run.finishedAt = new Date().toISOString();
      });
      await this.ports.publish();
    }).finally(() => this.launches.delete(runId));
    this.launches.set(runId, launch);
    // Launch runs independently of request deadlines; snapshot shows its actual phase.
    void launch.catch(() => undefined);
  }

  async submit(agentId: string, input: MissionResultInput): Promise<{ success: true; status: 'awaitingReview' }> {
    if (!input || typeof input.missionId !== 'string' || !isMissionArtifacts(input.artifacts) || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 20_000) throw new Error('Invalid mission result.');
    await this.ports.missions.change(input.missionId, mission => {
      const run = mission.execution?.runs.find(run => run.id === input.runId);
      if (!run || run.workerId !== agentId || run.status !== 'running' || run.stage !== mission.stage) throw new Error('This agent does not own an active run for this mission stage.');
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
    if (!execution.workspace) {
      const branch = `mission/${mission.id.replace(/^mission-/, '')}`;
      const worktree = await this.ports.createWorktree({ repoPath: execution.repoPath, branchName: branch, reuseExisting: true });
      const baseSha = await this.ports.getHead(worktree.path);
      await this.ports.missions.change(id, current => { current.execution!.workspace = { path: worktree.path, branch, baseSha }; });
      await this.ports.publish();
    }
    mission = this.requireMission(id);
    const run = mission.execution!.runs.find(run => run.id === runId)!;
    if (run.status === 'cancelled') return;
    const member = this.agent(run.memberId);
    if (!member) throw new Error('Assigned team member was removed.');
    const workerId = createEntityId('agent');
    createAgentInSnapshot(this.ports.snapshot, {
      name: `${member.name || 'Agent'} · ${mission.outcome} · ${run.stage}`,
      teamId: mission.execution!.teamId, folder: mission.execution!.workspace!.path,
      backend: member.backend, backendDefaults: structuredClone(member.backendDefaults), avatar: member.avatar,
    }, undefined, workerId, { select: false });
    const worker = this.agent(workerId)!;
    await this.ports.missions.change(id, current => {
      current.execution!.runs.find(run => run.id === runId)!.workerId = worker.id;
    });
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
    await this.ports.send(worker, missionRunPrompt(mission, active));
  }

  private requireMission(id: string): Mission {
    const mission = this.ports.snapshot.missions?.find(mission => mission.id === id);
    if (!mission) throw new Error('Mission not found.');
    return mission;
  }
  private agent(id: string | undefined): Agent | undefined { return this.ports.snapshot.agents.find(agent => agent.id === id); }
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
