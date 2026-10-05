import { product } from './product';
import type { Mission, MissionRun, MissionStage } from './mission-types';

export type {
  MissionArtifactReadResult,
  MissionArtifactWriteInput,
  MissionDelivery,
  MissionExecution,
  MissionExecutionInput,
  MissionResultInput,
  MissionRun,
  MissionReviewFindingInput,
  MissionReviewFindingUpdateInput,
  MissionTicketDraftInput,
  MissionTicketDraftResult,
  MissionToolContext,
  MissionWorkspace,
} from './mission-types';

export type MissionImplementationStartProgress = {
  missionId: string;
  phase: 'creatingWorktrees' | 'initializingWorkspaces' | 'startingAgents';
  repositoryCount: number;
  ticketCount: number;
};

export function pendingMissionRun(mission: Mission): MissionRun | undefined {
  return mission.execution?.runs.slice().reverse().find(run => ['preparing', 'running', 'awaitingReview'].includes(run.status));
}

export function missionDeveloperInstructions(mission: Mission, run: MissionRun, repositories: string[] = []): string {
  const instructions: Record<MissionStage, string> = {
    requirements: "Treat the user's first message as the beginning of requirements shaping. Follow the assigned Mission skill to interview the user, use the provider's structured question tool for bounded choices, title the Mission, and prepare the requirements proposal. Repository attachment remains optional during shaping. Do not implement code.",
    tickets: 'Continue as the same Mission orchestrator. Tell the user that the requirements are approved and follow the assigned Mission skill to create the backlog. Repository issue-tracker instructions provide labels and publication details only when a tracker is already configured. Mission tickets remain canonical and tracker references remain optional. You may delegate repository research to agents in represented repositories. Do not implement code.',
    implementation: `Implement ONLY ticket ${(run.ticketIndex ?? 0) + 1} in ${run.repositoryPath ?? 'the assigned repository'} for now, until ${product.name} or the user explicitly assigns you another ticket. Read the assigned ticket from its canonical reference when present, including tracker comments and configured label meanings. Mission done flags mean accepted implementation, not tracker issue closure. Read repository instructions and follow its test strategy. Run relevant tests and inspect the actual diff. Leave the ticket as one or more coherent local commits in this mission worktree for review. Do not merge, push, or open a PR. Mark only your ticket done after it meets acceptance; record changed paths, commit SHAs, and exact verification commands/results in submit-mission-result. Do not write the shared Implementation artifact directly; ${product.name} aggregates accepted ticket evidence. If blocked, explain it in the conversation rather than claim completion.`,
    review: 'Review the mission branch changes against the approved requirements and tickets. Inspect actual commits, remaining diffs, and run appropriate checks. Report every actionable issue with workspace.report-mission-review-finding, then write the review artifact and submit a delivery recommendation. After submission succeeds, end with one or two short, natural sentences: say plainly when there are no actionable findings, or state the number reported and invite the user to review them or ask questions. Keep finding details in the structured findings and review artifact; do not imply the Mission is approved or ready to ship. Do not silently fix findings, merge, push, or create a PR. The user controls selection, remediation, and delivery from the workflow.',
    ship: 'Shipping is controlled by the Mission workspace. Do not start an agent run for this stage.',
  };
  const context = [
    `Mission: ${mission.outcome}`,
    `Stage: ${run.stage}.`,
    `Repositories currently represented in the team: ${repositories.length ? repositories.join(', ') : 'none'}. Repository attachment is optional during shaping.`,
    mission.execution?.workspaces?.length
      ? `Mission workspace ${mission.execution.workspaceName ?? ''}:\n${mission.execution.workspaces.map(workspace => `- ${workspace.repositoryPath} -> ${workspace.path} at ${workspace.baseSha ?? 'unavailable'}`).join('\n')}\n${run.stage === 'review'
        ? 'During Review, you may inspect every listed isolated Mission worktree. When remediation is requested, edit only the listed Mission worktree matching each finding repository. Do not edit source checkouts or unrelated worktrees.'
        : 'Work only in your assigned isolated worktree. Do not edit source checkouts or other Mission worktrees.'}`
      : mission.execution?.workspace
        ? `Mission baseline commit: ${mission.execution.workspace.baseSha ?? 'unavailable'}. Work only in the isolated mission worktree: ${mission.execution.workspace.path}. Do not edit the source checkout or other worktrees.`
      : `This stage runs from the ${product.name}-owned mission home. No Git worktree is attached yet.`,
    `This is an explicitly assigned Mission task. Follow repository instructions for project facts and conventions. The ${product.name}-owned Mission skill controls the workflow, stage completion criteria, and handoff. User approval of artifacts and delivery remains required.`,
    'Keep stage conversation concise. Use it for questions, decisions, progress, and blockers; do not restate complete requirements, tickets, or evidence that is already visible in the Mission workspace.',
    instructions[run.stage],
    run.skills.length ? `Use this ${product.name}-owned Mission skill as the authoritative stage procedure: ${run.skills.map(skill => `${skill.name} (${skill.path})`).join(', ')}. Read its SKILL.md before acting. Do not substitute an installed workflow skill or invoke skill setup. Do not push code, open pull requests, or merge.` : 'This stage has no agent-run skill.',
    run.feedback ? `User-provided context and feedback:\n${run.feedback}` : '',
    `Current accepted artifacts:\n${JSON.stringify(mission.artifacts, null, 2)}`,
    `Canonical artifact files:\n${JSON.stringify(mission.artifactFiles, null, 2)}`,
    `Use workspace.list-mission-artifacts and workspace.read-mission-artifact to inspect shared mission work. For Requirements and Review, write your stage artifact with workspace.write-mission-artifact before submitting it. During Tickets, use only workspace.upsert-mission-ticket for ticket content; pass the exact represented repository path for every ticket. During Implementation, submit ticket-scoped changes and verification directly; ${product.name} aggregates the canonical Implementation artifact. These tools are the canonical handoff between mission agents.`,
    `When ready, call workspace.submit-mission-result with summary and the complete artifacts object using the same schema shown above. The active Mission and run are inferred from your authenticated agent identity; do not supply IDs. Update only artifacts belonging to your assigned stage (and only your assigned implementation ticket). ${run.stage === 'implementation' ? 'Implementation evidence is accepted into the aggregate; the user decides when to continue to Review after all tickets finish.' : 'This submits a proposal for user review; it does not approve a stage.'} Do not merely paste the result into chat. Do not claim a stage was approved or a mission completed.`,
  ].filter(Boolean).join('\n\n');
  return `<context>\n${context}\n</context>`;
}
