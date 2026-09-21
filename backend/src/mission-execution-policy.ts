import type { Agent, AppSnapshot } from '@codex-claw/core/contracts';
import type { Mission } from '@codex-claw/core/missions';
import type { MissionRun } from '@codex-claw/core/mission-execution';

export function missionAgent(snapshot: AppSnapshot, id: string | undefined): Agent | undefined {
  return snapshot.agents.find(agent => agent.id === id);
}

export function missionTeamRepositories(snapshot: AppSnapshot, mission: Mission): string[] {
  return [...new Set((mission.execution?.memberIds ?? []).flatMap(id => {
    const agent = missionAgent(snapshot, id);
    if (!agent) return [];
    if (agent.workspace?.kind === 'git') return [agent.workspace.primaryWorktreeRoot];
    return agent.folder ? [agent.folder] : [];
  }))];
}

export function missionWorkspaceName(mission: Mission): string {
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

export function stageKickoffPrompt(run: MissionRun): string {
  if (run.stage === 'tickets') return 'The requirements are approved. Continue this Mission in the Tickets stage now: follow the assigned Claw Mission skill, then work with the user to shape and publish the backlog.';
  if (run.stage === 'implementation') return `The tickets are approved. Begin implementation of assigned ticket ${(run.ticketIndex ?? 0) + 1} now and report progress in this Mission conversation.`;
  return 'The implementation is approved. Begin the Mission review now and prepare the delivery decision for the user.';
}

export function shouldCompactBeforeRun(mission: Mission, run: MissionRun, workerId: string): boolean {
  return run.stage === 'implementation' && mission.execution!.runs.some(previous => (
    previous.id !== run.id
    && previous.stage === 'implementation'
    && previous.workerId === workerId
    && previous.repositoryPath === run.repositoryPath
    && previous.ticketIndex !== run.ticketIndex
    && previous.status === 'accepted'
  ));
}

export function sameSkills(left: MissionRun['skills'], right: MissionRun['skills']): boolean {
  return left.length === right.length && left.every((skill, index) => skill.name === right[index]?.name && skill.path === right[index]?.path);
}
